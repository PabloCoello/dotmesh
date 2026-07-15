/**
 * kernel.ts — integración con ms-toolsai.jupyter para mesh-run
 *
 * Usa el truco del notebook acompañante: por cada documento .md se crea/reutiliza
 * un notebook untitled (tipo "jupyter-notebook"). El notebook se muestra brevemente
 * (showNotebookDocument con preserveFocus: true), se ejecuta una celda bootstrap
 * (notebook.cell.execute), lo que deja userStartedKernel === true en la extensión
 * Jupyter, y desde ahí kernels.getKernel(companionUri) + executeCode(code, token)
 * sirven cada chunk.
 *
 * API verificada en: .ai/tasks/2026-07-15-mesh-run/gate-jupyter-api.md (2026-07-16)
 * Versión mínima requerida: VS Code ^1.87.0, ms-toolsai.jupyter ≥ 2024.1.0.
 *
 * Plan de reserva (@jupyterlab/services): si el truco del acompañante falla en el
 * test manual, la alternativa es lanzar "python -m jupyter_server" como proceso hijo
 * y usar el cliente REST/WebSocket de @jupyterlab/services. Implica añadir
 * dependencias de runtime y gestionar el ciclo de vida del servidor. Documentado en
 * gate-jupyter-api.md, sección "Plan de reserva: @jupyterlab/services".
 */

import * as vscode from 'vscode';
import type { Jupyter, Kernel } from '@vscode/jupyter-extension';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface ExecutionResult {
  /** Líneas de stdout del kernel (print, logging, etc.) y stderr mezclado. */
  stdout: string[];
  /** Repr del último valor evaluado (execute_result, text/plain), o null. */
  repr: string | null;
  /** Traceback completo si hubo error de ejecución, o null. */
  error: string | null;
}

export interface KernelSession {
  execute(code: string): Promise<ExecutionResult>;
}

// ---------------------------------------------------------------------------
// Internos
// ---------------------------------------------------------------------------

interface CompanionEntry {
  /** URI del notebook untitled que actúa de acompañante para este documento. */
  companionUri: vscode.Uri;
}

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 30_000;

// Los mimes reales (verificados en helpers.ts del repo vscode-jupyter) difieren
// de los documentados en api.d.ts; se obtienen siempre por las factorías de VS Code
// para no depender de literales internos.
const STDOUT_MIME = vscode.NotebookCellOutputItem.stdout('').mime;
const STDERR_MIME = vscode.NotebookCellOutputItem.stderr('').mime;
const ERROR_MIME = vscode.NotebookCellOutputItem.error(new Error()).mime;

// ---------------------------------------------------------------------------
// KernelManager
// ---------------------------------------------------------------------------

/**
 * Gestiona un notebook acompañante por cada documento .md abierto.
 * El kernel vive mientras el notebook acompañante esté abierto en VS Code.
 */
export class KernelManager {
  private readonly companions = new Map<string, CompanionEntry>();
  private jupyterApi: Jupyter | undefined;

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  /**
   * Devuelve (o crea) una sesión de kernel para el documento dado.
   * Si el kernel del acompañante ya no está vivo (la pestaña fue cerrada),
   * crea un nuevo acompañante automáticamente.
   */
  async getOrStart(docUri: vscode.Uri): Promise<KernelSession> {
    if (!vscode.workspace.isTrusted) {
      throw new Error(
        'mesh-run: el workspace no es de confianza. ' +
          'Acepta la confianza del workspace para poder ejecutar código.'
      );
    }

    const api = await this.getJupyterApi();
    const key = docUri.toString();
    const existing = this.companions.get(key);

    if (existing) {
      const kernel = await api.kernels.getKernel(existing.companionUri);
      if (kernel) {
        // El acompañante sigue vivo: reutilizamos.
        return new KernelSessionImpl(existing.companionUri, api);
      }
      // El kernel murió (notebook acompañante cerrado); eliminamos la entrada stale.
      this.companions.delete(key);
    }

    // Crear nuevo acompañante y esperar a que el kernel arranque.
    const entry = await this.createCompanion();
    this.companions.set(key, entry);

    const kernel = await this.pollForKernel(api, entry.companionUri);
    if (!kernel) {
      this.companions.delete(key);
      throw new Error(
        'mesh-run: el kernel no arrancó en 30 s. ' +
          'Asegúrate de tener Jupyter instalado y de haber seleccionado un kernel ' +
          'en el notebook acompañante que se ha abierto.'
      );
    }

    return new KernelSessionImpl(entry.companionUri, api);
  }

  /**
   * Descarta la sesión actual para el documento dado.
   * La próxima llamada a getOrStart abrirá un nuevo notebook acompañante
   * (el anterior queda abierto; el usuario puede cerrarlo).
   *
   * Nota: no existe API pública para apagar el kernel directamente ni para
   * cerrar un notebook sin convertirlo primero en el editor activo.
   */
  async restart(docUri: vscode.Uri): Promise<void> {
    const key = docUri.toString();
    this.companions.delete(key);
    vscode.window.showInformationMessage(
      'mesh-run: kernel reiniciado. La próxima ejecución abrirá un nuevo notebook acompañante.'
    );
  }

  /**
   * Libera todos los recursos internos.
   * Los notebooks acompañantes quedan abiertos (sin API para cerrarlos); el
   * usuario puede cerrarlos manualmente.
   */
  dispose(): void {
    this.companions.clear();
    this.jupyterApi = undefined;
  }

  // ---------------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------------

  private async getJupyterApi(): Promise<Jupyter> {
    if (!this.jupyterApi) {
      const ext = vscode.extensions.getExtension<Jupyter>('ms-toolsai.jupyter');
      if (!ext) {
        throw new Error(
          'mesh-run requiere la extensión Jupyter (ms-toolsai.jupyter). ' +
            'Instálala desde el marketplace de VS Code.'
        );
      }
      this.jupyterApi = ext.isActive ? ext.exports : await ext.activate();
    }
    // La asignación dentro del if deja jupyterApi como Jupyter | undefined para
    // el compilador; la aserción es correcta porque el if garantiza la asignación.
    return this.jupyterApi!;
  }

  /**
   * Crea un notebook untitled, lo muestra brevemente y ejecuta la celda bootstrap.
   * Esto es lo que deja userStartedKernel === true en la extensión Jupyter.
   *
   * showNotebookDocument (preserveFocus: true) es obligatorio antes de
   * notebook.cell.execute: el comando resuelve el editor desde los panes visibles
   * y devuelve false si no hay ninguno (vscode-jupyter, notebookKernelView.ts,
   * getEditorFromContext, líneas 24-40).
   */
  private async createCompanion(): Promise<CompanionEntry> {
    const bootstrapCell = new vscode.NotebookCellData(
      vscode.NotebookCellKind.Code,
      '# mesh-run companion\npass',
      'python'
    );
    const notebookDoc = await vscode.workspace.openNotebookDocument(
      'jupyter-notebook',
      new vscode.NotebookData([bootstrapCell])
    );

    // El notebook debe ser visible para que notebook.cell.execute pueda usarlo.
    // preserveFocus: true mantiene el foco en el documento original del usuario.
    await vscode.window.showNotebookDocument(notebookDoc, { preserveFocus: true });

    // Ejecuta la celda bootstrap: esto activa el picker de kernel si es la primera
    // vez, y a continuación arranca el kernel dejando userStartedKernel === true.
    await vscode.commands.executeCommand('notebook.cell.execute', {
      ranges: [{ start: 0, end: 1 }],
      document: notebookDoc.uri,
    });

    return { companionUri: notebookDoc.uri };
  }

  /**
   * Sondea getKernel hasta que devuelve un kernel (o expira el timeout).
   * Necesario porque userStartedKernel se establece de forma asíncrona durante
   * la ejecución de la celda bootstrap.
   */
  private async pollForKernel(
    api: Jupyter,
    companionUri: vscode.Uri
  ): Promise<Kernel | undefined> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const kernel = await api.kernels.getKernel(companionUri);
      if (kernel) {
        return kernel;
      }
      await delay(POLL_INTERVAL_MS);
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// KernelSessionImpl
// ---------------------------------------------------------------------------

class KernelSessionImpl implements KernelSession {
  constructor(
    private readonly companionUri: vscode.Uri,
    private readonly api: Jupyter
  ) {}

  async execute(code: string): Promise<ExecutionResult> {
    // Re-obtener el kernel en cada ejecución: el acompañante puede haber sido
    // cerrado entre llamadas (reinicio, cierre manual de la pestaña).
    const kernel = await this.api.kernels.getKernel(this.companionUri);
    if (!kernel) {
      throw new Error(
        'mesh-run: el kernel ya no está disponible (el notebook acompañante fue cerrado). ' +
          'Usa "Mesh Run: Reiniciar kernel" para arrancar uno nuevo.'
      );
    }

    const textDecoder = new TextDecoder();

    // Acumuladores de texto: stdout y stderr se mezclan en el mismo buffer
    // (stderr → stdout[] según especificación de la Tarea 4 del plan).
    let outputText = '';
    let lastValueRepr: string | null = null;
    let errorText: string | null = null;

    const cts = new vscode.CancellationTokenSource();
    try {
      for await (const output of kernel.executeCode(code, cts.token)) {
        // metadata.outputType conserva el output_type de Jupyter (stream,
        // execute_result, display_data, error). Contrato verificado en
        // vscode-jupyter src/kernels/execution/helpers.ts, líneas 166-190.
        const meta = output.metadata as
          | {
              outputType?: string;
              originalError?: {
                ename: string;
                evalue: string;
                traceback: string[];
              };
            }
          | undefined;

        for (const item of output.items) {
          if (item.mime === STDOUT_MIME) {
            outputText += textDecoder.decode(item.data);
          } else if (item.mime === STDERR_MIME) {
            // stderr se mezcla en el buffer de texto de salida.
            outputText += textDecoder.decode(item.data);
          } else if (item.mime === ERROR_MIME) {
            // Traceback crudo (con códigos ANSI) disponible en originalError.traceback.
            // El JSON del item contiene {name, message, stack} donde stack es el
            // traceback unido por '\n' (helpers.ts línea 545).
            if (meta?.originalError?.traceback?.length) {
              errorText = meta.originalError.traceback.join('\n');
            } else {
              const parsed = JSON.parse(textDecoder.decode(item.data)) as {
                name: string;
                message: string;
                stack?: string;
              };
              errorText = parsed.stack ?? `${parsed.name}: ${parsed.message}`;
            }
          } else if (
            meta?.outputType === 'execute_result' &&
            item.mime === 'text/plain'
          ) {
            // Repr del último valor evaluado.
            // display_data también puede tener text/plain pero su outputType es
            // 'display_data', no 'execute_result'; se ignora en este MVP.
            lastValueRepr = textDecoder.decode(item.data);
          }
          // display_data y otros tipos de mime se ignoran en el MVP.
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'vscode.jupyter.apiAccessRevoked') {
        // Este error name es estable por contrato (kernel.ts líneas 41-50 en
        // vscode-jupyter: "This name should never be changed as extensions can
        // rely on this").
        vscode.window.showErrorMessage(
          'mesh-run: acceso al kernel revocado. ' +
            'Usa "Jupyter: Manage Access To Jupyter Kernels" en la paleta de ' +
            'comandos para volver a conceder acceso a mesh-run.'
        );
        throw err;
      }
      throw err;
    } finally {
      cts.dispose();
    }

    // Dividir el texto acumulado en líneas, eliminando solo el salto final
    // (print("hello") produce "hello\n"; queremos ["hello"], no ["hello", ""]).
    const stdout = splitOutputLines(outputText);

    return { stdout, repr: lastValueRepr, error: errorText };
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/**
 * Divide texto de salida en líneas.
 * Elimina el salto de línea final para que print("a") → ["a"] y no ["a", ""].
 * Los saltos de línea intermedios se preservan como separadores.
 */
function splitOutputLines(text: string): string[] {
  if (!text) {
    return [];
  }
  const stripped = text.endsWith('\n') ? text.slice(0, -1) : text;
  return stripped.split('\n');
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

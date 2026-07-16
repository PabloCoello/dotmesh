/**
 * kernel.ts — integración con ms-toolsai.jupyter para mesh-run
 *
 * Usa el truco del notebook acompañante: por cada documento .md se crea/reutiliza
 * un notebook untitled con nombre derivado del .md ("analisis.md" → pestaña
 * "analisis.ipynb"; ver companion.ts). El notebook se muestra brevemente
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
import * as path from 'node:path';
import type { Jupyter, Kernel } from '@vscode/jupyter-extension';
import { splitOutputLines, stripAnsi } from './lines.js';
import { companionFileName } from './companion.js';

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
  /** URI del documento .md al que pertenece este acompañante (para el lookup inverso). */
  docUri: vscode.Uri;
}

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 30_000;

// Los mimes reales (verificados en helpers.ts del repo vscode-jupyter) difieren
// de los documentados en api.d.ts; se obtienen siempre por las factorías de VS Code
// para no depender de literales internos.
const STDOUT_MIME = vscode.NotebookCellOutputItem.stdout('').mime;
const STDERR_MIME = vscode.NotebookCellOutputItem.stderr('').mime;
const ERROR_MIME = vscode.NotebookCellOutputItem.error(new Error()).mime;

// Mensaje reutilizado en getOrStart y en execute() al detectar companion cerrado.
const COMPANION_CLOSED_MSG =
  'mesh-run: el notebook acompañante fue cerrado; ' +
  'el estado del kernel se ha perdido. Recreando...';

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

  /**
   * Nombres de acompañante reservados por creaciones aún en vuelo.
   *
   * Cierra una carrera: la cola de extension.ts serializa por documento, pero
   * dos documentos DISTINTOS con el mismo basename pueden entrar en
   * createCompanion a la vez. Sin reserva, ambos capturarían el mismo snapshot
   * de notebookDocuments (el acompañante del primero aún no existe), elegirían
   * el mismo nombre y openNotebookDocument devolvería al segundo el notebook
   * del primero: dos documentos compartiendo kernel. La elección y la reserva
   * del nombre son síncronas (sin await entre medias), lo que hace imposible
   * esa colisión.
   */
  private readonly reservedCompanionNames = new Set<string>();

  /**
   * Emitido (con undefined = refrescar todo) cuando se crea, recrea o elimina
   * un acompañante. CompanionDecorationProvider lo conecta a
   * onDidChangeFileDecorations para refrescar la insignia de la pestaña.
   * Se emite con undefined en todos los casos (más simple que emitir URIs
   * individuales; la lista de acompañantes es siempre pequeña).
   */
  private readonly _onDidChangeCompanions = new vscode.EventEmitter<vscode.Uri | undefined>();
  public readonly onDidChangeCompanions: vscode.Event<vscode.Uri | undefined> =
    this._onDidChangeCompanions.event;

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  /**
   * Devuelve (o crea) una sesión de kernel para el documento dado.
   * Si el acompañante fue cerrado entre llamadas, lo recrea automáticamente.
   *
   * @param token Token de cancelación opcional. Si se cancela durante el arranque
   *   del kernel (fase de polling), se lanza vscode.CancellationError inmediatamente
   *   sin esperar a agotar el timeout de 30 s. Nota conocida: si el usuario cancela
   *   el picker de kernel sin seleccionar ninguno, el polling sigue hasta que el
   *   token se cancele (o expire el timeout si no hay token).
   *
   * @precondition Las llamadas para el mismo `docUri` deben llegar serializadas.
   *   extension.ts garantiza esto con su cola por URI. KernelManager no se protege
   *   internamente contra llamadas concurrentes sobre el mismo documento.
   */
  async getOrStart(
    docUri: vscode.Uri,
    token?: vscode.CancellationToken
  ): Promise<KernelSession> {
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
      if (!this.isCompanionOpen(existing.companionUri)) {
        // El usuario cerró la pestaña: el kernel se perdió.
        vscode.window.showInformationMessage(COMPANION_CLOSED_MSG);
        this.companions.delete(key);
        this._onDidChangeCompanions.fire(undefined);
        // cae al bloque de creación
      } else {
        const kernel = await api.kernels.getKernel(existing.companionUri);
        if (kernel) {
          return new KernelSessionImpl(existing.companionUri, api, this, key);
        }
        // Kernel muerto aunque el notebook sigue abierto (caso borde).
        this.companions.delete(key);
        this._onDidChangeCompanions.fire(undefined);
      }
    }

    // Captura el editor activo antes de mostrar el acompañante para poder restaurarlo.
    const originalEditor = vscode.window.activeTextEditor;

    // Crear nuevo acompañante y esperar a que el kernel arranque.
    const companionUri = await this.createCompanion(docUri);
    this.companions.set(key, { companionUri, docUri });
    this._onDidChangeCompanions.fire(undefined);

    const kernel = await this.pollForKernel(api, companionUri, token);
    if (!kernel) {
      this.companions.delete(key);
      this._onDidChangeCompanions.fire(undefined);
      throw new Error(
        'mesh-run: el kernel no arrancó en 30 s. ' +
          'Asegúrate de tener Jupyter instalado y de haber seleccionado un kernel ' +
          'en el notebook acompañante que se ha abierto.'
      );
    }

    // Kernel confirmado: ancla el acompañante y devuelve el foco al .md.
    await this.pinAndRestoreFocus(companionUri, originalEditor);
    return new KernelSessionImpl(companionUri, api, this, key);
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
    this._onDidChangeCompanions.fire(undefined);
    vscode.window.showInformationMessage(
      'mesh-run: kernel reiniciado. La próxima ejecución abrirá un nuevo notebook acompañante.'
    );
  }

  /**
   * Devuelve el URI del documento .md cuyo acompañante es el notebook dado,
   * o undefined si el URI no corresponde a ningún acompañante activo.
   * Solo lee el Map interno; no introduce concurrencia nueva.
   *
   * @precondition Solo lectura: no modifica el estado interno. Puede llamarse
   *   desde cualquier contexto, incluido FileDecorationProvider.provideFileDecoration.
   */
  public getCompanionDoc(companionUri: vscode.Uri): vscode.Uri | undefined {
    const target = companionUri.toString();
    for (const entry of this.companions.values()) {
      if (entry.companionUri.toString() === target) {
        return entry.docUri;
      }
    }
    return undefined;
  }

  /**
   * Libera todos los recursos internos.
   * Los notebooks acompañantes quedan abiertos (sin API para cerrarlos); el
   * usuario puede cerrarlos manualmente.
   */
  dispose(): void {
    this.companions.clear();
    this.reservedCompanionNames.clear();
    this._onDidChangeCompanions.fire(undefined);
    this._onDidChangeCompanions.dispose();
    this.jupyterApi = undefined;
  }

  // ---------------------------------------------------------------------------
  // Internos (accesibles desde KernelSessionImpl para la recuperación)
  // ---------------------------------------------------------------------------

  /**
   * Elimina la entrada del Map, crea un nuevo acompañante y espera al kernel.
   * Llamado por KernelSessionImpl.execute() cuando getKernel devuelve undefined
   * a mitad de sesión (el acompañante fue cerrado entre ejecuciones).
   * Un único intento: si el nuevo kernel tampoco arranca, lanza.
   *
   * @precondition Las llamadas para el mismo `key` deben llegar serializadas.
   *   KernelManager no se protege internamente contra concurrencia por documento.
   */
  async recreateCompanion(
    key: string,
    token?: vscode.CancellationToken
  ): Promise<vscode.Uri> {
    const originalEditor = vscode.window.activeTextEditor;
    this.companions.delete(key);
    this._onDidChangeCompanions.fire(undefined);
    const api = await this.getJupyterApi();
    // Reconstruir el docUri desde la clave de cadena.
    const docUri = vscode.Uri.parse(key);
    const companionUri = await this.createCompanion(docUri);
    this.companions.set(key, { companionUri, docUri });
    this._onDidChangeCompanions.fire(undefined);
    const kernel = await this.pollForKernel(api, companionUri, token);
    if (!kernel) {
      this.companions.delete(key);
      this._onDidChangeCompanions.fire(undefined);
      throw new Error(
        'mesh-run: el kernel no arrancó al recrear el acompañante. ' +
          'Intenta "Mesh Run: Reiniciar kernel" si el problema persiste.'
      );
    }
    await this.pinAndRestoreFocus(companionUri, originalEditor);
    return companionUri;
  }

  // ---------------------------------------------------------------------------
  // Privados
  // ---------------------------------------------------------------------------

  /**
   * Ancla la pestaña del acompañante y devuelve el foco al editor original.
   *
   * workbench.action.pinEditor acepta una URI como contexto y resuelve el editor
   * sin necesidad de que sea el activo (vscode-main editorCommandsContext.ts,
   * resolveCommandsContext líneas 106-127). Si falla por cualquier razón, se deja
   * pasar con console.warn: el pin es mejora de UX, no requisito funcional.
   *
   * Debe llamarse DESPUÉS de que pollForKernel confirme el kernel, mientras el
   * acompañante sigue en el editor group (solo se destruye al cerrar la pestaña).
   */
  private async pinAndRestoreFocus(
    companionUri: vscode.Uri,
    originalEditor: vscode.TextEditor | undefined
  ): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.action.pinEditor', companionUri);
    } catch (e) {
      console.warn('mesh-run: no se pudo fijar la pestaña del acompañante:', e);
    }
    if (originalEditor) {
      try {
        await vscode.window.showTextDocument(originalEditor.document, {
          viewColumn: originalEditor.viewColumn,
          preserveFocus: false,
        });
      } catch (e) {
        console.warn('mesh-run: no se pudo restaurar el foco al documento original:', e);
      }
    }
  }

  /**
   * Comprueba si el notebook acompañante sigue abierto en el workspace.
   * vscode.workspace.notebookDocuments solo contiene los documentos actualmente
   * abiertos; un notebook cerrado desaparece de esta lista.
   */
  private isCompanionOpen(companionUri: vscode.Uri): boolean {
    return vscode.workspace.notebookDocuments.some(
      nd => nd.uri.toString() === companionUri.toString()
    );
  }

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
    return this.jupyterApi!; // asignación garantizada arriba; tsc no infiere campos de clase
  }

  /**
   * Crea el notebook acompañante untitled con nombre derivado del .md
   * ("analisis.md" → pestaña "analisis.ipynb"), lo muestra brevemente y
   * ejecuta la celda bootstrap. Esto es lo que deja userStartedKernel === true
   * en la extensión Jupyter.
   *
   * El untitled con nombre se abre con openNotebookDocument(uri): el scheme
   * 'untitled' está contemplado en $tryOpenNotebook (vscode-main,
   * mainThreadNotebookDocuments.ts líneas 156-170) y el viewType se infiere
   * del patrón *.ipynb → jupyter-notebook (notebookEditorModelResolverServiceImpl.ts,
   * validateResourceViewType, líneas 205-230). El documento abre VACÍO: la
   * celda bootstrap se inserta después con NotebookEdit, lo que además lo deja
   * dirty (mismo efecto que el antiguo dirty-at-birth con NotebookData: la
   * pestaña no es reutilizable como preview y pide confirmación al cerrar).
   *
   * openNotebookDocument(uri) devuelve el documento YA ABIERTO si la URI
   * coincide; companionFileName desambigua con sufijo -N contra los untitled
   * abiertos para que un restart o dos .md homónimos no compartan acompañante.
   *
   * showNotebookDocument (preserveFocus: true) es obligatorio antes de
   * notebook.cell.execute: el comando resuelve el editor desde los panes visibles
   * y devuelve false si no hay ninguno (vscode-jupyter, notebookKernelView.ts,
   * getEditorFromContext, líneas 24-40).
   */
  private async createCompanion(docUri: vscode.Uri): Promise<vscode.Uri> {
    // Elección y reserva del nombre en un solo tramo síncrono (ver
    // reservedCompanionNames). El finally libera la reserva cuando el
    // acompañante ya figura en notebookDocuments (o si la creación falló).
    const taken = new Set([
      ...vscode.workspace.notebookDocuments
        .filter(nd => nd.uri.scheme === 'untitled')
        .map(nd => path.posix.basename(nd.uri.path)),
      ...this.reservedCompanionNames,
    ]);
    const name = companionFileName(path.posix.basename(docUri.path), taken);
    this.reservedCompanionNames.add(name);

    try {
      const notebookDoc = await vscode.workspace.openNotebookDocument(
        vscode.Uri.from({ scheme: 'untitled', path: name })
      );

      const bootstrapCell = new vscode.NotebookCellData(
        vscode.NotebookCellKind.Code,
        '# mesh-run companion\npass',
        'python'
      );
      // replaceCells sobre todo el rango: deja exactamente la celda bootstrap
      // tanto si el untitled abre vacío como si abre con una celda por defecto.
      const edit = new vscode.WorkspaceEdit();
      edit.set(notebookDoc.uri, [
        vscode.NotebookEdit.replaceCells(
          new vscode.NotebookRange(0, notebookDoc.cellCount),
          [bootstrapCell]
        ),
      ]);
      if (!(await vscode.workspace.applyEdit(edit))) {
        throw new Error(
          'mesh-run: no se pudo insertar la celda bootstrap en el notebook acompañante.'
        );
      }

      // El notebook debe ser visible para que notebook.cell.execute pueda usarlo.
      // preserveFocus: true mantiene el foco en el documento original del usuario.
      // preview: false evita que VS Code lo trate como pestaña de vista previa reutilizable
      // (aunque el dirty tras insertar la celda ya lo impide, se hace explícito por claridad).
      await vscode.window.showNotebookDocument(notebookDoc, { preserveFocus: true, preview: false });

      // Ejecuta la celda bootstrap: esto activa el picker de kernel si es la primera
      // vez, y a continuación arranca el kernel dejando userStartedKernel === true.
      await vscode.commands.executeCommand('notebook.cell.execute', {
        ranges: [{ start: 0, end: 1 }],
        document: notebookDoc.uri,
      });

      return notebookDoc.uri;
    } finally {
      this.reservedCompanionNames.delete(name);
    }
  }

  /**
   * Sondea getKernel hasta que devuelve un kernel, expira el timeout o se cancela.
   * Necesario porque userStartedKernel se establece de forma asíncrona durante
   * la ejecución de la celda bootstrap.
   *
   * Lanza vscode.CancellationError si token se cancela durante la espera,
   * sin aguardar al próximo intervalo.
   */
  private async pollForKernel(
    api: Jupyter,
    companionUri: vscode.Uri,
    token?: vscode.CancellationToken
  ): Promise<Kernel | undefined> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (token?.isCancellationRequested) {
        throw new vscode.CancellationError();
      }
      const kernel = await api.kernels.getKernel(companionUri);
      if (kernel) {
        return kernel;
      }
      await delay(POLL_INTERVAL_MS, token);
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// KernelSessionImpl
// ---------------------------------------------------------------------------

class KernelSessionImpl implements KernelSession {
  constructor(
    /** Mutable: se actualiza cuando execute() recrea el acompañante. */
    private companionUri: vscode.Uri,
    private readonly api: Jupyter,
    private readonly manager: KernelManager,
    private readonly docKey: string
  ) {}

  async execute(code: string): Promise<ExecutionResult> {
    // Re-obtener el kernel en cada ejecución: detecta si el acompañante fue cerrado
    // entre llamadas y lo recrea (un único intento, sin bucle).
    let kernel = await this.api.kernels.getKernel(this.companionUri);
    if (!kernel) {
      vscode.window.showInformationMessage(COMPANION_CLOSED_MSG);
      this.companionUri = await this.manager.recreateCompanion(this.docKey);
      kernel = await this.api.kernels.getKernel(this.companionUri);
      if (!kernel) {
        throw new Error(
          'mesh-run: el kernel no está disponible tras recrear el acompañante. ' +
            'Intenta "Mesh Run: Reiniciar kernel" si el problema persiste.'
        );
      }
    }

    const textDecoder = new TextDecoder();

    // stdout y stderr se acumulan en el mismo buffer: stderr va a stdout[]
    // por decisión de la Tarea 4 del plan.
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

        // Outputs ignorados deliberadamente en el MVP:
        //   display_data — puede portar mimes ricos (text/html, image/png) que no
        //     tienen representación natural en un bloque Markdown de texto plano.
        //   Items con mimes no contemplados (text/html, image/svg+xml, etc.) — mismo
        //     motivo; se omiten sin error.
        //   Outputs con items vacíos — no hay contenido que acumular.
        for (const item of output.items) {
          if (item.mime === STDOUT_MIME) {
            // stripAnsi: print() con colores (colorama, rich, etc.) contaminaría el bloque.
            outputText += stripAnsi(textDecoder.decode(item.data));
          } else if (item.mime === STDERR_MIME) {
            outputText += stripAnsi(textDecoder.decode(item.data));
          } else if (item.mime === ERROR_MIME) {
            // Los tracebacks de Jupyter llevan códigos ANSI (ESC[31m, ESC[36m, etc.).
            // stripAnsi los elimina antes de escribir en el documento Markdown.
            if (meta?.originalError?.traceback?.length) {
              errorText = stripAnsi(meta.originalError.traceback.join('\n'));
            } else {
              // Fallback: data = JSON {name, message, stack} (stack = traceback unido por '\n').
              const parsed = JSON.parse(textDecoder.decode(item.data)) as {
                name: string;
                message: string;
                stack?: string;
              };
              errorText = stripAnsi(
                parsed.stack ?? `${parsed.name}: ${parsed.message}`
              );
            }
          } else if (
            meta?.outputType === 'execute_result' &&
            item.mime === 'text/plain'
          ) {
            // Repr del último valor evaluado. display_data puede tener text/plain
            // pero con outputType 'display_data', no 'execute_result'; se ignora.
            lastValueRepr = stripAnsi(textDecoder.decode(item.data));
          }
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
      if (err instanceof vscode.CancellationError) {
        throw err;
      }

      // Distingue error de ejecución del usuario (devuelve result.error, sin pop-up)
      // de error de infraestructura (relanza, extension.ts muestra el pop-up).
      //
      // Señales que indican error de ejecución del usuario:
      //   (a) Ya llegó un item con mime ERROR_MIME durante el bucle → errorText != null.
      //       El iterador puede lanzar igualmente tras entregar el item; lo ignoramos.
      //   (b) La excepción trae originalError.traceback (array no vacío): algunos
      //       contextos de Jupyter envían el traceback como excepción en lugar de item.
      //
      // Cualquier otra excepción (kernel muerto, WebSocket caído, etc.) es
      // infraestructura: se relanza para que extension.ts muestre el pop-up y NO
      // toque el documento con un bloque "# Error" que parecería error de Python.
      const withMeta =
        err instanceof Error
          ? (err as Error & { originalError?: { traceback: string[] } })
          : undefined;

      if (errorText !== null) {
        // (a) traceback ya procesado desde el item de mime; el iterador lanzó después.
      } else if (withMeta?.originalError?.traceback?.length) {
        // (b) error de ejecución enviado como excepción con originalError.traceback.
        errorText = stripAnsi(withMeta.originalError.traceback.join('\n'));
      } else {
        // Infraestructura: relanzamos tal cual.
        throw err;
      }
    } finally {
      cts.dispose();
    }

    const stdout = splitOutputLines(outputText);
    return { stdout, repr: lastValueRepr, error: errorText };
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/**
 * Espera ms milisegundos. Si token se cancela antes de que expire el temporizador,
 * limpia el timeout y rechaza con CancellationError de inmediato.
 */
function delay(ms: number, token?: vscode.CancellationToken): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (token) {
      const sub = token.onCancellationRequested(() => {
        clearTimeout(timer);
        sub.dispose();
        reject(new vscode.CancellationError());
      });
    }
  });
}

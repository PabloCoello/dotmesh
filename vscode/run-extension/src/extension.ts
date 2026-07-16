import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as path from 'node:path';
import { computeOutputStates } from './stale.js';
import { KernelManager } from './kernel.js';
import type { ExecutionResult } from './kernel.js';
import { parseChunks, parseOutputs } from './parser.js';
import type { ParsedChunk, ParsedOutput } from './parser.js';
import { chunkHash } from './hash.js';
import { computeLensSpecs } from './lenses.js';
import { truncateOutput, buildOutputBlock, replaceOrInsertOutputBlock } from './writer.js';
import { reanchorAfterReplace } from './reanchor.js';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Cola de ejecución por documento (serialización de ejecuciones concurrentes)
// ---------------------------------------------------------------------------

/**
 * Una entrada por URI de documento. Cada tarea espera a la anterior antes de
 * comenzar; si una falla, la siguiente se ejecuta igualmente.
 */
const executionQueues = new Map<string, Promise<void>>();

function enqueue(docUri: vscode.Uri, task: () => Promise<void>): void {
  const key = docUri.toString();
  const current = executionQueues.get(key) ?? Promise.resolve();
  const next = current
    .catch(() => undefined) // absorber error del anterior para que el siguiente ejecute
    .then(() =>
      task().catch(err => {
        console.error('mesh-run: error en cola de ejecución:', err);
      }),
    )
    .then(() => {
      // Limpiar la entrada si esta promesa sigue siendo la cabeza de la cola,
      // evitando que el Map crezca indefinidamente con promesas ya resueltas.
      if (executionQueues.get(key) === next) {
        executionQueues.delete(key);
      }
    });
  executionQueues.set(key, next);
}

// ---------------------------------------------------------------------------
// Activate / Deactivate
// ---------------------------------------------------------------------------

/**
 * Punto de entrada de la extensión.
 *
 * Estructura deliberada para que la Tarea 5 (CodeLens + comandos) pueda
 * añadir su lógica sin reescribir esta función:
 * - Los decoration types se crean una vez y se registran en
 *   context.subscriptions para que VS Code los libere automáticamente.
 * - El cableado de cada funcionalidad va en una función separada
 *   (registerStaleDecorations, registerCodeLens, registerCommands) que recibe
 *   context y los recursos compartidos como parámetros.
 */
export function activate(context: vscode.ExtensionContext): void {
  // Decoration types — creados una vez, reutilizados en todos los editores.
  // Se usan ThemeColor para respetar el tema activo; nunca colores hardcodeados.
  const staleDecorationType = vscode.window.createTextEditorDecorationType({
    // Borde izquierdo de advertencia
    borderWidth: '0 0 0 3px',
    borderStyle: 'solid',
    borderColor: new vscode.ThemeColor('editorWarning.foreground'),
    overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });

  const errorDecorationType = vscode.window.createTextEditorDecorationType({
    // Borde izquierdo de error
    borderWidth: '0 0 0 3px',
    borderStyle: 'solid',
    borderColor: new vscode.ThemeColor('editorError.foreground'),
    overviewRulerColor: new vscode.ThemeColor('editorError.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });

  // Registrar en subscriptions garantiza dispose al desactivar la extensión
  context.subscriptions.push(staleDecorationType, errorDecorationType);

  // KernelManager — una instancia compartida por todos los comandos
  const kernelManager = new KernelManager();
  context.subscriptions.push({ dispose: () => kernelManager.dispose() });

  // Decorador de insignia para las pestañas de los notebooks acompañantes.
  // Se registra después del KernelManager para que el emitter ya exista.
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(
      new CompanionDecorationProvider(kernelManager),
    ),
  );

  registerStaleDecorations(context, staleDecorationType, errorDecorationType);
  registerCodeLens(context);
  registerCommands(context, kernelManager);
}

export function deactivate(): void {
  // Los recursos registrados en context.subscriptions se liberan
  // automáticamente por VS Code al desactivar; no se requiere nada aquí.
}

// ---------------------------------------------------------------------------
// Decoraciones de obsolescencia
// ---------------------------------------------------------------------------

/**
 * Registra los listeners que mantienen las decoraciones de stale/error
 * actualizadas en los editores markdown abiertos.
 *
 * Debounce de 150 ms sobre onDidChangeTextDocument para no parsear en cada
 * pulsación de tecla individual, cumpliendo el criterio de < 500 ms.
 * onDidChangeActiveTextEditor aplica inmediatamente (no hay texto en vuelo).
 */
function registerStaleDecorations(
  context: vscode.ExtensionContext,
  staleDecorationType: vscode.TextEditorDecorationType,
  errorDecorationType: vscode.TextEditorDecorationType,
): void {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Recalcula y pinta las decoraciones en el editor dado.
   * Solo actúa en documentos markdown; limpia las decoraciones en cualquier
   * otro tipo de documento para no dejar rastros si el usuario cambia de
   * fichero dentro del mismo grupo de editor.
   */
  function applyDecorations(editor: vscode.TextEditor): void {
    const doc = editor.document;

    if (doc.languageId !== 'markdown') {
      // Limpiar por si el usuario abría antes un markdown en el mismo panel
      editor.setDecorations(staleDecorationType, []);
      editor.setDecorations(errorDecorationType, []);
      return;
    }

    // getText() y positionAt() son operaciones síncronas sobre el mismo
    // TextDocument. Toda esta función es síncrona (sin await), por lo que el
    // motor de JavaScript garantiza que el documento no puede cambiar entre
    // doc.getText() y doc.positionAt(): ambas operaciones ven exactamente el
    // mismo snapshot. No se requiere validación defensiva de offsets ni clamps.
    const text = doc.getText();
    const states = computeOutputStates(text);

    const staleRanges: vscode.Range[] = [];
    const errorRanges: vscode.Range[] = [];

    for (const { startOffset, endOffset, state } of states) {
      if (state === 'fresh') continue;
      const range = new vscode.Range(
        doc.positionAt(startOffset),
        doc.positionAt(endOffset),
      );
      if (state === 'stale') {
        staleRanges.push(range);
      } else {
        errorRanges.push(range);
      }
    }

    editor.setDecorations(staleDecorationType, staleRanges);
    editor.setDecorations(errorDecorationType, errorRanges);
  }

  /** Programa applyDecorations con debounce de 150 ms. */
  function scheduleDecorations(editor: vscode.TextEditor): void {
    // clearTimeout(undefined) es un no-op en JavaScript; la guarda es redundante.
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      // El editor puede haber sido cerrado mientras el timer estaba pendiente.
      // vscode.window.visibleTextEditors incluye todos los grupos; si el editor
      // ya no está ahí, setDecorations sobre él sería un comportamiento indefinido.
      if (!vscode.window.visibleTextEditors.includes(editor)) return;
      applyDecorations(editor);
    }, 150);
  }

  // Al cambiar el editor activo: cancelar el debounce pendiente del editor
  // anterior y aplicar inmediatamente en el nuevo.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
      if (editor) {
        applyDecorations(editor);
      }
    }),
  );

  // Al modificar el documento activo: debounce para absorber pulsaciones
  // de teclas consecutivas.
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === event.document) {
        scheduleDecorations(editor);
      }
    }),
  );

  // Liberar el timer si la extensión se desactiva mientras hay uno pendiente
  context.subscriptions.push({
    dispose: () => {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    },
  });

  // Aplicar al editor activo en el momento de la activación de la extensión
  const initialEditor = vscode.window.activeTextEditor;
  if (initialEditor) {
    applyDecorations(initialEditor);
  }
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

/**
 * Detecta el git root ejecutando `git rev-parse --show-toplevel` desde el
 * directorio del documento.
 *
 * Seguridad (precondición obligatoria antes de llamar a reanchorAfterReplace):
 * - Comprueba que vscode.workspace.getWorkspaceFolder existe; devuelve null si no.
 * - Rechaza explícitamente null y cadena vacía (git rev-parse no produce vacío en
 *   repos válidos, pero se defiende igualmente).
 */
async function getGitRootForDoc(document: vscode.TextDocument): Promise<string | null> {
  // Precondición de seguridad: sin carpeta de workspace no hay contexto de repo
  if (!vscode.workspace.getWorkspaceFolder(document.uri)) {
    return null;
  }
  // URIs virtuales (git://, untitled://, vscode-notebook-cell://, etc.) no tienen
  // ruta de sistema de ficheros válida; execFile con un cwd inválido fallaría con
  // un error confuso. Solo procesamos URIs de fichero real.
  if (document.uri.scheme !== 'file') {
    return null;
  }

  const fromDir = path.dirname(document.uri.fsPath);
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--show-toplevel'],
      { cwd: fromDir },
    );
    const root = stdout.trim();
    // Rechazar cadena vacía (comportamiento defensivo; git no produce vacío para repos válidos)
    return root || null;
  } catch (err) {
    console.warn('mesh-run: git rev-parse falló; el re-anclaje quedará deshabilitado:', err);
    return null;
  }
}

/**
 * Devuelve el primer editor visible que muestra el documento dado, o undefined.
 */
function getEditorForDoc(document: vscode.TextDocument): vscode.TextEditor | undefined {
  return vscode.window.visibleTextEditors.find(e => e.document === document);
}

/**
 * Aplica la edición de reemplazo o inserción del bloque de salida en el editor.
 *
 * Los offsets de `chunk` y `existingOutput` se calcularon sobre `baseText`.
 * VS Code devuelve false si el documento cambió de forma incompatible; en ese
 * caso el llamador debe reintentar re-parseando el snapshot actual.
 *
 * `{ undoStopBefore: true, undoStopAfter: true }` garantiza que cada ejecución
 * es una entrada independiente en la pila de deshacer.
 */
async function applyOutputEdit(
  editor: vscode.TextEditor,
  document: vscode.TextDocument,
  chunk: ParsedChunk,
  existingOutput: ParsedOutput | undefined,
  newOutputBlock: string,
  baseText: string,
): Promise<boolean> {
  return editor.edit(
    editBuilder => {
      if (existingOutput !== undefined) {
        // Reemplazo: sustituir exactamente el rango del bloque anterior
        editBuilder.replace(
          new vscode.Range(
            document.positionAt(existingOutput.startOffset),
            document.positionAt(existingOutput.endOffset),
          ),
          newOutputBlock,
        );
      } else {
        // Inserción: justo después del cierre del chunk
        const E = chunk.endOffset;
        if (E >= baseText.length) {
          // El chunk cierra el fichero sin \n final: añadir dos saltos al final
          editBuilder.insert(document.positionAt(E), '\n\n' + newOutputBlock + '\n');
        } else {
          // text[E] === '\n': conservar ese \n e insertar la línea en blanco + bloque
          editBuilder.insert(document.positionAt(E + 1), '\n' + newOutputBlock + '\n');
        }
      }
    },
    { undoStopBefore: true, undoStopAfter: true },
  );
}

// ---------------------------------------------------------------------------
// Decoraciones de pestaña del acompañante
// ---------------------------------------------------------------------------

/**
 * Decora las pestañas de los notebooks acompañantes de mesh-run con una insignia
 * de dos caracteres que identifica el documento .md al que pertenecen.
 *
 * Monograma: las dos primeras letras del basename del .md sin extensión, en
 * mayúsculas (p. ej. "analisis.md" → "AN"). Se elige este esquema porque es
 * visible en la anchura estándar del badge (~2 chars), reconocible de un vistazo
 * y no requiere iconos ni colores de tema adicionales.
 *
 * Sin color: no se fuerza ningún ThemeColor para no interferir con la paleta del
 * tema activo del usuario; el badge de texto es suficiente señal visual.
 */
class CompanionDecorationProvider implements vscode.FileDecorationProvider {
  readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | undefined>;

  constructor(private readonly manager: KernelManager) {
    this.onDidChangeFileDecorations = manager.onDidChangeCompanions;
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const docUri = this.manager.getCompanionDoc(uri);
    if (!docUri) {
      return undefined;
    }
    // Monograma: primeras 2 letras del basename sin extensión, en mayúsculas.
    const base = path.basename(docUri.fsPath, path.extname(docUri.fsPath));
    const badge = base.slice(0, 2).toUpperCase();
    return {
      badge,
      tooltip: `mesh-run: kernel de ${path.basename(docUri.fsPath)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// CodeLens
// ---------------------------------------------------------------------------

/**
 * CodeLens de mesh-run, calculados por el módulo puro lenses.ts:
 * - Documento (offset 0, una sola vez): "Ejecutar todo" y "Borrar todas las salidas".
 * - Chunk: "Ejecutar", "Ejecutar hasta aquí" (salvo en el primero) y
 *   "Borrar salida" (solo si el chunk tiene bloque de salida).
 */
class ChunkCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.languageId !== 'markdown') return [];

    return computeLensSpecs(document.getText()).map(spec => {
      const pos = document.positionAt(spec.offset);
      return new vscode.CodeLens(new vscode.Range(pos, pos), {
        title: spec.title,
        command: spec.command,
        arguments: spec.arguments,
      });
    });
  }
}

function registerCodeLens(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'markdown' },
      new ChunkCodeLensProvider(),
    ),
  );
}

// ---------------------------------------------------------------------------
// Lógica central de ejecución de un chunk
// ---------------------------------------------------------------------------

/**
 * Ejecuta el chunk `chunkId` del documento dado y actualiza su bloque de salida.
 *
 * Patrón de concurrencia (obligatorio):
 * 1. Comprobación previa al kernel: duplicados y existencia del chunk.
 * 2. Ejecución asíncrona del kernel (puede tardar segundos; el usuario puede editar).
 * 3. Al volver, RE-PARSEAR el snapshot ACTUAL del documento (nunca reutilizar
 *    offsets calculados antes de la ejecución).
 * 4. Localizar chunk y output por id en el snapshot fresco.
 * 5. Si el chunk ya no existe o su id está duplicado en el snapshot fresco, abortar.
 * 6. Aplicar replaceOrInsertOutputBlock sobre el texto fresco.
 * 7. textBefore = snapshot fresco; textAfter = resultado de replaceOrInsertOutputBlock.
 * 8. Si editor.edit devuelve false, reintentar una vez re-parseando; si vuelve a
 *    fallar, mostrar mensaje y abortar.
 * 9. Llamar a reanchorAfterReplace solo si había un bloque previo.
 */
async function runChunkById(
  document: vscode.TextDocument,
  chunkId: string,
  kernelManager: KernelManager,
): Promise<void> {
  // 1. Comprobación previa: duplicados y existencia del chunk
  const preText = document.getText();
  const preChunks = parseChunks(preText);
  const preCount = preChunks.filter(c => c.id === chunkId).length;

  if (preCount > 1) {
    vscode.window.showWarningMessage(
      `mesh-run: el id «${chunkId}» está duplicado en el documento. Corrige los ids antes de ejecutar.`,
    );
    return;
  }
  if (preCount === 0) {
    vscode.window.showInformationMessage(
      `mesh-run: el chunk «${chunkId}» ya no existe en el documento.`,
    );
    return;
  }

  // Código que se envía al kernel (del snapshot pre-ejecución)
  const codeToRun = preChunks.find(c => c.id === chunkId)!.code;

  // 2. Ejecutar en el kernel (async — el documento puede cambiar durante esto)
  let result: ExecutionResult;
  try {
    const session = await kernelManager.getOrStart(document.uri);
    result = await session.execute(codeToRun);
  } catch (err) {
    if (err instanceof vscode.CancellationError) return;
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`mesh-run: error al ejecutar «${chunkId}»: ${msg}`);
    return;
  }

  // 3. Re-parsear el snapshot ACTUAL (el documento puede haber cambiado durante la ejecución)
  const freshText = document.getText();
  const freshChunks = parseChunks(freshText);
  const freshOutputs = parseOutputs(freshText);

  // 4. Comprobar duplicados y existencia en el snapshot fresco
  const freshCount = freshChunks.filter(c => c.id === chunkId).length;
  if (freshCount > 1) {
    vscode.window.showWarningMessage(
      `mesh-run: el id «${chunkId}» está duplicado en el snapshot tras la ejecución. Edición cancelada.`,
    );
    return;
  }

  const freshChunk = freshChunks.find(c => c.id === chunkId);
  if (!freshChunk) {
    vscode.window.showInformationMessage(
      `mesh-run: el chunk «${chunkId}» desapareció durante la ejecución. Sin cambios.`,
    );
    return;
  }

  const freshOutput = freshOutputs.find(o => o.chunkId === chunkId);

  // 5. Construir el bloque de salida con el hash del código EJECUTADO (codeToRun).
  // Si el usuario editó el chunk durante la ejecución, el hash diferirá del código actual
  // y stale.ts lo marcará obsoleto correctamente, que es la verdad semántica.
  const currentHash = chunkHash(codeToRun);
  let blockContent: string;

  if (result.error !== null) {
    // Error de ejecución: prefijo '# Error\n' para que stale.ts lo detecte
    blockContent = `# Error\n${result.error}`;
  } else {
    // Salida normal: stdout + repr al final si no es null
    const lines: string[] = [
      ...result.stdout,
      ...(result.repr !== null ? [result.repr] : []),
    ];
    blockContent = truncateOutput(lines, freshChunk.truncate ?? 50);
  }

  const newOutputBlock = buildOutputBlock(chunkId, currentHash, blockContent);

  // textBefore = freshText; textAfter = resultado de replaceOrInsertOutputBlock.
  // La garantía de coherencia viene de que editor.edit es versionado (devuelve false
  // si el documento cambió entre getText() y la edición) y de que el reintento
  // re-parsea y recalcula textAfter sobre el nuevo snapshot antes de llamar a reanchor.
  const textAfter = replaceOrInsertOutputBlock(freshText, freshChunk, freshOutput, newOutputBlock);

  // 6. Aplicar la edición en el editor visible
  const editor = getEditorForDoc(document);
  if (!editor) {
    vscode.window.showWarningMessage(
      'mesh-run: el documento no está abierto en ningún editor visible.',
    );
    return;
  }

  let editSuccess = await applyOutputEdit(
    editor, document, freshChunk, freshOutput, newOutputBlock, freshText,
  );

  // Datos que se usarán para reanchor (actualizados en el reintento si falla)
  let effectiveFreshText = freshText;
  let effectiveFreshOutput = freshOutput;
  let effectiveTextAfter = textAfter;

  if (!editSuccess) {
    // 7. Reintento: re-parsear y volver a intentar una vez
    const retryText = document.getText();
    const retryChunks = parseChunks(retryText);
    const retryOutputs = parseOutputs(retryText);

    const retryChunk = retryChunks.find(c => c.id === chunkId);
    if (!retryChunk) {
      vscode.window.showInformationMessage(
        `mesh-run: el chunk «${chunkId}» desapareció durante el reintento. Sin cambios.`,
      );
      return;
    }

    const retryOutput = retryOutputs.find(o => o.chunkId === chunkId);
    // Mismo hash que el primer intento: la salida sigue siendo de codeToRun
    const retryBlock = buildOutputBlock(chunkId, currentHash, blockContent);

    editSuccess = await applyOutputEdit(
      editor, document, retryChunk, retryOutput, retryBlock, retryText,
    );

    if (!editSuccess) {
      vscode.window.showWarningMessage(
        `mesh-run: no se pudo aplicar la edición para «${chunkId}». Inténtalo de nuevo.`,
      );
      return;
    }

    // Actualizar datos efectivos para reanchor con los del reintento exitoso
    effectiveFreshText = retryText;
    effectiveFreshOutput = retryOutput;
    effectiveTextAfter = replaceOrInsertOutputBlock(retryText, retryChunk, retryOutput, retryBlock);
  }

  // 8. Re-anclaje de hilos de mesh-review (solo si había un bloque previo)
  // getGitRootForDoc ya comprueba getWorkspaceFolder; devuelve null si no existe
  if (effectiveFreshOutput !== undefined) {
    const gitRoot = await getGitRootForDoc(document);
    // Localizar el nuevo bloque en textAfter para obtener su rango
    const newOutputsAfter = parseOutputs(effectiveTextAfter);
    const newOut = newOutputsAfter.find(o => o.chunkId === chunkId);

    await reanchorAfterReplace({
      docFsPath: document.uri.fsPath,
      gitRoot,
      textBefore: effectiveFreshText,
      textAfter: effectiveTextAfter,
      previousOutputRange: {
        startOffset: effectiveFreshOutput.startOffset,
        endOffset: effectiveFreshOutput.endOffset,
      },
      newOutputRange: newOut
        ? { startOffset: newOut.startOffset, endOffset: newOut.endOffset }
        : null,
    });
  }
}

// ---------------------------------------------------------------------------
// clearOutputs — eliminar bloques de salida en una sola operación
// ---------------------------------------------------------------------------

/**
 * Elimina bloques de salida del documento en una sola edición.
 * Sin `onlyChunkId` elimina todos los bloques; con él, solo el de ese chunk.
 */
async function executeClearOutputs(
  document: vscode.TextDocument,
  onlyChunkId?: string,
): Promise<void> {
  const freshText = document.getText();
  const outputs = parseOutputs(freshText).filter(
    o => onlyChunkId === undefined || o.chunkId === onlyChunkId,
  );

  if (outputs.length === 0) {
    vscode.window.showInformationMessage(
      onlyChunkId === undefined
        ? 'mesh-run: no hay bloques de salida que borrar.'
        : `mesh-run: el chunk «${onlyChunkId}» no tiene bloque de salida.`,
    );
    return;
  }

  const editor = getEditorForDoc(document);
  if (!editor) {
    vscode.window.showWarningMessage(
      'mesh-run: el documento no está abierto en ningún editor visible.',
    );
    return;
  }

  // Ordenar descendente para que las eliminaciones múltiples en un solo edit
  // no desplacen los offsets de los bloques siguientes (procesan del final al inicio)
  const sortedDesc = [...outputs].sort((a, b) => b.startOffset - a.startOffset);

  const editSuccess = await editor.edit(
    editBuilder => {
      for (const output of sortedDesc) {
        editBuilder.delete(
          new vscode.Range(
            document.positionAt(output.startOffset),
            document.positionAt(output.endOffset),
          ),
        );
      }
    },
    { undoStopBefore: true, undoStopAfter: true },
  );

  if (!editSuccess) {
    vscode.window.showWarningMessage(
      'mesh-run: no se pudieron limpiar las salidas. Inténtalo de nuevo.',
    );
    return;
  }

  // Calcular textAfter eliminando los bloques en orden descendente
  // (las eliminaciones desde el final no afectan a los offsets de los bloques anteriores)
  let textAfter = freshText;
  for (const output of sortedDesc) {
    textAfter = textAfter.slice(0, output.startOffset) + textAfter.slice(output.endOffset);
  }

  // Re-anclaje por cada bloque eliminado (newOutputRange null = bloque desaparecido).
  // Todas las llamadas comparten el mismo textBefore (freshText) porque los
  // previousOutputRange de cada bloque se midieron sobre ese snapshot; textAfter
  // es el mismo para todas (resultado de eliminar todos los bloques a la vez).
  // getGitRootForDoc ya comprueba getWorkspaceFolder; se llama una vez y se reutiliza.
  const gitRoot = await getGitRootForDoc(document);

  for (const output of outputs) {
    await reanchorAfterReplace({
      docFsPath: document.uri.fsPath,
      gitRoot,
      textBefore: freshText,
      textAfter,
      previousOutputRange: {
        startOffset: output.startOffset,
        endOffset: output.endOffset,
      },
      newOutputRange: null,
    });
  }
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

/**
 * Resuelve el documento markdown activo y el chunk objetivo de un comando:
 * el chunkId llega como argumento desde el CodeLens, o se busca bajo el
 * cursor si el comando se invocó desde la paleta. Muestra el aviso
 * pertinente y devuelve undefined si no hay objetivo.
 */
function resolveChunkTarget(
  chunkId?: string,
): { document: vscode.TextDocument; chunkId: string } | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showWarningMessage(
      'mesh-run: abre un documento Markdown para usar este comando.',
    );
    return undefined;
  }

  const document = editor.document;
  if (chunkId) {
    return { document, chunkId };
  }

  const cursorOffset = document.offsetAt(editor.selection.active);
  const chunkUnderCursor = parseChunks(document.getText()).find(
    c => cursorOffset >= c.startOffset && cursorOffset <= c.endOffset,
  );
  if (!chunkUnderCursor) {
    vscode.window.showWarningMessage(
      'mesh-run: coloca el cursor dentro de un chunk.',
    );
    return undefined;
  }
  return { document, chunkId: chunkUnderCursor.id };
}

/**
 * Registra los seis comandos de mesh-run declarados en package.json:
 * - mesh-run.runChunk
 * - mesh-run.runUpTo
 * - mesh-run.runAll
 * - mesh-run.restartKernel
 * - mesh-run.clearChunkOutput
 * - mesh-run.clearOutputs
 *
 * Todos los comandos de ejecución y edición se encolan por URI de documento
 * para serializar las operaciones y evitar conflictos de edición concurrente.
 */
function registerCommands(
  context: vscode.ExtensionContext,
  kernelManager: KernelManager,
): void {
  // mesh-run.runChunk
  // Invocado desde CodeLens con chunkId como argumento.
  // Invocado desde paleta sin argumento: busca el chunk bajo el cursor.
  context.subscriptions.push(
    vscode.commands.registerCommand('mesh-run.runChunk', async (chunkId?: string) => {
      const target = resolveChunkTarget(chunkId);
      if (!target) return;
      const resolvedId = target.chunkId;
      enqueue(target.document.uri, () =>
        runChunkById(target.document, resolvedId, kernelManager),
      );
    }),
  );

  // mesh-run.runUpTo
  // Encola en orden todos los chunks desde el principio del documento hasta
  // el chunk objetivo incluido. Con ids duplicados, el objetivo es la primera
  // aparición; runChunkById detecta el duplicado por chunk y avisa.
  context.subscriptions.push(
    vscode.commands.registerCommand('mesh-run.runUpTo', async (chunkId?: string) => {
      const target = resolveChunkTarget(chunkId);
      if (!target) return;

      const chunks = parseChunks(target.document.getText());
      const idx = chunks.findIndex(c => c.id === target.chunkId);
      if (idx === -1) {
        vscode.window.showInformationMessage(
          `mesh-run: el chunk «${target.chunkId}» ya no existe en el documento.`,
        );
        return;
      }

      for (const chunk of chunks.slice(0, idx + 1)) {
        const id = chunk.id;
        enqueue(target.document.uri, () =>
          runChunkById(target.document, id, kernelManager),
        );
      }
    }),
  );

  // mesh-run.clearChunkOutput
  // Elimina solo el bloque de salida del chunk objetivo.
  context.subscriptions.push(
    vscode.commands.registerCommand('mesh-run.clearChunkOutput', async (chunkId?: string) => {
      const target = resolveChunkTarget(chunkId);
      if (!target) return;
      const resolvedId = target.chunkId;
      enqueue(target.document.uri, () =>
        executeClearOutputs(target.document, resolvedId),
      );
    }),
  );

  // mesh-run.runAll
  // Encola todos los chunks del documento en orden; cada uno espera al anterior.
  context.subscriptions.push(
    vscode.commands.registerCommand('mesh-run.runAll', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'markdown') {
        vscode.window.showWarningMessage(
          'mesh-run: abre un documento Markdown para ejecutar todos los chunks.',
        );
        return;
      }

      const document = editor.document;
      const chunks = parseChunks(document.getText());

      if (chunks.length === 0) {
        vscode.window.showInformationMessage('mesh-run: no hay chunks en este documento.');
        return;
      }

      for (const chunk of chunks) {
        const chunkId = chunk.id;
        enqueue(document.uri, () => runChunkById(document, chunkId, kernelManager));
      }
    }),
  );

  // mesh-run.restartKernel
  // Descarta la sesión activa; la próxima ejecución abrirá un nuevo acompañante.
  // Se encola para que espere a cualquier ejecución en curso antes de reiniciar.
  context.subscriptions.push(
    vscode.commands.registerCommand('mesh-run.restartKernel', async () => {
      const document = vscode.window.activeTextEditor?.document;
      if (!document) {
        vscode.window.showWarningMessage('mesh-run: no hay ningún editor activo.');
        return;
      }
      enqueue(document.uri, () => kernelManager.restart(document.uri));
    }),
  );

  // mesh-run.clearOutputs
  // Elimina todos los bloques de salida en una sola operación de edición.
  context.subscriptions.push(
    vscode.commands.registerCommand('mesh-run.clearOutputs', async () => {
      const document = vscode.window.activeTextEditor?.document;
      if (!document || document.languageId !== 'markdown') {
        vscode.window.showWarningMessage(
          'mesh-run: abre un documento Markdown para limpiar las salidas.',
        );
        return;
      }
      enqueue(document.uri, () => executeClearOutputs(document));
    }),
  );
}

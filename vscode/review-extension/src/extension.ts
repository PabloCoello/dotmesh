import * as vscode from 'vscode';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

import {
  getGitRoot,
  readEvents,
  writeEvent,
  project,
  migrateV1,
  detectLegacy,
  fallbackEventDir,
  getHeadSha,
  getUserName,
  ensureFallbackDir,
  addToGitExclude,
  isAiReviewIgnored,
  readSidecar,
  utcTimestampMs,
  buildV1FilePath,
  anchorChanged,
  scanAllDocs,
  type EventEnvelope,
  type ThreadProjection,
  type Anchor,
  type CommentType,
} from './sidecar';

import { createAnchor, resolveAnchor, shiftAnchorRange } from './anchor';
import { applyDecorations, disposeDecorationTypes } from './decorations';
import { ThreadCardsViewProvider } from './thread-cards';
import { buildCardViewModels, computeUnseenCount, pickNextThread } from './thread-cards-utils';
import { buildDiffTitle, isMeshReviewDiffTabLabel } from './diff-utils';
import { getScribeTerminal, launchScribeTerminal, ensureScribeTerminal, sendToScribe } from './scribe-bridge';
import { buildLaunchCommand, buildSendAllPrompt, buildFocusPrompt } from './scribe-bridge-utils';

// ---------------------------------------------------------------------------
// Estado de sesión: supresión del aviso de gitignore por workspace
// ---------------------------------------------------------------------------

const suppressedWorkspaces = new Set<string>();

// Documentos cuya oferta de migración V1→V2 ya se mostró en esta sesión.
const migrationPromptedDocs = new Set<string>();

// Directorio de eventos del documento activo (se actualiza en refreshEditorState).
// El watcher lo usa para filtrar eventos de otros documentos.
let _activeEventDir: string | undefined;

// ---------------------------------------------------------------------------
// Helpers de ruta
// ---------------------------------------------------------------------------

/**
 * Calcula el directorio de eventos V2 y el git root para un documento activo.
 */
async function resolveEventDir(
  docFsPath: string
): Promise<{ eventDir: string; gitRoot: string | null; docRelPath: string }> {
  const gitRoot = await getGitRoot(path.dirname(docFsPath));
  if (gitRoot) {
    const rel = path.relative(gitRoot, docFsPath);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return {
        eventDir: path.join(gitRoot, '.ai', 'review', rel),
        gitRoot,
        docRelPath: rel,
      };
    }
  }
  await ensureFallbackDir();
  return {
    eventDir: fallbackEventDir(docFsPath),
    gitRoot: null,
    docRelPath: docFsPath,
  };
}

/**
 * Comprueba si `.ai/review/` está ignorado y ofrece añadirlo a `.git/info/exclude`.
 */
async function checkAndWarnIgnore(gitRoot: string): Promise<void> {
  if (suppressedWorkspaces.has(gitRoot)) return;

  const ignored = await isAiReviewIgnored(gitRoot);
  if (ignored) {
    await addToGitExclude(gitRoot, '.ai/backlog/').catch(() => {});
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    "mesh-review: `.ai/review/` no está ignorado en este repo. ¿Añadir a `.git/info/exclude`?",
    { modal: false },
    'Añadir',
    'No volver a preguntar'
  );

  if (choice === 'Añadir') {
    await addToGitExclude(gitRoot);
    await addToGitExclude(gitRoot, '.ai/backlog/');
    vscode.window.showInformationMessage(
      'mesh-review: `.ai/review/` y `.ai/backlog/` añadidos a `.git/info/exclude`.'
    );
  } else {
    suppressedWorkspaces.add(gitRoot);
  }
}

// ---------------------------------------------------------------------------
// Helper: refresca proyecciones y decoraciones tras escribir un evento
// ---------------------------------------------------------------------------

/**
 * Rellena las proyecciones y decoraciones tras escribir un evento.
 * Solo cardsProvider recibe la actualización (el árbol fue retirado).
 *
 * @param afterUpdate Callback opcional invocado con las proyecciones resultantes.
 *   extension.ts lo usa para actualizar el badge de la activity bar (P1).
 */
async function refreshAfterWrite(
  eventDir: string,
  docUri: vscode.Uri,
  cardsProvider: ThreadCardsViewProvider,
  onError?: (file: string, err: unknown) => void,
  afterUpdate?: (projections: ThreadProjection[]) => void
): Promise<void> {
  const events = await readEvents(eventDir, onError);
  const projections = project(events);
  cardsProvider.update(projections, docUri);
  afterUpdate?.(projections);
  const editor = vscode.window.visibleTextEditors.find(
    e => e.document.uri.fsPath === docUri.fsPath
  ) ?? vscode.window.activeTextEditor;
  if (editor) {
    applyDecorations(editor, projections);
  }
}

// ---------------------------------------------------------------------------
// Migración V1 (Slice 4)
// ---------------------------------------------------------------------------

async function migrateLegacyToV2(
  gitRoot: string,
  docRelPath: string,
  eventDir: string
): Promise<EventEnvelope[]> {
  const v1FilePath = buildV1FilePath(gitRoot, docRelPath);
  const sidecar = await readSidecar(v1FilePath);
  if (!sidecar) return [];
  const events = migrateV1(sidecar);
  for (const ev of events) {
    await writeEvent(eventDir, ev);
  }
  await rename(v1FilePath, `${v1FilePath}.v1.bak`);
  return events;
}

async function ensureLegacyMigrated(
  gitRoot: string | null,
  docRelPath: string,
  eventDir: string
): Promise<void> {
  if (!gitRoot) return;
  if (!(await detectLegacy(gitRoot, docRelPath))) return;
  const migrated = await migrateLegacyToV2(gitRoot, docRelPath, eventDir);
  if (migrated.length > 0) {
    vscode.window.showInformationMessage(
      'mesh-review: sidecar V1 migrado a V2 al escribir. El fichero V1 se conserva como .v1.bak.'
    );
  }
}

async function handleLegacyMigration(
  editor: vscode.TextEditor,
  gitRoot: string,
  docRelPath: string,
  eventDir: string
): Promise<ThreadProjection[]> {
  const v1FilePath = buildV1FilePath(gitRoot, docRelPath);
  const sidecar = await readSidecar(v1FilePath);
  if (!sidecar) return [];

  const choice = await vscode.window.showInformationMessage(
    'mesh-review: sidecar V1 detectado. ¿Migrar a V2?',
    { modal: false },
    'Migrar',
    'Solo leer'
  );

  if (choice === 'Migrar') {
    const events = await migrateLegacyToV2(gitRoot, docRelPath, eventDir);
    vscode.window.showInformationMessage(
      'mesh-review: migración completada. El fichero V1 se ha renombrado a .v1.bak.'
    );
    return project(events);
  }

  return project(migrateV1(sidecar));
}


// ---------------------------------------------------------------------------
// Autor humano — resuelve el nombre desde git config user.name
// ---------------------------------------------------------------------------

/**
 * Construye el campo author para un evento humano.
 * Ejecuta `git config user.name` desde `cwd`; si falla o está vacío,
 * devuelve { kind: 'human' } sin el campo name.
 */
async function humanAuthor(
  cwd: string
): Promise<{ kind: 'human'; name?: string }> {
  const name = await getUserName(cwd);
  return { kind: 'human', name };
}

// ---------------------------------------------------------------------------
// Implementación de comandos
// ---------------------------------------------------------------------------

/** Añade un nuevo hilo de revisión (thread.opened) al documento activo. */
async function addCommentImpl(
  output: vscode.OutputChannel,
  cardsProvider: ThreadCardsViewProvider,
  afterUpdate?: (projections: ThreadProjection[]) => void
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('mesh-review: No hay editor activo.');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showErrorMessage(
      'mesh-review: Selecciona texto antes de añadir un comentario.'
    );
    return;
  }

  const preModalText = editor.document.getText();
  const preModalAnchor = createAnchor(
    preModalText,
    editor.document.offsetAt(selection.start),
    editor.document.offsetAt(selection.end)
  );

  const type = await vscode.window.showQuickPick<vscode.QuickPickItem>(
    [
      { label: 'edita',      description: 'Edición concreta a aplicar' },
      { label: 'sugerencia', description: 'Propuesta de mejora' },
      { label: 'pregunta',   description: 'Pregunta sobre el contenido' },
      { label: 'verifica',   description: 'Comprueba un dato o afirmación contra la fuente' },
      { label: 'nota',       description: 'Anotación informativa sin acción requerida' },
      { label: 'referencia', description: 'Referencia o fuente enlazada' },
      { label: 'supuesto',   description: 'Supuesto con traza de confianza' },
    ],
    { title: 'Tipo de comentario', placeHolder: 'Selecciona el tipo' }
  );
  if (!type) return;

  // P5: para tipos verifica/supuesto, pedir nivel de confianza antes del cuerpo.
  let confidence: 'alta' | 'media' | 'baja' | undefined;
  if (type.label === 'verifica' || type.label === 'supuesto') {
    const confItem = await vscode.window.showQuickPick<vscode.QuickPickItem>(
      [
        { label: 'alta',  description: 'Datos sólidos o fuente primaria' },
        { label: 'media', description: 'Fuente secundaria o inferencia razonable' },
        { label: 'baja',  description: 'Suposición o dato sin verificar' },
      ],
      { title: 'Nivel de confianza', placeHolder: 'Selecciona el nivel de confianza (Esc para cancelar)' }
    );
    if (!confItem) return;
    confidence = confItem.label as 'alta' | 'media' | 'baja';
  }

  const body = await vscode.window.showInputBox({
    title: 'Comentario',
    prompt: 'Escribe el comentario (Enter para confirmar)',
    ignoreFocusOut: true,
    validateInput: (v) =>
      v.trim() === '' ? 'El comentario no puede estar vacío' : undefined,
  });
  if (body === undefined || body.trim() === '') return;

  const docFsPath = editor.document.uri.fsPath;
  const docText = editor.document.getText();
  let anchor = preModalAnchor;
  if (docText !== preModalText) {
    const relocated = resolveAnchor(docText, preModalAnchor);
    if (!relocated) {
      vscode.window.showErrorMessage(
        'mesh-review: El documento cambió mientras escribías y el texto seleccionado ya no existe. Vuelve a seleccionar y repite.'
      );
      return;
    }
    anchor = createAnchor(docText, relocated.startOffset, relocated.endOffset);
  }

  const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docFsPath);

  if (gitRoot) {
    await checkAndWarnIgnore(gitRoot);
    await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);
  }

  const id = randomUUID();
  const event: EventEnvelope = {
    id,
    version: 2,
    type: 'thread.opened',
    thread_id: id,
    author: await humanAuthor(gitRoot ?? path.dirname(docFsPath)),
    created_at: utcTimestampMs(),
    commit: gitRoot ? await getHeadSha(gitRoot) : null,
    dirty: editor.document.isDirty,
    anchor,
    commentType: type.label as CommentType,
    body: body.trim(),
    // P5: confidence se incluye solo para tipos verifica/supuesto
    ...(confidence !== undefined ? { confidence } : {}),
  };

  await writeEvent(eventDir, event);
  await refreshAfterWrite(eventDir, editor.document.uri, cardsProvider,
    (file, err) => output.appendLine(`mesh-review: error leyendo evento ${file} — ${err}`),
    afterUpdate);

  output.appendLine(`mesh-review: hilo añadido — ${id} (${type.label})`);
  vscode.window.showInformationMessage(`mesh-review: comentario añadido (${type.label})`);
}

/**
 * Responde a un hilo existente (message.posted).
 * Invocable desde el webview vía setActionHandler.
 * Valida que threadId exista en las proyecciones actuales antes de escribir.
 */
async function replyToThreadImpl(
  threadId: string,
  docUri: vscode.Uri,
  cardsProvider: ThreadCardsViewProvider,
  afterUpdate?: (projections: ThreadProjection[]) => void,
  providedBody?: string
): Promise<void> {
  const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docUri.fsPath);
  await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);

  // Valida el id contra las proyecciones actuales antes de escribir
  const projections = project(await readEvents(eventDir));
  if (!projections.find(t => t.thread_id === threadId)) {
    vscode.window.showErrorMessage('mesh-review: Hilo no encontrado.');
    return;
  }

  let body: string;
  if (providedBody !== undefined) {
    // Body ya suministrado por el compositor multilínea del webview (P4).
    // isWebviewActionMessage ya validó que no está vacío antes de llegar aquí.
    body = providedBody.trim();
  } else {
    // Fallback: InputBox de una línea (ruta de compatibilidad).
    const input = await vscode.window.showInputBox({
      title: 'Responder al hilo',
      prompt: 'Escribe la respuesta (Enter para confirmar)',
      ignoreFocusOut: true,
      validateInput: (v) =>
        v.trim() === ''   ? 'La respuesta no puede estar vacía' :
        v.length > 10_000 ? 'La respuesta no puede superar 10 000 caracteres' :
        undefined,
    });
    if (input === undefined || input.trim() === '') return;
    body = input.trim();
  }

  const event: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'message.posted',
    thread_id: threadId,
    author: await humanAuthor(gitRoot ?? path.dirname(docUri.fsPath)),
    created_at: utcTimestampMs(),
    commit: gitRoot ? await getHeadSha(gitRoot) : null,
    dirty: false,
    body,
  };

  await writeEvent(eventDir, event);
  await refreshAfterWrite(eventDir, docUri, cardsProvider, undefined, afterUpdate);
  vscode.window.showInformationMessage('mesh-review: respuesta añadida.');
}

/**
 * Retira un mensaje del hilo (message.retracted).
 * Invocable desde el webview vía setActionHandler.
 * Valida que thread y mensaje existan antes de escribir.
 */
async function retractMessageImpl(
  threadId: string,
  messageId: string,
  docUri: vscode.Uri,
  cardsProvider: ThreadCardsViewProvider,
  afterUpdate?: (projections: ThreadProjection[]) => void
): Promise<void> {
  const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docUri.fsPath);
  await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);

  // Valida thread y mensaje contra las proyecciones actuales
  const projections = project(await readEvents(eventDir));
  const thread = projections.find(t => t.thread_id === threadId);
  if (!thread || !thread.messages.find(m => m.id === messageId)) {
    vscode.window.showErrorMessage('mesh-review: Hilo o mensaje no encontrado.');
    return;
  }

  const event: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'message.retracted',
    thread_id: threadId,
    author: await humanAuthor(gitRoot ?? path.dirname(docUri.fsPath)),
    created_at: utcTimestampMs(),
    commit: gitRoot ? await getHeadSha(gitRoot) : null,
    dirty: false,
    target_message_id: messageId,
  };

  await writeEvent(eventDir, event);
  await refreshAfterWrite(eventDir, docUri, cardsProvider, undefined, afterUpdate);
  vscode.window.showInformationMessage('mesh-review: mensaje retirado.');
}

/**
 * Resuelve el hilo (thread.status-changed → resolved).
 * Invocable desde el webview vía setActionHandler.
 * No re-resuelve hilos ya resueltos o desanclados (no-op silencioso).
 */
async function resolveThreadImpl(
  threadId: string,
  docUri: vscode.Uri,
  cardsProvider: ThreadCardsViewProvider,
  afterUpdate?: (projections: ThreadProjection[]) => void
): Promise<void> {
  const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docUri.fsPath);
  await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);

  // Valida que el hilo exista y esté abierto
  const projections = project(await readEvents(eventDir));
  const thread = projections.find(t => t.thread_id === threadId);
  if (!thread) return;          // hilo no encontrado — no-op silencioso
  if (thread.status !== 'open') return; // ya resuelto o desanclado — no-op silencioso

  const event: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'thread.status-changed',
    thread_id: threadId,
    author: await humanAuthor(gitRoot ?? path.dirname(docUri.fsPath)),
    created_at: utcTimestampMs(),
    commit: gitRoot ? await getHeadSha(gitRoot) : null,
    dirty: false,
    to: 'resolved',
  };

  await writeEvent(eventDir, event);
  await refreshAfterWrite(eventDir, docUri, cardsProvider, undefined, afterUpdate);
  vscode.window.showInformationMessage('mesh-review: hilo marcado como resuelto.');
}

/**
 * Asigna un hilo a un subagente (thread.assigned).
 * Invocable desde el webview vía setActionHandler (acción 'assign').
 * Muestra un QuickPick con los cuatro subagentes asignables del roster 2+6.
 */
async function assignThreadImpl(
  threadId: string,
  docUri: vscode.Uri,
  cardsProvider: ThreadCardsViewProvider,
  afterUpdate?: (projections: ThreadProjection[]) => void
): Promise<void> {
  const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docUri.fsPath);
  await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);

  const projections = project(await readEvents(eventDir));
  const thread = projections.find(t => t.thread_id === threadId);
  if (!thread || thread.status !== 'open') {
    vscode.window.showErrorMessage('mesh-review: Hilo no encontrado o no está abierto.');
    return;
  }

  const agentItem = await vscode.window.showQuickPick<vscode.QuickPickItem>(
    [
      { label: 'security', description: 'Revisor de seguridad — hardening, secretos, permisos' },
      { label: 'maths',    description: 'Revisor de lógica y matemáticas' },
      { label: 'reviser',  description: 'Revisor conversacional — doc-review' },
      { label: 'editor',   description: 'Editor de prosa' },
    ],
    { title: 'Asignar hilo a subagente', placeHolder: 'Selecciona el subagente' }
  );
  if (!agentItem) return;

  const event: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'thread.assigned',
    thread_id: threadId,
    author: await humanAuthor(gitRoot ?? path.dirname(docUri.fsPath)),
    created_at: utcTimestampMs(),
    commit: gitRoot ? await getHeadSha(gitRoot) : null,
    dirty: false,
    agent: agentItem.label,
  };

  await writeEvent(eventDir, event);
  await refreshAfterWrite(eventDir, docUri, cardsProvider, undefined, afterUpdate);
  vscode.window.showInformationMessage(`mesh-review: hilo asignado a ${agentItem.label}.`);
}

/**
 * Edita el texto de un mensaje existente (message.revised).
 * Invocable desde el webview vía setActionHandler.
 * Valida thread y mensaje; pre-rellena el InputBox con el body actual.
 */
async function editMessageImpl(
  threadId: string,
  messageId: string,
  docUri: vscode.Uri,
  cardsProvider: ThreadCardsViewProvider,
  afterUpdate?: (projections: ThreadProjection[]) => void,
  providedBody?: string
): Promise<void> {
  const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docUri.fsPath);
  await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);

  // Lee proyecciones para validar ids y (si no hay providedBody) pre-rellenar el InputBox
  const events = await readEvents(eventDir);
  const projections = project(events);
  const thread = projections.find(t => t.thread_id === threadId);
  if (!thread) {
    vscode.window.showErrorMessage('mesh-review: Hilo no encontrado.');
    return;
  }
  const msg = thread.messages.find(m => m.id === messageId);
  if (!msg) {
    vscode.window.showErrorMessage('mesh-review: Mensaje no encontrado.');
    return;
  }
  const currentBody = msg.body;

  let newBody: string;
  if (providedBody !== undefined) {
    // Body ya suministrado por el compositor multilínea del webview (P4).
    newBody = providedBody.trim();
  } else {
    // Fallback: InputBox de una línea (ruta de compatibilidad).
    const input = await vscode.window.showInputBox({
      title: 'Editar mensaje',
      prompt: 'Modifica el texto del mensaje',
      value: currentBody,
      ignoreFocusOut: true,
      validateInput: (v) =>
        v.trim() === ''   ? 'El mensaje no puede estar vacío' :
        v.length > 10_000 ? 'El mensaje no puede superar 10 000 caracteres' :
        undefined,
    });
    if (input === undefined) return;
    newBody = input.trim();
  }

  if (newBody.trim() === currentBody.trim()) {
    vscode.window.showInformationMessage('mesh-review: Sin cambios.');
    return;
  }

  const event: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'message.revised',
    thread_id: threadId,
    author: await humanAuthor(gitRoot ?? path.dirname(docUri.fsPath)),
    created_at: utcTimestampMs(),
    commit: gitRoot ? await getHeadSha(gitRoot) : null,
    dirty: false,
    target_message_id: messageId,
    body: newBody.trim(),
  };

  await writeEvent(eventDir, event);
  await refreshAfterWrite(eventDir, docUri, cardsProvider, undefined, afterUpdate);
  vscode.window.showInformationMessage('mesh-review: mensaje actualizado.');
}

/**
 * Navega al ancla de un hilo en el editor.
 * Lee el docUri desde cardsProvider.
 */
async function jumpToAnchorImpl(
  anchor: Anchor,
  cardsProvider: ThreadCardsViewProvider
): Promise<void> {
  const docUri = cardsProvider.docUri;
  let editor: vscode.TextEditor | undefined;

  if (docUri) {
    editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.fsPath === docUri.fsPath
    );
  }

  if (!editor) editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showInformationMessage(
      'mesh-review: No hay editor abierto con este documento.'
    );
    return;
  }

  const text = editor.document.getText();
  const resolved = resolveAnchor(text, anchor);

  if (!resolved) {
    vscode.window.showInformationMessage(
      'mesh-review: El ancla ya no existe en el documento (texto eliminado o modificado).'
    );
    return;
  }

  const start = editor.document.positionAt(resolved.startOffset);
  const end = editor.document.positionAt(resolved.endOffset);
  const range = new vscode.Range(start, end);

  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  editor.selection = new vscode.Selection(start, end);

  await vscode.window.showTextDocument(editor.document, {
    viewColumn: editor.viewColumn,
    preserveFocus: false,
  });
}

// ---------------------------------------------------------------------------
// navigateThread — navegación por teclado entre hilos (P2)
// ---------------------------------------------------------------------------

/**
 * Navega al siguiente o anterior hilo abierto del documento activo, usando la
 * posición actual del cursor como referencia de `currentOffset`.
 *
 * Lógica de selección delegada a la función pura `pickNextThread` (testeable).
 * Una vez elegido el hilo, reutiliza `jumpToAnchorImpl` para revelar y
 * seleccionar el rango anclado en el editor.
 *
 * El setting `mesh-review.navigation.cyclic` (boolean, default true) controla
 * si la navegación cicla al llegar al primero/último hilo.
 *
 * Guarda de sincronización: si el docUri de las proyecciones del provider no
 * coincide con el documento del editor activo (puede ocurrir si el comando se
 * dispara justo tras cambiar de editor y antes de que refreshEditorState
 * complete), la función es no-op.
 */
async function navigateThread(
  direction: 'next' | 'prev',
  cardsProvider: ThreadCardsViewProvider
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  // Guarda de sincronización: las proyecciones deben corresponder al documento
  // activo. Si no, el cambio de editor aún no ha completado refreshEditorState.
  if (cardsProvider.docUri?.fsPath !== editor.document.uri.fsPath) return;

  const cyclic = vscode.workspace
    .getConfiguration('mesh-review')
    .get<boolean>('navigation.cyclic', true);

  // 'next' avanza desde el final de la selección actual; 'prev' retrocede desde
  // el inicio. Usar siempre selection.active (= fin de cita tras nextThread)
  // para 'prev' haría que pickNextThread encontrase el mismo hilo de vuelta
  // (su char_offset < active es siempre cierto), sin avance visible.
  const refPosition =
    direction === 'prev' ? editor.selection.start : editor.selection.end;
  const currentOffset = editor.document.offsetAt(refPosition);
  const target = pickNextThread(
    cardsProvider.projections,
    currentOffset,
    direction,
    cyclic
  );

  if (!target) return; // Sin candidatos: no-op silencioso

  await jumpToAnchorImpl(target.anchor as Anchor, cardsProvider);
}

// ---------------------------------------------------------------------------
// openDiffImpl — vista diff del commit de fix de un hilo
// ---------------------------------------------------------------------------

/** Patrón de validación de SHA: hex de 7 a 40 caracteres. */
const SHA_RE = /^[0-9a-f]{7,40}$/;

/**
 * Abre la vista diff de VS Code para el commit de fix del hilo indicado.
 *
 * Seguridad:
 * - thread_id y mode fueron validados por isWebviewActionMessage en el boundary del webview.
 * - Los SHAs (fixCommit, openCommit) provienen de las proyecciones del event log en disco,
 *   nunca del webview.
 * - Si se usa el fallback (Opción B), se valida el SHA contra SHA_RE antes de pasarlo
 *   a execFile con array de argumentos (sin interpolación de strings en shell).
 * - relPath se deriva de gitRoot en el servidor; no viaja desde el webview.
 *
 * Estrategia de URI:
 * - Opción A (preferida): git URI scheme via la extensión git de VS Code. Sin shell-out.
 * - Opción B (fallback): git show <sha>:<path> + openTextDocument virtual.
 */
async function openDiffImpl(
  threadId: string,
  mode: 'last' | 'range',
  cardsProvider: ThreadCardsViewProvider
): Promise<void> {
  const docUri = cardsProvider.docUri;
  if (!docUri) return;

  const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docUri.fsPath);

  if (!gitRoot) {
    vscode.window.showInformationMessage(
      'mesh-review: diff no disponible — el documento no está dentro de un repositorio git.'
    );
    return;
  }

  // Lee proyecciones desde disco para obtener los SHAs del hilo.
  const projections = project(await readEvents(eventDir));
  const thread = projections.find(t => t.thread_id === threadId);
  if (!thread) return;

  // Calcula fixCommit (último message.posted de IA con commit !== null) y openCommit.
  const lastAiFix = thread.messages
    .filter(m => !m.retracted && m.author.kind === 'ai' && m.commit !== null)
    .at(-1);
  const fixCommit = lastAiFix?.commit ?? null;
  if (fixCommit === null) return; // nada que mostrar — no-op silencioso

  const openCommit = thread.openedCommit ?? null;

  // Boundary de seguridad: fixCommit/openCommit vienen de proyecciones en .ai/review/,
  // que el reviser y otras herramientas pueden escribir. Se validan aquí —antes del fork
  // Opción A / Opción B— y no solo antes del shell-out del fallback, para que ningún ref
  // no confiable llegue ni a la URI git ni a execFile.
  if (!SHA_RE.test(fixCommit) || (openCommit !== null && !SHA_RE.test(openCommit))) {
    vscode.window.showErrorMessage(
      'mesh-review: SHA de commit no válido — no se puede abrir el diff.'
    );
    return;
  }

  // Determina los refs (revspec) a comparar.
  // Modo last: diff del commit del fix (fixCommit^ .. fixCommit).
  // Modo range: si openCommit está disponible, diff acumulado (openCommit .. fixCommit);
  //             si no, fallback a last.
  const refBefore: string =
    mode === 'range' && openCommit !== null
      ? openCommit
      : `${fixCommit}^`;
  const refAfter: string = fixCommit;

  const absPath = path.join(gitRoot, docRelPath);
  const relPathGit = docRelPath.replace(/\\/g, '/'); // git espera separadores Unix
  const titulo = buildDiffTitle(docRelPath, thread.commentType, fixCommit);

  // Resuelve cada revspec a un SHA concreto con rev-parse. Dos motivos:
  //  - La extensión git de VS Code espera un hash en la URI, no un revspec como
  //    `fixCommit^`; sin resolverlo, la Opción A no abre el editor.
  //  - Si fixCommit es el primer commit del repo, `fixCommit^` no tiene padre:
  //    rev-parse devuelve null y el lado "antes" queda vacío (fichero añadido).
  // El input ya está saneado (SHA_RE arriba); `^{commit}` fuerza a resolver a commit
  // y execFile pasa los args en array, sin shell.
  const revParse = async (ref: string): Promise<string | null> => {
    try {
      const { stdout } = await execFileAsync(
        'git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: gitRoot }
      );
      const sha = stdout.trim();
      return SHA_RE.test(sha) ? sha : null;
    } catch {
      return null;
    }
  };

  const shaAfter = await revParse(refAfter);
  if (shaAfter === null) {
    vscode.window.showErrorMessage('mesh-review: no se pudo resolver el commit del fix.');
    return;
  }
  const shaBefore = await revParse(refBefore); // null si no hay padre (primer commit)

  // Cierra pestañas de diff de mesh-review ya abiertas antes de abrir la nueva.
  // La API tabGroups se introdujo en VS Code 1.81; envolver en try/catch para versiones
  // anteriores.
  //
  // El esquema 'git:' solo NO basta como discriminador: el SCM de VS Code (Compare with
  // HEAD) también usa URIs con ese esquema. Se usa la etiqueta de la pestaña porque
  // buildDiffTitle produce un patrón reconocible exclusivo de mesh-review
  // ('basename · tipo · sha7'), tanto en la Opción A (git:) como en la Opción B (untitled:).
  try {
    const toClose: vscode.Tab[] = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input = tab.input;
        if (
          input instanceof vscode.TabInputTextDiff &&
          isMeshReviewDiffTabLabel(tab.label)
        ) {
          toClose.push(tab);
        }
      }
    }
    if (toClose.length > 0) {
      await vscode.window.tabGroups.close(toClose, true);
    }
  } catch {
    // tabGroups no disponible en versiones anteriores de VS Code; continuar sin cerrar.
  }

  // Opción A: git URI scheme (extensión git activa y con un "antes" resoluble).
  // Opción B: fallback — git show + openTextDocument virtual (también cuando no hay padre).
  const gitExt = vscode.extensions.getExtension('vscode.git');
  if (gitExt?.isActive && shaBefore !== null) {
    // Opción A — sin shell-out; la extensión git resuelve el esquema `git:`.
    // El query lleva { path, ref } (formato que espera GitFileSystemProvider).
    const gitUri = (ref: string) => vscode.Uri.from({
      scheme: 'git',
      path: absPath,
      query: JSON.stringify({ path: absPath, ref }),
    });
    await vscode.commands.executeCommand(
      'vscode.diff', gitUri(shaBefore), gitUri(shaAfter), titulo, { preview: true }
    );
  } else {
    // Opción B — fallback con git show + documento virtual.
    // shaBefore null → "antes" vacío (fichero añadido). Args en array, sin shell.
    const showBlob = async (ref: string | null): Promise<string> => {
      if (ref === null) return '';
      try {
        const { stdout } = await execFileAsync('git', ['show', `${ref}:${relPathGit}`], { cwd: gitRoot });
        return stdout;
      } catch {
        return '';
      }
    };
    const [contentBefore, contentAfter] = await Promise.all([showBlob(shaBefore), showBlob(shaAfter)]);

    const [docBefore, docAfter] = await Promise.all([
      vscode.workspace.openTextDocument({ content: contentBefore }),
      vscode.workspace.openTextDocument({ content: contentAfter }),
    ]);

    await vscode.commands.executeCommand(
      'vscode.diff', docBefore.uri, docAfter.uri, titulo, { preview: true }
    );
  }
}

// ---------------------------------------------------------------------------
// activate / deactivate
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('mesh-review');
  output.appendLine('mesh-review: activado (V2 event-sourced)');

  // --- Panel de tarjetas de hilo ---
  const cardsProvider = new ThreadCardsViewProvider(context.extensionUri);

  // ---------------------------------------------------------------------------
  // P1: Badge de respuestas IA nuevas
  // Estado local del workspace, fuera del log de eventos (DA-1): los IDs vistos se persisten
  // en workspaceState entre recargas, pero no contaminan los eventos del log. Se leen al
  // activar y se actualizan cada vez que el panel está visible al refrescar las proyecciones.
  // ---------------------------------------------------------------------------

  const _seenMessageIds = new Set<string>(
    context.workspaceState.get<string[]>('meshReview.seenMessageIds', [])
  );
  /** Proyecciones más recientes; se actualiza en cada llamada a updateBadge. */
  let _currentProjections: ThreadProjection[] = [];

  // ---------------------------------------------------------------------------
  // P6: vista multi-fichero — estado de sesión
  // _allDocs: resultado completo del último scanAllDocs (todas las proyecciones).
  // _allDocsOverflow: docs que no se procesaron por superar SCAN_ALL_DOCS_LIMIT.
  // _currentDocRelPath: ruta relativa del documento activo (excluida de allDocs).
  // _currentGitRoot: git root del workspace activo (para el escaneo y jump-doc).
  // ---------------------------------------------------------------------------
  let _allDocs: Map<string, ThreadProjection[]> = new Map();
  let _allDocsOverflow = 0;
  let _currentDocRelPath: string | undefined;
  let _currentGitRoot: string | null = null;
  // Fix 1: temporizador de debounce para doScanAllDocs; evita escaneos en ráfaga
  // cuando el watcher emite múltiples eventos en rápida sucesión (p. ej. una operación
  // multi-fichero de un agente). 500 ms después del último evento se ejecuta el escaneo.
  let _scanDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Actualiza el badge de la activity bar con el recuento de mensajes IA no vistos.
   * Si el panel está visible, marca todos los mensajes IA actuales como vistos.
   * Si `mesh-review.badge.toast` está activo, muestra un toast al incrementar.
   */
  function updateBadge(projections: ThreadProjection[]): void {
    _currentProjections = projections;
    if (cardsProvider.isVisible) {
      for (const thread of projections) {
        for (const msg of thread.messages) {
          if (!msg.retracted && msg.author.kind === 'ai') {
            _seenMessageIds.add(msg.id);
          }
        }
      }
      // Persiste de forma asíncrona; no esperamos el resultado para no bloquear la UI.
      context.workspaceState.update('meshReview.seenMessageIds', [..._seenMessageIds]).then(
        undefined,
        () => {} // fallo silencioso de workspaceState
      );
    }
    const count = computeUnseenCount(projections, _seenMessageIds);
    cardsProvider.setBadge(count);
    if (count > 0 && vscode.workspace.getConfiguration('mesh-review').get<boolean>('badge.toast') === true) {
      const s = count === 1 ? '' : 's';
      vscode.window.showInformationMessage(`mesh-review: ${count} respuesta${s} nueva${s} de IA.`);
    }
  }

  // Al hacerse visible el panel, limpia el badge actualizando con las proyecciones actuales.
  cardsProvider.setOnVisibleCallback(() => updateBadge(_currentProjections));

  // ---------------------------------------------------------------------------
  // P6: vista multi-fichero — helpers de escaneo y actualización del panel
  // ---------------------------------------------------------------------------

  /**
   * Construye el Map de CardViewModel[] para el panel multi-fichero a partir
   * de los datos del último scanAllDocs, filtrando el documento activo y los
   * hilos no abiertos, y llama a cardsProvider.updateAllDocs.
   *
   * Sin IO: solo transforma los datos ya en memoria.
   */
  function refreshAllDocsPanel(): void {
    const docsForPanel = new Map<string, ReturnType<typeof buildCardViewModels>>();
    for (const [relPath, projections] of _allDocs) {
      if (relPath === _currentDocRelPath) continue; // excluir el doc activo
      const openThreads = projections.filter(p => p.status === 'open');
      if (openThreads.length > 0) {
        docsForPanel.set(relPath, buildCardViewModels(openThreads));
      }
    }
    cardsProvider.updateAllDocs(docsForPanel, _allDocsOverflow);
  }

  /**
   * Ejecuta scanAllDocs y actualiza el estado y el panel multi-fichero.
   * Se llama al activar la extensión y en el watcher de eventos.
   * Fallo silencioso: los errores de IO se registran en el OutputChannel.
   */
  async function doScanAllDocs(gitRoot: string): Promise<void> {
    try {
      const onError = (file: string, err: unknown) =>
        output.appendLine(`mesh-review: error en scan all-docs ${file} — ${err}`);
      const result = await scanAllDocs(gitRoot, onError);
      _allDocs = result.docs;
      _allDocsOverflow = result.overflow;
      refreshAllDocsPanel();
    } catch {
      // fallo silencioso: el panel simplemente no muestra la sección multi-fichero
    }
  }

  // ---------------------------------------------------------------------------
  // refreshEditorState — closure sobre cardsProvider.
  // Se define aquí para capturar cardsProvider sin pasarlo como parámetro.
  // ---------------------------------------------------------------------------
  async function refreshEditorState(editor: vscode.TextEditor): Promise<void> {
    try {
      const docFsPath = editor.document.uri.fsPath;
      const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docFsPath);
      _activeEventDir = eventDir;

      // P6: actualizar el doc activo y el git root para el escaneo multi-fichero
      _currentDocRelPath = docRelPath;
      _currentGitRoot = gitRoot;

      let projections: ThreadProjection[];

      if (gitRoot && await detectLegacy(gitRoot, docRelPath)) {
        if (!migrationPromptedDocs.has(docFsPath)) {
          migrationPromptedDocs.add(docFsPath);
          projections = await handleLegacyMigration(editor, gitRoot, docRelPath, eventDir);
        } else {
          const v1FilePath = buildV1FilePath(gitRoot, docRelPath);
          const sidecar = await readSidecar(v1FilePath);
          projections = sidecar ? project(migrateV1(sidecar)) : [];
        }
      } else {
        const onError = (file: string, err: unknown) =>
          output.appendLine(`mesh-review: error leyendo evento ${file} — ${err}`);
        projections = project(await readEvents(eventDir, onError));
      }

      applyDecorations(editor, projections);
      cardsProvider.update(projections, editor.document.uri);
      updateBadge(projections);
      // P6: re-filtrar allDocs para excluir el nuevo doc activo (sin re-escanear)
      refreshAllDocsPanel();
      // P3: sembrar el override con los rangos iniciales del documento recién cargado.
      // Debe ejecutarse DESPUÉS de cardsProvider.update (proyecciones ya disponibles).
      seedAnchorOverride(editor.document.getText());
    } catch {
      // Fallo silencioso: decoraciones y panel de tarjetas simplemente no cambian.
    }
  }

  // --- Registra el handler de acciones del webview ---
  // El webview emite reply/resolve/edit/retract con ids de hilo y mensaje.
  // Cada acción valida los ids contra las proyecciones antes de escribir.
  cardsProvider.setActionHandler(async (msg) => {
    const docUri = cardsProvider.docUri;
    if (!docUri) return;
    try {
      switch (msg.type) {
        case 'reply':
          // P4: en lugar de abrir InputBox directamente, pide al webview que
          // muestre el compositor multilínea. El submit llega como 'reply-submit'.
          cardsProvider.postMessage({
            type: 'open-composer',
            thread_id: msg.thread_id,
            mode: 'reply',
          });
          break;
        case 'reply-submit':
          // P4: el webview envió el body desde su compositor; lo pasamos directamente.
          await replyToThreadImpl(msg.thread_id, docUri, cardsProvider, updateBadge, msg.body);
          break;
        case 'resolve':
          await resolveThreadImpl(msg.thread_id, docUri, cardsProvider, updateBadge);
          break;
        case 'edit':
          // P4: pide al webview que abra el compositor precargado con el body actual.
          // Necesitamos el body actual del mensaje para pre-rellenar el textarea.
          {
            const { eventDir } = await resolveEventDir(docUri.fsPath);
            const pjs = project(await readEvents(eventDir));
            const th = pjs.find(t => t.thread_id === msg.thread_id);
            const msgData = th?.messages.find(m => m.id === msg.message_id);
            cardsProvider.postMessage({
              type: 'open-composer',
              thread_id: msg.thread_id,
              mode: 'edit',
              message_id: msg.message_id,
              current_body: msgData?.body ?? '',
            });
          }
          break;
        case 'edit-submit':
          // P4: el webview envió el body editado desde su compositor.
          await editMessageImpl(msg.thread_id, msg.message_id, docUri, cardsProvider, updateBadge, msg.body);
          break;
        case 'retract':
          await retractMessageImpl(msg.thread_id, msg.message_id, docUri, cardsProvider, updateBadge);
          break;
        case 'diff':
          await openDiffImpl(msg.thread_id, msg.mode, cardsProvider);
          break;
        case 'assign':
          await assignThreadImpl(msg.thread_id, docUri, cardsProvider, updateBadge);
          break;
        case 'jump-doc': {
          // Salto a un hilo de otro documento (P6 — vista multi-fichero).
          // msg.doc_path ya fue validado como relativo sin .. por isWebviewActionMessage.
          const gitRoot = _currentGitRoot;
          if (!gitRoot) break;

          // Comprobación de contención definitiva en el host (defensa en profundidad).
          const absDocPath = path.join(gitRoot, msg.doc_path);
          const rel = path.relative(gitRoot, absDocPath);
          if (rel.startsWith('..') || path.isAbsolute(rel)) {
            output.appendLine(`mesh-review: jump-doc rechazado por traversal: ${msg.doc_path}`);
            break;
          }

          // Buscar el hilo en las proyecciones del scan (datos del host, no del webview).
          const docProjections = _allDocs.get(msg.doc_path);
          const thread = docProjections?.find(t => t.thread_id === msg.thread_id);
          if (!thread) break;

          // Abrir el documento y saltar al ancla del hilo.
          // Fix 3: el fichero puede haber sido eliminado desde el último escaneo;
          // en ese caso showTextDocument lanza y se informa al usuario, y se
          // dispara un re-escaneo para eliminar el doc de la sección Repositorio.
          const targetUri = vscode.Uri.file(absDocPath);
          try {
            await vscode.window.showTextDocument(targetUri, { preview: false });
          } catch {
            vscode.window.showInformationMessage(
              'mesh-review: el documento ya no existe en disco. Actualizando vista…'
            );
            if (_currentGitRoot) doScanAllDocs(_currentGitRoot).catch(() => {});
            break;
          }
          if ('line_hint' in thread.anchor) {
            await vscode.commands.executeCommand('mesh-review.jumpToComment', thread.anchor);
          }
          break;
        }
        case 'scribe-focus': {
          // Valida que el hilo siga abierto en las proyecciones del host.
          // thread_id ya fue validado como UUID por isWebviewActionMessage.
          const focusThread = cardsProvider.projections.find(t => t.thread_id === msg.thread_id);
          if (!focusThread || focusThread.status !== 'open') {
            vscode.window.showInformationMessage('mesh-review: el hilo ya no está abierto.');
            break;
          }
          if (!_currentGitRoot) {
            vscode.window.showErrorMessage('mesh-review: el documento no está en un repositorio git.');
            break;
          }
          const focusRelPath = path.relative(_currentGitRoot, docUri.fsPath);
          // Misma guarda de traversal que jump-doc: el prompt nunca debe
          // apuntar a un .ai/review/ fuera del repositorio.
          if (focusRelPath.startsWith('..') || path.isAbsolute(focusRelPath)) {
            vscode.window.showErrorMessage('mesh-review: el documento está fuera del repositorio git.');
            break;
          }
          const focusDelayMs = vscode.workspace.getConfiguration('mesh-review').get<number>('scribe.launchDelayMs', 2000);
          const { terminal: focusTerminal, isNew: focusIsNew, ready: focusReady } = ensureScribeTerminal(_currentGitRoot, buildLaunchCommand('scribe'));
          focusTerminal.show();
          await focusReady;
          if (focusIsNew) await new Promise(r => setTimeout(r, focusDelayMs));
          // typeof en runtime, no solo `in`: un line_hint no numérico procedente
          // de un evento corrupto no debe concatenarse en la etiqueta.
          const focusHint = (focusThread.anchor as { line_hint?: unknown }).line_hint;
          const focusLineLabel = typeof focusHint === 'number' && Number.isFinite(focusHint)
            ? `L${focusHint + 1}`
            : '(desanclado)';
          sendToScribe(focusTerminal, buildFocusPrompt(focusRelPath, focusThread.thread_id, focusThread.commentType, focusLineLabel));
          break;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`mesh-review: error en acción del panel — ${errMsg}`);
    }
  });

  // ---------------------------------------------------------------------------
  // P3: Reanclado en vivo por desplazamiento de rangos
  //
  // _anchorOverride — mapa de estado de sesión (DA-4): rangos {start, end} en
  // memoria para cada hilo abierto. Se siembra en seedAnchorOverride (llamado
  // desde refreshEditorState) y se actualiza sincrónicamente en cada evento
  // onDidChangeTextDocument con aritmética pura de offsets (shiftAnchorRange),
  // sin búsqueda de texto. Al guardar, se extrae la nueva cita del documento y
  // se persiste como thread.reanchored. Se descarta al cambiar de documento
  // activo (correcto: la proyección en disco es el estado durable).
  // ---------------------------------------------------------------------------
  const _anchorOverride = new Map<string, { start: number; end: number } | { detached: true }>();

  /**
   * Siembra _anchorOverride con los rangos iniciales de todos los hilos abiertos
   * del documento dado. Usa resolveAnchor una sola vez por hilo (al abrir el
   * documento); las ediciones posteriores aplican shiftAnchorRange en su lugar.
   *
   * Se llama al final de refreshEditorState, tras applyDecorations, de modo que
   * el estado en disco y el estado en memoria parten del mismo punto.
   */
  function seedAnchorOverride(text: string): void {
    _anchorOverride.clear();
    for (const proj of cardsProvider.projections) {
      if (proj.status !== 'open') continue;
      if ('detached' in proj.anchor) {
        _anchorOverride.set(proj.thread_id, { detached: true });
        continue;
      }
      const diskAnchor = proj.anchor as Anchor;
      if (diskAnchor.quote.length < 4) continue; // citas < 4 chars, no rastrear
      const resolved = resolveAnchor(text, diskAnchor);
      if (resolved) {
        _anchorOverride.set(proj.thread_id, {
          start: resolved.startOffset,
          end: resolved.endOffset,
        });
      } else {
        _anchorOverride.set(proj.thread_id, { detached: true });
      }
    }
  }

  /**
   * Actualiza _anchorOverride aplicando los contentChanges del evento de edición.
   * Sin IO, sin búsqueda de texto: solo aritmética de offsets (O(hilos × cambios)).
   * Se llama sincrónicamente en onDidChangeTextDocument.
   */
  function doRecalculate(
    contentChanges: readonly vscode.TextDocumentContentChangeEvent[]
  ): void {
    if (contentChanges.length === 0) return;
    for (const [threadId, override] of _anchorOverride) {
      if ('detached' in override) continue; // ya desanclado, no hay rango que desplazar
      const shifted = shiftAnchorRange(override.start, override.end, contentChanges);
      if (shifted) {
        _anchorOverride.set(threadId, shifted);
      } else {
        // La edición destruyó el rango del ancla → desanclado en memoria
        _anchorOverride.set(threadId, { detached: true });
      }
    }
  }

  // --- Estado inicial ---
  const initialEditor = vscode.window.activeTextEditor;
  if (initialEditor) {
    refreshEditorState(initialEditor).catch(() => {});
  }

  // P6: escaneo inicial de todos los documentos del workspace.
  // Se dispara tras refreshEditorState para que _currentDocRelPath ya esté
  // actualizado cuando refreshAllDocsPanel filtra el doc activo.
  // Solo aplica si hay workspace y git root disponible.
  {
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (ws) {
      getGitRoot(ws.uri.fsPath)
        .then(wsGitRoot => { if (wsGitRoot) doScanAllDocs(wsGitRoot).catch(() => {}); })
        .catch(() => {});
    }
  }

  // --- Refresco al cambiar de editor ---
  // Al cambiar de documento activo, el override se descarta porque ya no es
  // válido para el nuevo documento (DA-4). refreshEditorState lo volverá a
  // sembrar con los rangos del nuevo documento.
  const onEditorChange = vscode.window.onDidChangeActiveTextEditor((editor) => {
    _anchorOverride.clear();
    if (editor) {
      refreshEditorState(editor).catch(() => {});
    }
  });

  // --- Desplazamiento de anclas en memoria al editar (P3, DA-4) ---
  // shiftAnchorRange es aritmética pura (O(hilos × cambios)) → se aplica
  // sincrónicamente en cada evento sin debounce. _anchorOverride queda siempre
  // al día; onDocSave lo lee directamente sin necesidad de flush previo.
  const onDocChange = vscode.workspace.onDidChangeTextDocument((e) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (e.document.uri.fsPath !== editor.document.uri.fsPath) return;
    doRecalculate(e.contentChanges);
  });

  // --- Persistencia de thread.reanchored al guardar (P3, DA-3) ---
  // _anchorOverride está siempre al día (shiftAnchorRange síncrono por keystroke),
  // así que no hay debounce que flushear. Se extrae la nueva cita del texto
  // guardado usando el rango vivo {start, end} para construir el Anchor completo.
  const onDocSave = vscode.workspace.onDidSaveTextDocument(async (doc) => {
    const editor = vscode.window.activeTextEditor;

    if (_anchorOverride.size === 0) return; // nada que persistir
    if (!editor || editor.document.uri.fsPath !== doc.uri.fsPath) return;

    try {
      const { eventDir, gitRoot, docRelPath } = await resolveEventDir(doc.uri.fsPath);
      await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);

      const onError = (file: string, err: unknown) =>
        output.appendLine(`mesh-review: error leyendo evento ${file} — ${err}`);
      const events = await readEvents(eventDir, onError);
      const projections = project(events);

      const docText = doc.getText();
      const headSha = gitRoot ? await getHeadSha(gitRoot) : null;
      const author = await humanAuthor(gitRoot ?? path.dirname(doc.uri.fsPath));

      for (const proj of projections) {
        if (proj.status !== 'open') continue;
        const liveRange = _anchorOverride.get(proj.thread_id);
        if (liveRange === undefined) continue;

        // Construye el nuevo anchor a partir del rango vivo o marca desanclado
        const newAnchorOrDetached: Anchor | { detached: true } =
          'detached' in liveRange
            ? { detached: true }
            : (() => {
                const { start, end } = liveRange;
                const newQuote = docText.slice(start, end);
                const newLineHint = docText.slice(0, start).split('\n').length - 1;
                return { quote: newQuote, char_offset: start, line_hint: newLineHint } satisfies Anchor;
              })();

        if (!anchorChanged(proj.anchor, newAnchorOrDetached)) continue;

        // Escribe thread.reanchored: con anchor actualizado o detached
        const extra: Record<string, unknown> =
          'detached' in newAnchorOrDetached
            ? { detached: true }
            : { anchor: newAnchorOrDetached };

        const event: EventEnvelope = {
          id: randomUUID(),
          version: 2,
          type: 'thread.reanchored',
          thread_id: proj.thread_id,
          author,
          created_at: utcTimestampMs(),
          commit: headSha,
          dirty: false,
          ...extra,
        };

        await writeEvent(eventDir, event);
        const tag = 'detached' in newAnchorOrDetached ? ' (desanclado)' : '';
        output.appendLine(
          `mesh-review: thread.reanchored escrito para hilo ${proj.thread_id}${tag}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      output.appendLine(`mesh-review: error al persistir reanclados — ${msg}`);
    } finally {
      // Independientemente del resultado, limpia el override.
      // refreshEditorState (disparado por el watcher del sidecar) lo volverá
      // a sembrar con los nuevos anclas persistidas.
      _anchorOverride.clear();
    }
  });

  // --- FileSystemWatcher sobre el directorio de eventos del workspace ---
  const watcher = vscode.workspace.createFileSystemWatcher('**/.ai/review/**/*.json');
  // Filtra refrescos del documento activo: solo recarga si el fichero cambiado
  // pertenece al directorio de eventos del documento activo. Para todos los
  // cambios (incluidos los de otros documentos), re-escanea la vista multi-fichero.
  const onSidecarChange = (changedUri: vscode.Uri) => {
    const editor = vscode.window.activeTextEditor;

    // Fix 1: debounce del escaneo multi-fichero (500 ms); cancela el temporizador
    // anterior si llega otro evento antes de que expire (ráfagas de cambios del agente).
    if (_currentGitRoot) {
      clearTimeout(_scanDebounceTimer);
      const gitRoot = _currentGitRoot;
      _scanDebounceTimer = setTimeout(() => {
        doScanAllDocs(gitRoot).catch(() => {});
      }, 500);
    }

    if (!editor) return;
    if (_activeEventDir && !changedUri.fsPath.startsWith(_activeEventDir + path.sep)) {
      return; // evento de otro documento — no recargar el doc activo
    }
    refreshEditorState(editor).catch(() => {});
  };
  watcher.onDidChange(onSidecarChange);
  watcher.onDidCreate(onSidecarChange);
  watcher.onDidDelete(onSidecarChange);

  context.subscriptions.push(
    output,
    onEditorChange,
    onDocChange,
    onDocSave,
    watcher,
    { dispose: disposeDecorationTypes },

    // --- Panel de tarjetas de hilo (webview view) ---
    vscode.window.registerWebviewViewProvider('meshReviewCards', cardsProvider),

    // --- Add Comment ---
    vscode.commands.registerCommand('mesh-review.addComment', async () => {
      try {
        await addCommentImpl(output, cardsProvider, updateBadge);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`mesh-review: error al guardar el comentario — ${msg}`);
        output.appendLine(`mesh-review: error — ${msg}`);
      }
    }),

    // --- Reply to Thread ---
    // No-op silencioso: el árbol fue retirado; la acción la gestiona el webview
    // vía setActionHandler. El command id se mantiene por compatibilidad con keybindings.
    vscode.commands.registerCommand('mesh-review.replyToThread', async () => {}),

    // --- Retract Message ---
    // No-op silencioso: el árbol fue retirado; la acción la gestiona el webview
    // vía setActionHandler. El command id se mantiene por compatibilidad con keybindings.
    vscode.commands.registerCommand('mesh-review.retractMessage', async () => {}),

    // --- Resolve Thread ---
    // No-op silencioso: el árbol fue retirado; la acción la gestiona el webview
    // vía setActionHandler. El command id se mantiene por compatibilidad con keybindings.
    vscode.commands.registerCommand('mesh-review.resolveComment', async () => {}),

    // --- Edit Message ---
    // No-op silencioso: el árbol fue retirado; la acción la gestiona el webview
    // vía setActionHandler. El command id se mantiene por compatibilidad con keybindings.
    vscode.commands.registerCommand('mesh-review.editComment', async () => {}),

    // --- List Comments ---
    vscode.commands.registerCommand('mesh-review.listComments', async () => {
      await vscode.commands.executeCommand('meshReviewCards.focus');
    }),

    // --- Jump to Comment ---
    // Invocado desde el webview al hacer clic en una tarjeta de hilo.
    // Lee docUri desde cardsProvider.
    vscode.commands.registerCommand(
      'mesh-review.jumpToComment',
      async (anchor: Anchor) => {
        try {
          await jumpToAnchorImpl(anchor, cardsProvider);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`mesh-review: error al navegar — ${msg}`);
        }
      }
    ),

    // --- Next Thread (P2) ---
    vscode.commands.registerCommand('mesh-review.nextThread', async () => {
      try {
        await navigateThread('next', cardsProvider);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`mesh-review: error al navegar al siguiente hilo — ${msg}`);
      }
    }),

    // --- Previous Thread (P2) ---
    vscode.commands.registerCommand('mesh-review.previousThread', async () => {
      try {
        await navigateThread('prev', cardsProvider);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`mesh-review: error al navegar al hilo anterior — ${msg}`);
      }
    }),

    // --- Launch Scribe ---
    // Busca el terminal scribe existente o crea uno nuevo. Si ya existe, lo revela
    // sin relanzar claude. El cwd usa _currentGitRoot si está disponible.
    vscode.commands.registerCommand('mesh-review.launchScribe', async () => {
      const existing = getScribeTerminal();
      if (existing) {
        existing.show();
        return;
      }
      const cwd = _currentGitRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const { terminal, ready } = launchScribeTerminal(cwd ?? '', buildLaunchCommand('scribe'));
      terminal.show();
      await ready;
    }),

    // --- Scribe All ---
    // Envía a la sesión scribe el prompt de "procesa todos los hilos pendientes"
    // del documento activo. Valida docUri, git root y existencia de hilos abiertos.
    vscode.commands.registerCommand('mesh-review.scribeAll', async () => {
      const scribeDocUri = cardsProvider.docUri;
      if (!scribeDocUri) {
        vscode.window.showInformationMessage('mesh-review: abre un documento antes de enviar a scribe.');
        return;
      }
      if (!_currentGitRoot) {
        vscode.window.showErrorMessage('mesh-review: el documento no está en un repositorio git.');
        return;
      }
      const openCount = cardsProvider.projections.filter(p => p.status === 'open').length;
      if (openCount === 0) {
        vscode.window.showInformationMessage('mesh-review: sin hilos abiertos en este documento.');
        return;
      }
      const scribeRelPath = path.relative(_currentGitRoot, scribeDocUri.fsPath);
      // Misma guarda de traversal que jump-doc y scribe-focus.
      if (scribeRelPath.startsWith('..') || path.isAbsolute(scribeRelPath)) {
        vscode.window.showErrorMessage('mesh-review: el documento está fuera del repositorio git.');
        return;
      }
      const scribeDelayMs = vscode.workspace.getConfiguration('mesh-review').get<number>('scribe.launchDelayMs', 2000);
      const { terminal: scribeTerminal, isNew: scribeIsNew, ready: scribeReady } = ensureScribeTerminal(_currentGitRoot, buildLaunchCommand('scribe'));
      scribeTerminal.show();
      await scribeReady;
      if (scribeIsNew) await new Promise(r => setTimeout(r, scribeDelayMs));
      sendToScribe(scribeTerminal, buildSendAllPrompt(scribeRelPath));
    })
  );
}

export function deactivate(): void {
  // disposeDecorationTypes se llama vía context.subscriptions en activate().
}

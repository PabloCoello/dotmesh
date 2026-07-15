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
  type EventEnvelope,
  type ThreadProjection,
  type Anchor,
  type CommentType,
} from './sidecar';

import { createAnchor, resolveAnchor } from './anchor';
import { applyDecorations, disposeDecorationTypes } from './decorations';
import { ThreadCardsViewProvider } from './thread-cards';
import { computeUnseenCount, pickNextThread } from './thread-cards-utils';
import { buildDiffTitle, isMeshReviewDiffTabLabel } from './diff-utils';

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
        v.trim() === '' ? 'La respuesta no puede estar vacía' : undefined,
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
        v.trim() === '' ? 'El mensaje no puede estar vacío' : undefined,
    });
    if (input === undefined) return;
    newBody = input.trim();
  }

  if (newBody === currentBody.trim()) {
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

  const currentOffset = editor.document.offsetAt(editor.selection.active);
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
  // Estado efímero de UI (DA-1): los IDs vistos se persisten en workspaceState,
  // no en eventos. Se leen al activar y se actualizan cada vez que el panel
  // está visible al refrescar las proyecciones.
  // ---------------------------------------------------------------------------

  const _seenMessageIds = new Set<string>(
    context.workspaceState.get<string[]>('meshReview.seenMessageIds', [])
  );
  /** Proyecciones más recientes; se actualiza en cada llamada a updateBadge. */
  let _currentProjections: ThreadProjection[] = [];

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
  // refreshEditorState — closure sobre cardsProvider.
  // Se define aquí para capturar cardsProvider sin pasarlo como parámetro.
  // ---------------------------------------------------------------------------
  async function refreshEditorState(editor: vscode.TextEditor): Promise<void> {
    try {
      const docFsPath = editor.document.uri.fsPath;
      const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docFsPath);
      _activeEventDir = eventDir;

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
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`mesh-review: error en acción del panel — ${errMsg}`);
    }
  });

  // ---------------------------------------------------------------------------
  // P3: Reanclado en vivo
  // _anchorOverride — mapa de estado de sesión (DA-4): anclas desplazadas en
  // memoria mientras el usuario edita. No se persiste en workspaceState ni en
  // eventos; se pierde al cerrar VS Code (correcto: la proyección en disco es
  // el estado durable). Se limpia al cambiar de documento activo.
  // _debounceTimer — retrasa el recálculo 150 ms desde el último keystroke.
  // ---------------------------------------------------------------------------
  const _anchorOverride = new Map<string, Anchor | { detached: true }>();
  let _debounceTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Recalcula las anclas en memoria para todos los hilos abiertos con ancla
   * válida en disco. Sin IO: solo string ops + VS Code API de decoraciones.
   *
   * Defensa en profundidad: omite hilos cuya cita tenga menos de 4 chars —
   * una cita tan corta tiene demasiadas ocurrencias en documentos grandes y
   * dispara el peor caso O(n²) del bucle de indexOf en resolveAnchor.
   *
   * Recuperación de detached: cuando el override existente es { detached: true }
   * (la cita fue eliminada), se reintenta resolveAnchor usando el ancla del
   * disco como hint. Si la cita reaparece (p. ej. Ctrl+Z), el override vuelve
   * a ser un ancla válida; solo permanece detached mientras la cita no se
   * encuentre en el texto.
   */
  function doRecalculate(text: string, editor: vscode.TextEditor): void {
    for (const proj of cardsProvider.projections) {
      if (proj.status !== 'open') continue;
      // Solo procesamos hilos con ancla válida en disco
      if ('detached' in proj.anchor) continue;

      const diskAnchor = proj.anchor as Anchor;

      // Defensa en profundidad: citas < 4 chars generan O(n²) en resolveAnchor
      // (demasiadas ocurrencias) y no son anclas útiles. Se omiten sin actualizar
      // el override; conservan el ancla de disco en las decoraciones.
      if (diskAnchor.quote.length < 4) continue;

      // Para la desambiguación usamos la posición más reciente conocida: el
      // override si existe y NO está desanclado; si no (incluido el caso
      // detached), usamos el ancla del disco. Esto permite la recuperación:
      // si el override era detached y la cita reaparece, resolveAnchor la
      // encuentra usando char_offset del disco como punto de referencia.
      const existingOverride = _anchorOverride.get(proj.thread_id);
      const hintAnchor: Anchor =
        existingOverride !== undefined && !('detached' in existingOverride)
          ? (existingOverride as Anchor)
          : diskAnchor;

      const resolved = resolveAnchor(text, hintAnchor);
      if (resolved) {
        const newAnchor: Anchor = {
          quote: diskAnchor.quote,
          char_offset: resolved.startOffset,
          line_hint: text.slice(0, resolved.startOffset).split('\n').length - 1,
        };
        _anchorOverride.set(proj.thread_id, newAnchor);
        if (resolved.uncertain) {
          output.appendLine(
            `mesh-review: ancla de hilo ${proj.thread_id} resuelta con incertidumbre` +
            ` (distancia >200 chars al char_offset esperado)`
          );
        }
      } else {
        // La cita ya no existe en el texto — marcar como desanclado en memoria
        _anchorOverride.set(proj.thread_id, { detached: true });
      }
    }

    // Aplica decoraciones con anclas virtuales (sin IO, sin actualizar el webview)
    if (_anchorOverride.size > 0) {
      const virtualProjections = cardsProvider.projections.map(p => {
        const override = _anchorOverride.get(p.thread_id);
        return override !== undefined ? { ...p, anchor: override } : p;
      });
      applyDecorations(editor, virtualProjections);
    }
  }

  // --- Estado inicial ---
  const initialEditor = vscode.window.activeTextEditor;
  if (initialEditor) {
    refreshEditorState(initialEditor).catch(() => {});
  }

  // --- Refresco al cambiar de editor ---
  // Al cambiar de documento activo, descartamos el override y el timer pendiente
  // porque ya no son válidos para el nuevo documento (DA-4).
  const onEditorChange = vscode.window.onDidChangeActiveTextEditor((editor) => {
    clearTimeout(_debounceTimer);
    _debounceTimer = undefined;
    _anchorOverride.clear();
    if (editor) {
      refreshEditorState(editor).catch(() => {});
    }
  });

  // --- Desplazamiento de anclas en memoria al editar (P3, DA-4) ---
  // Debounce de 150 ms: cancela y reprograma el recálculo por cada evento de
  // cambio. Reduce la presión de CPU en el hilo de extensiones durante la
  // escritura continua; el flush en onDidSaveTextDocument garantiza que el
  // estado sea correcto al guardar aunque el timer no haya disparado.
  const onDocChange = vscode.workspace.onDidChangeTextDocument((e) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (e.document.uri.fsPath !== editor.document.uri.fsPath) return;
    if (e.contentChanges.length === 0) return;

    const newText = e.document.getText();
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => doRecalculate(newText, editor), 150);
  });

  // --- Persistencia de thread.reanchored al guardar (P3, DA-3) ---
  // Flush crítico: si hay un timer de debounce pendiente, lo cancela y ejecuta
  // doRecalculate de forma síncrona con el texto ya guardado ANTES de comparar
  // con anchorChanged y escribir eventos. Sin este flush, un guardado inmediato
  // (<150 ms) tras la última edición persistiría anclas obsoletas porque el
  // _anchorOverride aún no reflejaría los últimos cambios.
  const onDocSave = vscode.workspace.onDidSaveTextDocument(async (doc) => {
    const editor = vscode.window.activeTextEditor;

    // Flush del debounce pendiente con el texto definitivo del fichero guardado
    if (_debounceTimer !== undefined) {
      clearTimeout(_debounceTimer);
      _debounceTimer = undefined;
      if (editor && editor.document.uri.fsPath === doc.uri.fsPath) {
        doRecalculate(doc.getText(), editor);
      }
    }

    if (_anchorOverride.size === 0) return; // nada que persistir
    if (!editor || editor.document.uri.fsPath !== doc.uri.fsPath) return;

    try {
      const { eventDir, gitRoot, docRelPath } = await resolveEventDir(doc.uri.fsPath);
      await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);

      const onError = (file: string, err: unknown) =>
        output.appendLine(`mesh-review: error leyendo evento ${file} — ${err}`);
      const events = await readEvents(eventDir, onError);
      const projections = project(events);

      const headSha = gitRoot ? await getHeadSha(gitRoot) : null;
      const author = await humanAuthor(gitRoot ?? path.dirname(doc.uri.fsPath));

      for (const proj of projections) {
        if (proj.status !== 'open') continue;
        const override = _anchorOverride.get(proj.thread_id);
        if (override === undefined) continue;
        if (!anchorChanged(proj.anchor, override)) continue;

        // Escribe thread.reanchored: con anchor (si sigue ubicado) o detached (si desapareció)
        const extra: Record<string, unknown> =
          'detached' in override
            ? { detached: true }
            : { anchor: override };

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
        const tag = 'detached' in override ? ' (desanclado)' : '';
        output.appendLine(
          `mesh-review: thread.reanchored escrito para hilo ${proj.thread_id}${tag}`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      output.appendLine(`mesh-review: error al persistir reanclados — ${msg}`);
    } finally {
      // Independientemente del resultado, limpia el override.
      // Las proyecciones recargadas por el watcher tomarán el relevo.
      _anchorOverride.clear();
    }
  });

  // --- FileSystemWatcher sobre el directorio de eventos del workspace ---
  const watcher = vscode.workspace.createFileSystemWatcher('**/.ai/review/**/*.json');
  // Filtra refrescos de otros documentos: solo recarga si el fichero cambiado
  // pertenece al directorio de eventos del documento activo.
  const onSidecarChange = (changedUri: vscode.Uri) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (_activeEventDir && !changedUri.fsPath.startsWith(_activeEventDir + path.sep)) {
      return; // evento de otro documento — ignorar
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
    })
  );
}

export function deactivate(): void {
  // disposeDecorationTypes se llama vía context.subscriptions en activate().
}

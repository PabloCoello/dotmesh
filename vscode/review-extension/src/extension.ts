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
  type EventEnvelope,
  type ThreadProjection,
  type Anchor,
  type CommentType,
} from './sidecar';

import { createAnchor, resolveAnchor } from './anchor';
import { applyDecorations, disposeDecorationTypes } from './decorations';
import { ThreadCardsViewProvider } from './thread-cards';

// ---------------------------------------------------------------------------
// Estado de sesión: supresión del aviso de gitignore por workspace
// ---------------------------------------------------------------------------

const suppressedWorkspaces = new Set<string>();

// Documentos cuya oferta de migración V1→V2 ya se mostró en esta sesión.
const migrationPromptedDocs = new Set<string>();

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
 */
async function refreshAfterWrite(
  eventDir: string,
  docUri: vscode.Uri,
  cardsProvider: ThreadCardsViewProvider
): Promise<void> {
  const events = await readEvents(eventDir);
  const projections = project(events);
  cardsProvider.update(projections, docUri);
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
  const v1FilePath = path.join(gitRoot, '.ai', 'review', `${docRelPath}.json`);
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
  const v1FilePath = path.join(gitRoot, '.ai', 'review', `${docRelPath}.json`);
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
  cardsProvider: ThreadCardsViewProvider
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
  await refreshAfterWrite(eventDir, editor.document.uri, cardsProvider);

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
  cardsProvider: ThreadCardsViewProvider
): Promise<void> {
  const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docUri.fsPath);
  await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);

  // Valida el id contra las proyecciones actuales antes de escribir
  const projections = project(await readEvents(eventDir));
  if (!projections.find(t => t.thread_id === threadId)) {
    vscode.window.showErrorMessage('mesh-review: Hilo no encontrado.');
    return;
  }

  const body = await vscode.window.showInputBox({
    title: 'Responder al hilo',
    prompt: 'Escribe la respuesta (Enter para confirmar)',
    ignoreFocusOut: true,
    validateInput: (v) =>
      v.trim() === '' ? 'La respuesta no puede estar vacía' : undefined,
  });
  if (body === undefined || body.trim() === '') return;

  const event: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'message.posted',
    thread_id: threadId,
    author: await humanAuthor(gitRoot ?? path.dirname(docUri.fsPath)),
    created_at: utcTimestampMs(),
    commit: gitRoot ? await getHeadSha(gitRoot) : null,
    dirty: false,
    body: body.trim(),
  };

  await writeEvent(eventDir, event);
  await refreshAfterWrite(eventDir, docUri, cardsProvider);
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
  cardsProvider: ThreadCardsViewProvider
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
  await refreshAfterWrite(eventDir, docUri, cardsProvider);
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
  cardsProvider: ThreadCardsViewProvider
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
  await refreshAfterWrite(eventDir, docUri, cardsProvider);
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
  cardsProvider: ThreadCardsViewProvider
): Promise<void> {
  const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docUri.fsPath);
  await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);

  // Lee proyecciones para validar ids y pre-rellenar el InputBox
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

  const newBody = await vscode.window.showInputBox({
    title: 'Editar mensaje',
    prompt: 'Modifica el texto del mensaje',
    value: currentBody,
    ignoreFocusOut: true,
    validateInput: (v) =>
      v.trim() === '' ? 'El mensaje no puede estar vacío' : undefined,
  });
  if (newBody === undefined) return;

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
  await refreshAfterWrite(eventDir, docUri, cardsProvider);
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
  const titulo = mode === 'range' && openCommit !== null
    ? `${path.basename(docRelPath)} (${openCommit}..${fixCommit})`
    : `${path.basename(docRelPath)} (${fixCommit}^ .. ${fixCommit})`;

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
    await vscode.commands.executeCommand('vscode.diff', gitUri(shaBefore), gitUri(shaAfter), titulo);
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

    await vscode.commands.executeCommand('vscode.diff', docBefore.uri, docAfter.uri, titulo);
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
  // refreshEditorState — closure sobre cardsProvider.
  // Se define aquí para capturar cardsProvider sin pasarlo como parámetro.
  // ---------------------------------------------------------------------------
  async function refreshEditorState(editor: vscode.TextEditor): Promise<void> {
    try {
      const docFsPath = editor.document.uri.fsPath;
      const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docFsPath);

      let projections: ThreadProjection[];

      if (gitRoot && await detectLegacy(gitRoot, docRelPath)) {
        if (!migrationPromptedDocs.has(docFsPath)) {
          migrationPromptedDocs.add(docFsPath);
          projections = await handleLegacyMigration(editor, gitRoot, docRelPath, eventDir);
        } else {
          const v1FilePath = path.join(gitRoot, '.ai', 'review', `${docRelPath}.json`);
          const sidecar = await readSidecar(v1FilePath);
          projections = sidecar ? project(migrateV1(sidecar)) : [];
        }
      } else {
        projections = project(await readEvents(eventDir));
      }

      applyDecorations(editor, projections);
      cardsProvider.update(projections, editor.document.uri);
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
          await replyToThreadImpl(msg.thread_id, docUri, cardsProvider);
          break;
        case 'resolve':
          await resolveThreadImpl(msg.thread_id, docUri, cardsProvider);
          break;
        case 'edit':
          await editMessageImpl(msg.thread_id, msg.message_id, docUri, cardsProvider);
          break;
        case 'retract':
          await retractMessageImpl(msg.thread_id, msg.message_id, docUri, cardsProvider);
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

  // --- Estado inicial ---
  const initialEditor = vscode.window.activeTextEditor;
  if (initialEditor) {
    refreshEditorState(initialEditor).catch(() => {});
  }

  // --- Refresco al cambiar de editor ---
  const onEditorChange = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      refreshEditorState(editor).catch(() => {});
    }
  });

  // --- FileSystemWatcher sobre el directorio de eventos del workspace ---
  const watcher = vscode.workspace.createFileSystemWatcher('**/.ai/review/**/*.json');
  const onSidecarChange = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      refreshEditorState(editor).catch(() => {});
    }
  };
  watcher.onDidChange(onSidecarChange);
  watcher.onDidCreate(onSidecarChange);
  watcher.onDidDelete(onSidecarChange);

  context.subscriptions.push(
    output,
    onEditorChange,
    watcher,
    { dispose: disposeDecorationTypes },

    // --- Panel de tarjetas de hilo (webview view) ---
    vscode.window.registerWebviewViewProvider('meshReviewCards', cardsProvider),

    // --- Add Comment ---
    vscode.commands.registerCommand('mesh-review.addComment', async () => {
      try {
        await addCommentImpl(output, cardsProvider);
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
    )
  );
}

export function deactivate(): void {
  // disposeDecorationTypes se llama vía context.subscriptions en activate().
}

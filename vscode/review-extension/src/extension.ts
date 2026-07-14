import * as vscode from 'vscode';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { rename } from 'node:fs/promises';

import {
  getGitRoot,
  readEvents,
  writeEvent,
  project,
  migrateV1,
  detectLegacy,
  fallbackEventDir,
  getHeadSha,
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
import { ReviewTreeDataProvider, ThreadItem, MessageItem } from './treeview';
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
 * Desde el slice 4, ya no actualiza el TreeView (provider) en la ruta de escritura:
 * el árbol se retira en el slice 6. Solo cardsProvider recibe la actualización.
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
// Refresco de decoraciones y paneles al cambiar de editor
// ---------------------------------------------------------------------------

/**
 * Lee los eventos V2 del directorio del documento activo, proyecta el estado
 * net de los hilos y actualiza el TreeView, el panel de tarjetas y las decoraciones.
 * Comprueba también si existe un sidecar V1 y ofrece migración.
 *
 * No lanza: los errores se capturan silenciosamente.
 */
async function refreshEditorState(
  editor: vscode.TextEditor,
  provider: ReviewTreeDataProvider,
  cardsProvider: ThreadCardsViewProvider
): Promise<void> {
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
    provider.update(projections, editor.document.uri);
    cardsProvider.update(projections, editor.document.uri);
  } catch {
    // Fallo silencioso: decoraciones, TreeView y panel de tarjetas simplemente no cambian.
  }
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
    author: { kind: 'human' },
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
 * Recibe el threadId en lugar de ThreadItem para ser invocable desde el webview.
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
    author: { kind: 'human' },
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
 * Recibe ids planos en lugar de MessageItem para ser invocable desde el webview.
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
    author: { kind: 'human' },
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
 * Recibe threadId en lugar de ThreadItem para ser invocable desde el webview.
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
    author: { kind: 'human' },
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
 * Recibe ids planos en lugar de MessageItem para ser invocable desde el webview.
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
    author: { kind: 'human' },
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
 * Lee el docUri desde cardsProvider en lugar de ReviewTreeDataProvider.
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
// activate / deactivate
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('mesh-review');
  output.appendLine('mesh-review: activado (V2 event-sourced)');

  // --- TreeView --- (se retira en el slice 6)
  const provider = new ReviewTreeDataProvider();
  const treeView = vscode.window.createTreeView('meshReviewComments', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  // --- Panel de tarjetas de hilo ---
  const cardsProvider = new ThreadCardsViewProvider(context.extensionUri);

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
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`mesh-review: error en acción del panel — ${errMsg}`);
    }
  });

  // --- Estado inicial ---
  const initialEditor = vscode.window.activeTextEditor;
  if (initialEditor) {
    refreshEditorState(initialEditor, provider, cardsProvider).catch(() => {});
  }

  // --- Refresco al cambiar de editor ---
  const onEditorChange = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      refreshEditorState(editor, provider, cardsProvider).catch(() => {});
    }
  });

  // --- FileSystemWatcher sobre el directorio de eventos del workspace ---
  const watcher = vscode.workspace.createFileSystemWatcher('**/.ai/review/**/*.json');
  const onSidecarChange = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      refreshEditorState(editor, provider, cardsProvider).catch(() => {});
    }
  };
  watcher.onDidChange(onSidecarChange);
  watcher.onDidCreate(onSidecarChange);
  watcher.onDidDelete(onSidecarChange);

  context.subscriptions.push(
    output,
    treeView,
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
    // Mientras el árbol esté activo, extrae thread_id de ThreadItem.
    // Tras el slice 6 (retirada del árbol), este handler queda como no-op silencioso.
    vscode.commands.registerCommand(
      'mesh-review.replyToThread',
      async (item?: ThreadItem) => {
        const threadId = item instanceof ThreadItem ? item.thread_id : undefined;
        if (!threadId) return;
        const docUri = cardsProvider.docUri;
        if (!docUri) return;
        try {
          await replyToThreadImpl(threadId, docUri, cardsProvider);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`mesh-review: error al responder — ${msg}`);
        }
      }
    ),

    // --- Retract Message ---
    // Mientras el árbol esté activo, extrae threadId y messageId de MessageItem.
    // Tras el slice 6 (retirada del árbol), este handler queda como no-op silencioso.
    vscode.commands.registerCommand(
      'mesh-review.retractMessage',
      async (item?: MessageItem) => {
        const threadId  = item instanceof MessageItem ? item.threadId  : undefined;
        const messageId = item instanceof MessageItem ? item.messageId : undefined;
        if (!threadId || !messageId) return;
        const docUri = cardsProvider.docUri;
        if (!docUri) return;
        try {
          await retractMessageImpl(threadId, messageId, docUri, cardsProvider);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`mesh-review: error al retirar — ${msg}`);
        }
      }
    ),

    // --- Resolve Thread ---
    // Mantiene el id 'mesh-review.resolveComment' para compatibilidad con
    // keybindings existentes. Mientras el árbol esté activo, extrae thread_id de ThreadItem.
    // Tras el slice 6 (retirada del árbol), este handler queda como no-op silencioso.
    vscode.commands.registerCommand(
      'mesh-review.resolveComment',
      async (item?: ThreadItem) => {
        const threadId = item instanceof ThreadItem ? item.thread_id : undefined;
        if (!threadId) return;
        const docUri = cardsProvider.docUri;
        if (!docUri) return;
        try {
          await resolveThreadImpl(threadId, docUri, cardsProvider);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`mesh-review: error al resolver — ${msg}`);
        }
      }
    ),

    // --- Edit Message ---
    // Mantiene el id 'mesh-review.editComment' para compatibilidad con
    // keybindings existentes. Mientras el árbol esté activo, extrae ids de MessageItem.
    // Tras el slice 6 (retirada del árbol), este handler queda como no-op silencioso.
    vscode.commands.registerCommand(
      'mesh-review.editComment',
      async (item?: MessageItem) => {
        const threadId  = item instanceof MessageItem ? item.threadId  : undefined;
        const messageId = item instanceof MessageItem ? item.messageId : undefined;
        if (!threadId || !messageId) return;
        const docUri = cardsProvider.docUri;
        if (!docUri) return;
        try {
          await editMessageImpl(threadId, messageId, docUri, cardsProvider);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`mesh-review: error al editar — ${msg}`);
        }
      }
    ),

    // --- List Comments ---
    vscode.commands.registerCommand('mesh-review.listComments', async () => {
      await vscode.commands.executeCommand('meshReviewComments.focus');
    }),

    // --- Jump to Comment ---
    // Invocado al hacer clic en un ThreadItem o desde el webview.
    // Lee docUri desde cardsProvider (slice 4: migrado de provider a cardsProvider).
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

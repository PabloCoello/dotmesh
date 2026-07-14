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
// Evita que el prompt reaparezca cada vez que el usuario enfoca el editor.
const migrationPromptedDocs = new Set<string>();

// ---------------------------------------------------------------------------
// Helpers de ruta
// ---------------------------------------------------------------------------

/**
 * Calcula el directorio de eventos V2 y el git root para un documento activo.
 * - En repo: eventDir = <gitRoot>/.ai/review/<docRelPath> (directorio, sin .json).
 *   Rechaza rutas que escapen del gitRoot (espejo del guard de sidecarPathForDoc).
 * - Fuera de repo: eventDir = ~/.local/state/mesh-review/<sha256> (directorio).
 */
async function resolveEventDir(
  docFsPath: string
): Promise<{ eventDir: string; gitRoot: string | null; docRelPath: string }> {
  const gitRoot = await getGitRoot(path.dirname(docFsPath));
  if (gitRoot) {
    const rel = path.relative(gitRoot, docFsPath);
    // Guard de escape: rechaza rutas que salgan del gitRoot
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return {
        eventDir: path.join(gitRoot, '.ai', 'review', rel),
        gitRoot,
        docRelPath: rel,
      };
    }
    // Documento fuera del git root (caso de symlink): cae al fallback silenciosamente
  }
  // Fallback: directorio fuera de cualquier repo
  await ensureFallbackDir(); // crea ~/.local/state/mesh-review/ con 0o700
  return {
    eventDir: fallbackEventDir(docFsPath),
    gitRoot: null,
    docRelPath: docFsPath,
  };
}

/**
 * Comprueba si `.ai/review/` está ignorado por git y ofrece añadirlo a
 * `.git/info/exclude` si no lo está. Se suprime por workspace y sesión si
 * el usuario rechaza. También añade `.ai/backlog/` de forma idempotente.
 */
async function checkAndWarnIgnore(gitRoot: string): Promise<void> {
  if (suppressedWorkspaces.has(gitRoot)) return;

  const ignored = await isAiReviewIgnored(gitRoot);
  if (ignored) {
    // .ai/review/ ya está ignorado; añade backlog silenciosamente también
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
    await addToGitExclude(gitRoot);               // .ai/review/
    await addToGitExclude(gitRoot, '.ai/backlog/'); // .ai/backlog/
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

async function refreshAfterWrite(
  eventDir: string,
  docUri: vscode.Uri,
  provider: ReviewTreeDataProvider,
  cardsProvider: ThreadCardsViewProvider
): Promise<void> {
  const events = await readEvents(eventDir);
  const projections = project(events);
  provider.update(projections, docUri);
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

/**
 * Materializa un sidecar V1 como eventos V2 en disco: escribe cada evento
 * migrado y renombra el fichero V1 a `<mismo>.v1.bak` (nunca lo elimina).
 * Devuelve los eventos escritos ([] si no hay sidecar legible).
 */
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
  await rename(v1FilePath, `${v1FilePath}.v1.bak`); // conserva el V1, no lo elimina
  return events;
}

/**
 * Absorbe cualquier sidecar V1 pendiente ANTES de escribir el primer evento V2
 * de un documento. Sin esto, el primer writeEvent crea el directorio V2 y
 * detectLegacy deja de dispararse, dejando los hilos V1 invisibles (huérfanos):
 * el usuario que rechazó la migración y luego añade/responde/resuelve perdería
 * de vista sus comentarios previos. No-op fuera de repo o sin V1 pendiente.
 */
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

/**
 * Ofrece migrar el sidecar V1 a eventos V2.
 * - Aceptado: escribe eventos, renombra el fichero V1 a <mismo>.v1.bak.
 * - Rechazado: proyecta el V1 en memoria sin escribir nada.
 * Nunca elimina el fichero V1.
 */
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

  // Solo leer: proyecta en memoria sin escribir
  return project(migrateV1(sidecar));
}

// ---------------------------------------------------------------------------
// Refresco de decoraciones y TreeView
// ---------------------------------------------------------------------------

/**
 * Lee los eventos V2 del directorio del documento activo, proyecta el estado
 * net de los hilos y actualiza el TreeView y las decoraciones.
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
        // Migración ya ofrecida (y rechazada) en esta sesión: sigue en read-only
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
  provider: ReviewTreeDataProvider,
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

  // Ancla capturada antes de abrir los modales
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

  // Re-ancla si el documento cambió mientras los modales estaban abiertos
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
    // Absorbe un V1 pendiente antes de crear el dir V2, o los hilos V1 quedarían huérfanos.
    await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);
  }

  const id = randomUUID();
  const event: EventEnvelope = {
    id,
    version: 2,
    type: 'thread.opened',
    thread_id: id, // nuevo hilo: thread_id = id del evento de apertura
    author: { kind: 'human' },
    created_at: utcTimestampMs(),
    commit: gitRoot ? await getHeadSha(gitRoot) : null,
    dirty: editor.document.isDirty,
    anchor,
    commentType: type.label as CommentType,
    body: body.trim(),
  };

  await writeEvent(eventDir, event);

  // Refresca inmediatamente sin esperar al FileSystemWatcher
  await refreshAfterWrite(eventDir, editor.document.uri, provider, cardsProvider);

  output.appendLine(`mesh-review: hilo añadido — ${id} (${type.label})`);
  vscode.window.showInformationMessage(`mesh-review: comentario añadido (${type.label})`);
}

/**
 * Responde a un hilo existente (message.posted).
 * Invocado desde el menú contextual de un ThreadItem.
 */
async function replyToThreadImpl(
  item: ThreadItem,
  provider: ReviewTreeDataProvider,
  cardsProvider: ThreadCardsViewProvider
): Promise<void> {
  const docUri = provider.docUri;
  if (!docUri) {
    vscode.window.showErrorMessage('mesh-review: No hay documento cargado en la vista.');
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

  const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docUri.fsPath);
  await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);

  const event: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'message.posted',
    thread_id: item.thread_id,
    author: { kind: 'human' },
    created_at: utcTimestampMs(),
    commit: gitRoot ? await getHeadSha(gitRoot) : null,
    dirty: false,
    body: body.trim(),
  };

  await writeEvent(eventDir, event);
  await refreshAfterWrite(eventDir, docUri, provider, cardsProvider);
  vscode.window.showInformationMessage('mesh-review: respuesta añadida.');
}

/**
 * Retira un mensaje del hilo (message.retracted).
 * Invocado desde el menú contextual de un MessageItem.
 * El mensaje permanece en el log; retracted:true en la proyección.
 */
async function retractMessageImpl(
  item: MessageItem,
  provider: ReviewTreeDataProvider,
  cardsProvider: ThreadCardsViewProvider
): Promise<void> {
  const docUri = provider.docUri;
  if (!docUri) {
    vscode.window.showErrorMessage('mesh-review: No hay documento cargado en la vista.');
    return;
  }

  const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docUri.fsPath);
  await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);

  const event: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'message.retracted',
    thread_id: item.threadId,
    author: { kind: 'human' },
    created_at: utcTimestampMs(),
    commit: gitRoot ? await getHeadSha(gitRoot) : null,
    dirty: false,
    target_message_id: item.messageId,
  };

  await writeEvent(eventDir, event);
  await refreshAfterWrite(eventDir, docUri, provider, cardsProvider);
  vscode.window.showInformationMessage('mesh-review: mensaje retirado.');
}

/**
 * Resuelve el hilo (thread.status-changed → resolved).
 * Invocado desde el menú contextual de un ThreadItem.
 */
async function resolveThreadImpl(
  item: ThreadItem,
  provider: ReviewTreeDataProvider,
  cardsProvider: ThreadCardsViewProvider
): Promise<void> {
  const docUri = provider.docUri;
  if (!docUri) {
    vscode.window.showErrorMessage('mesh-review: No hay documento cargado en la vista.');
    return;
  }

  const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docUri.fsPath);
  await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);

  const event: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'thread.status-changed',
    thread_id: item.thread_id,
    author: { kind: 'human' },
    created_at: utcTimestampMs(),
    commit: gitRoot ? await getHeadSha(gitRoot) : null,
    dirty: false,
    to: 'resolved',
  };

  await writeEvent(eventDir, event);
  await refreshAfterWrite(eventDir, docUri, provider, cardsProvider);
  vscode.window.showInformationMessage('mesh-review: hilo marcado como resuelto.');
}

/**
 * Edita el texto de un mensaje existente (message.revised).
 * El modelo append-only no modifica el evento original; añade un evento revised.
 * Invocado desde el menú contextual de un MessageItem.
 */
async function editMessageImpl(
  item: MessageItem,
  provider: ReviewTreeDataProvider,
  cardsProvider: ThreadCardsViewProvider
): Promise<void> {
  const docUri = provider.docUri;
  if (!docUri) {
    vscode.window.showErrorMessage('mesh-review: No hay documento cargado en la vista.');
    return;
  }

  const { eventDir, gitRoot, docRelPath } = await resolveEventDir(docUri.fsPath);
  // Migra un V1 pendiente antes de leer: si no, el mensaje a editar (aún en V1)
  // no estaría en el directorio de eventos y el pre-relleno saldría vacío.
  await ensureLegacyMigrated(gitRoot, docRelPath, eventDir);

  // Lee el cuerpo actual para pre-rellenar el InputBox
  const events = await readEvents(eventDir);
  const projections = project(events);
  const thread = projections.find(t => t.thread_id === item.threadId);
  const currentBody = thread?.messages.find(m => m.id === item.messageId)?.body ?? '';

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
    thread_id: item.threadId,
    author: { kind: 'human' },
    created_at: utcTimestampMs(),
    commit: gitRoot ? await getHeadSha(gitRoot) : null,
    dirty: false,
    target_message_id: item.messageId,
    body: newBody.trim(),
  };

  await writeEvent(eventDir, event);
  await refreshAfterWrite(eventDir, docUri, provider, cardsProvider);
  vscode.window.showInformationMessage('mesh-review: mensaje actualizado.');
}

/**
 * Navega al ancla de un hilo en el editor.
 * Invocado al hacer clic en un ThreadItem.
 */
async function jumpToAnchorImpl(
  anchor: Anchor,
  provider: ReviewTreeDataProvider
): Promise<void> {
  const docUri = provider.docUri;
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

  // --- TreeView ---
  const provider = new ReviewTreeDataProvider();
  const treeView = vscode.window.createTreeView('meshReviewComments', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  // --- Panel de tarjetas de hilo ---
  const cardsProvider = new ThreadCardsViewProvider(context.extensionUri);

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
  // El glob '**/.ai/review/**/*.json' cubre tanto V2 (eventos en subdirs)
  // como V1 (sidecar plano) — se mantiene igual que en V1 por compatibilidad.
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

    // --- Add Comment (Slice 2) ---
    vscode.commands.registerCommand('mesh-review.addComment', async () => {
      try {
        await addCommentImpl(output, provider, cardsProvider);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`mesh-review: error al guardar el comentario — ${msg}`);
        output.appendLine(`mesh-review: error — ${msg}`);
      }
    }),

    // --- Reply to Thread (Slice 3) — invocado desde ThreadItem ---
    vscode.commands.registerCommand(
      'mesh-review.replyToThread',
      async (item?: ThreadItem) => {
        if (!(item instanceof ThreadItem)) return;
        try {
          await replyToThreadImpl(item, provider, cardsProvider);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`mesh-review: error al responder — ${msg}`);
        }
      }
    ),

    // --- Retract Message (Slice 3) — invocado desde MessageItem ---
    vscode.commands.registerCommand(
      'mesh-review.retractMessage',
      async (item?: MessageItem) => {
        if (!(item instanceof MessageItem)) return;
        try {
          await retractMessageImpl(item, provider, cardsProvider);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`mesh-review: error al retirar — ${msg}`);
        }
      }
    ),

    // --- Resolve Thread (Slice 3) — invocado desde ThreadItem ---
    // Mantiene el id 'mesh-review.resolveComment' para compatibilidad con
    // keybindings existentes de los usuarios.
    vscode.commands.registerCommand(
      'mesh-review.resolveComment',
      async (item?: ThreadItem) => {
        if (!(item instanceof ThreadItem)) return;
        try {
          await resolveThreadImpl(item, provider, cardsProvider);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`mesh-review: error al resolver — ${msg}`);
        }
      }
    ),

    // --- Edit Message (Slice 3) — invocado desde MessageItem ---
    // Mantiene el id 'mesh-review.editComment' para compatibilidad con
    // keybindings existentes de los usuarios.
    vscode.commands.registerCommand(
      'mesh-review.editComment',
      async (item?: MessageItem) => {
        if (!(item instanceof MessageItem)) return;
        try {
          await editMessageImpl(item, provider, cardsProvider);
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

    // --- Jump to Comment (clic en ThreadItem) ---
    // El argumento es un Anchor (quote, line_hint, char_offset), no un Comment V1.
    vscode.commands.registerCommand(
      'mesh-review.jumpToComment',
      async (anchor: Anchor) => {
        try {
          await jumpToAnchorImpl(anchor, provider);
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

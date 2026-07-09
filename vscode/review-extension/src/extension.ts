import * as vscode from 'vscode';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  getGitRoot,
  sidecarPathForDoc,
  fallbackSidecarPath,
  ensureFallbackDir,
  readSidecar,
  writeSidecar,
  isAiReviewIgnored,
  addToGitExclude,
  utcTimestamp,
  type Comment,
  type CommentType,
  type Priority,
  type Sidecar,
} from './sidecar';

import { createAnchor, resolveAnchor } from './anchor';
import { applyDecorations, disposeDecorationTypes } from './decorations';
import { ReviewTreeDataProvider, CommentItem } from './treeview';
import { findCommentAtOffset, mutateCommentById } from './treeview-utils';

// ---------------------------------------------------------------------------
// Estado de sesión: supresión del aviso de gitignore por workspace
// ---------------------------------------------------------------------------

const suppressedWorkspaces = new Set<string>();

// ---------------------------------------------------------------------------
// Helpers de ruta
// ---------------------------------------------------------------------------

/** Calcula la ruta del sidecar y el git root para un documento activo. */
async function resolveSidecarPath(
  docFsPath: string
): Promise<{ sidecarPath: string; gitRoot: string | null; relativeFile: string }> {
  const gitRoot = await getGitRoot(path.dirname(docFsPath));
  if (gitRoot) {
    try {
      return {
        sidecarPath: sidecarPathForDoc(docFsPath, gitRoot),
        gitRoot,
        relativeFile: path.relative(gitRoot, docFsPath),
      };
    } catch {
      // El documento queda fuera del git root (caso real: VS Code abre el
      // proyecto vía symlink y fsPath conserva la ruta del symlink mientras
      // git devuelve la ruta real). Caemos al fallback silenciosamente.
    }
  }
  await ensureFallbackDir();
  return {
    sidecarPath: fallbackSidecarPath(docFsPath),
    gitRoot: null,
    relativeFile: docFsPath,
  };
}

/**
 * Comprueba si `.ai/review/` está ignorado por git y ofrece añadirlo a
 * `.git/info/exclude` si no lo está. Se suprime por workspace y sesión si
 * el usuario rechaza.
 */
async function checkAndWarnIgnore(gitRoot: string): Promise<void> {
  if (suppressedWorkspaces.has(gitRoot)) return;

  const ignored = await isAiReviewIgnored(gitRoot);
  if (ignored) return;

  const choice = await vscode.window.showInformationMessage(
    "mesh-review: `.ai/review/` no está ignorado en este repo. ¿Añadir a `.git/info/exclude`?",
    { modal: false },
    'Añadir',
    'No volver a preguntar'
  );

  if (choice === 'Añadir') {
    await addToGitExclude(gitRoot);
    vscode.window.showInformationMessage(
      'mesh-review: `.ai/review/` añadido a `.git/info/exclude`.'
    );
  } else {
    suppressedWorkspaces.add(gitRoot);
  }
}

// ---------------------------------------------------------------------------
// Refresco de decoraciones y TreeView
// ---------------------------------------------------------------------------

/**
 * Lee el sidecar del documento activo y aplica sus decoraciones.
 * También actualiza el TreeView con los comentarios del documento.
 *
 * No lanza: los errores se capturan silenciosamente para no interrumpir
 * el flujo del usuario.
 */
async function refreshEditorState(
  editor: vscode.TextEditor,
  provider: ReviewTreeDataProvider
): Promise<void> {
  try {
    const { sidecarPath } = await resolveSidecarPath(editor.document.uri.fsPath);
    const sidecar = await readSidecar(sidecarPath);
    const comments = sidecar?.comments ?? [];
    applyDecorations(editor, comments);
    provider.update(comments, editor.document.uri);
  } catch {
    // Fallo silencioso: las decoraciones y el TreeView simplemente no cambian.
  }
}

// ---------------------------------------------------------------------------
// Selección de comentario por cursor (paleta de comandos)
// ---------------------------------------------------------------------------

/**
 * Intenta localizar el comentario bajo el cursor del editor.
 * Si no hay ninguno, muestra un quick pick con todos los abiertos.
 * Devuelve null si el usuario cancela o no hay comentarios abiertos.
 */
async function pickCommentByCursor(
  editor: vscode.TextEditor,
  sidecar: Sidecar | null
): Promise<Comment | null> {
  if (!sidecar) {
    vscode.window.showInformationMessage(
      'mesh-review: Este documento no tiene comentarios de revisión.'
    );
    return null;
  }

  const docText = editor.document.getText();
  const cursorOffset = editor.document.offsetAt(editor.selection.active);

  // Intenta resolver por posición del cursor
  const atCursor = findCommentAtOffset(sidecar.comments, cursorOffset, docText);
  if (atCursor) return atCursor;

  // Sin coincidencia en el cursor: quick pick de todos los abiertos
  const open = sidecar.comments.filter(c => c.status === 'open');
  if (open.length === 0) {
    vscode.window.showInformationMessage(
      'mesh-review: No hay comentarios abiertos en este documento.'
    );
    return null;
  }

  const picked = await vscode.window.showQuickPick(
    open.map(c => ({
      label: `L${c.anchor.line_hint + 1}  ${c.type}·${c.priority}`,
      description: c.body.length > 60 ? c.body.slice(0, 60) + '…' : c.body,
      comment: c,
    })),
    { title: 'Selecciona el comentario a editar', placeHolder: 'Elige un comentario' }
  );

  return picked?.comment ?? null;
}

// ---------------------------------------------------------------------------
// Implementación de los comandos
// ---------------------------------------------------------------------------

async function addCommentImpl(
  output: vscode.OutputChannel,
  provider: ReviewTreeDataProvider
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

  const type = await vscode.window.showQuickPick<vscode.QuickPickItem>(
    [
      { label: 'pregunta', description: 'Pregunta sobre el contenido' },
      { label: 'sugerencia', description: 'Propuesta de mejora' },
      { label: 'edita', description: 'Edición concreta a aplicar' },
      { label: 'comentario', description: 'Nota general' },
    ],
    { title: 'Tipo de comentario', placeHolder: 'Selecciona el tipo' }
  );
  if (!type) return;

  const priority = await vscode.window.showQuickPick<vscode.QuickPickItem>(
    [
      { label: 'alta', description: 'Atención urgente' },
      { label: 'media', description: 'Atención normal' },
      { label: 'baja', description: 'Puede esperar' },
    ],
    { title: 'Prioridad', placeHolder: 'Selecciona la prioridad' }
  );
  if (!priority) return;

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

  const startOffset = editor.document.offsetAt(selection.start);
  const endOffset = editor.document.offsetAt(selection.end);
  const anchor = createAnchor(docText, startOffset, endOffset);

  const { sidecarPath, gitRoot, relativeFile } = await resolveSidecarPath(docFsPath);

  if (gitRoot) {
    await checkAndWarnIgnore(gitRoot);
  }

  const now = utcTimestamp();
  const newComment: Comment = {
    id: randomUUID(),
    anchor,
    type: type.label as CommentType,
    priority: priority.label as Priority,
    body: body.trim(),
    status: 'open',
    created_at: now,
    updated_at: now,
  };

  const existing = await readSidecar(sidecarPath);
  const sidecar: Sidecar = existing ?? {
    version: 1,
    file: relativeFile,
    comments: [],
  };
  sidecar.comments.push(newComment);

  await writeSidecar(sidecarPath, sidecar);

  // Refresca inmediatamente sin esperar al FileSystemWatcher
  applyDecorations(editor, sidecar.comments);
  provider.update(sidecar.comments, editor.document.uri);

  output.appendLine(
    `mesh-review: comentario añadido — ${newComment.id} (${type.label}, ${priority.label})`
  );
  vscode.window.showInformationMessage(
    `mesh-review: comentario añadido (${type.label} · ${priority.label})`
  );
}

async function editCommentImpl(
  itemArg: CommentItem | undefined,
  editor: vscode.TextEditor,
  provider: ReviewTreeDataProvider
): Promise<void> {
  const { sidecarPath } = await resolveSidecarPath(editor.document.uri.fsPath);
  const sidecarPreModal = await readSidecar(sidecarPath);

  // Guarda de sidecar antes de abrir el InputBox para evitar mostrar
  // un formulario que no puede persistirse (sidecar borrado externamente).
  if (!sidecarPreModal && itemArg instanceof CommentItem) {
    vscode.window.showErrorMessage(
      'mesh-review: El sidecar ya no existe en disco; no se puede editar.'
    );
    return;
  }

  const comment =
    itemArg instanceof CommentItem
      ? itemArg.comment
      : await pickCommentByCursor(editor, sidecarPreModal);

  if (!comment) return;
  if (!sidecarPreModal) return;

  const newBody = await vscode.window.showInputBox({
    title: 'Editar comentario',
    prompt: 'Modifica el texto del comentario',
    value: comment.body,
    ignoreFocusOut: true,
    validateInput: (v) =>
      v.trim() === '' ? 'El comentario no puede estar vacío' : undefined,
  });
  if (newBody === undefined) return;

  // Sin cambios: feedback explícito en lugar de retorno mudo
  if (newBody.trim() === comment.body.trim()) {
    vscode.window.showInformationMessage('mesh-review: Sin cambios.');
    return;
  }

  // Relectura tras el modal: evita sobreescribir cambios externos
  const freshSidecar = await readSidecar(sidecarPath);
  if (!freshSidecar) {
    vscode.window.showInformationMessage(
      'mesh-review: el comentario ya no existe (¿resuelto o eliminado externamente?)'
    );
    return;
  }

  const { sidecar: updatedSidecar, found } = mutateCommentById(
    freshSidecar,
    comment.id,
    (c) => ({ ...c, body: newBody.trim(), updated_at: utcTimestamp() })
  );

  if (!found) {
    vscode.window.showInformationMessage(
      'mesh-review: el comentario ya no existe (¿resuelto o eliminado externamente?)'
    );
    return;
  }

  await writeSidecar(sidecarPath, updatedSidecar);
  applyDecorations(editor, updatedSidecar.comments);
  provider.update(updatedSidecar.comments, editor.document.uri);
  vscode.window.showInformationMessage('mesh-review: comentario actualizado.');
}

async function resolveCommentImpl(
  itemArg: CommentItem | undefined,
  editor: vscode.TextEditor,
  provider: ReviewTreeDataProvider
): Promise<void> {
  const { sidecarPath } = await resolveSidecarPath(editor.document.uri.fsPath);
  const sidecarPreModal = await readSidecar(sidecarPath);

  const comment =
    itemArg instanceof CommentItem
      ? itemArg.comment
      : await pickCommentByCursor(editor, sidecarPreModal);

  if (!comment) return;
  if (!sidecarPreModal) return;

  // Relectura tras la selección (QuickPick o TreeView): evita sobreescribir
  // cambios externos realizados mientras el modal estaba abierto.
  const freshSidecar = await readSidecar(sidecarPath);
  if (!freshSidecar) {
    vscode.window.showInformationMessage(
      'mesh-review: el comentario ya no existe (¿resuelto o eliminado externamente?)'
    );
    return;
  }

  const { sidecar: updatedSidecar, found } = mutateCommentById(
    freshSidecar,
    comment.id,
    (c) => ({ ...c, status: 'resolved', updated_at: utcTimestamp() })
  );

  if (!found) {
    vscode.window.showInformationMessage(
      'mesh-review: el comentario ya no existe (¿resuelto o eliminado externamente?)'
    );
    return;
  }

  await writeSidecar(sidecarPath, updatedSidecar);
  applyDecorations(editor, updatedSidecar.comments);
  provider.update(updatedSidecar.comments, editor.document.uri);
  vscode.window.showInformationMessage('mesh-review: comentario marcado como resuelto.');
}

async function deleteCommentImpl(
  itemArg: CommentItem | undefined,
  editor: vscode.TextEditor,
  provider: ReviewTreeDataProvider
): Promise<void> {
  const { sidecarPath } = await resolveSidecarPath(editor.document.uri.fsPath);
  const sidecarPreModal = await readSidecar(sidecarPath);

  // Para eliminar también se admiten resueltos (desde el TreeView y desde paleta)
  let comment: Comment | null = null;

  if (itemArg instanceof CommentItem) {
    comment = itemArg.comment;
  } else {
    if (!sidecarPreModal) {
      vscode.window.showInformationMessage(
        'mesh-review: Este documento no tiene comentarios de revisión.'
      );
      return;
    }

    const all = sidecarPreModal.comments;
    if (all.length === 0) {
      vscode.window.showInformationMessage(
        'mesh-review: Este documento no tiene comentarios de revisión.'
      );
      return;
    }

    // Intenta localizar por posición del cursor (solo abiertos, que son los
    // que tienen decoración). Si no hay coincidencia, ofrece un QuickPick
    // completo que incluye también los resueltos (marcados).
    const docText = editor.document.getText();
    const cursorOffset = editor.document.offsetAt(editor.selection.active);
    const atCursor = findCommentAtOffset(all, cursorOffset, docText);

    if (atCursor) {
      comment = atCursor;
    } else {
      const picked = await vscode.window.showQuickPick(
        all.map(c => ({
          label: `L${c.anchor.line_hint + 1}  ${c.type}·${c.priority}`,
          description:
            (c.status === 'resolved' ? '(resuelta) ' : '') +
            (c.body.length > 60 ? c.body.slice(0, 60) + '…' : c.body),
          comment: c,
        })),
        { title: 'Selecciona el comentario a eliminar', placeHolder: 'Elige un comentario' }
      );
      comment = picked?.comment ?? null;
    }
  }

  if (!comment) return;

  const confirm = await vscode.window.showWarningMessage(
    `mesh-review: ¿Eliminar el comentario "${comment.body.slice(0, 60)}${comment.body.length > 60 ? '…' : ''}"?`,
    { modal: true },
    'Eliminar'
  );
  if (confirm !== 'Eliminar') return;

  // Relectura tras el diálogo de confirmación: evita sobreescribir cambios externos
  const freshSidecar = await readSidecar(sidecarPath);
  if (!freshSidecar) {
    vscode.window.showInformationMessage(
      'mesh-review: el comentario ya no existe (¿resuelto o eliminado externamente?)'
    );
    return;
  }

  const { sidecar: updatedSidecar, found } = mutateCommentById(
    freshSidecar,
    comment.id,
    () => null
  );

  if (!found) {
    vscode.window.showInformationMessage(
      'mesh-review: el comentario ya no existe (¿resuelto o eliminado externamente?)'
    );
    return;
  }

  await writeSidecar(sidecarPath, updatedSidecar);
  applyDecorations(editor, updatedSidecar.comments);
  provider.update(updatedSidecar.comments, editor.document.uri);
  vscode.window.showInformationMessage('mesh-review: comentario eliminado.');
}

async function jumpToCommentImpl(
  comment: Comment,
  provider: ReviewTreeDataProvider
): Promise<void> {
  // Busca un editor visible con el documento del TreeView
  const docUri = provider.docUri;
  let editor: vscode.TextEditor | undefined;

  if (docUri) {
    editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.fsPath === docUri.fsPath
    );
  }

  // Fallback: editor activo
  if (!editor) {
    editor = vscode.window.activeTextEditor;
  }

  if (!editor) {
    vscode.window.showInformationMessage(
      'mesh-review: No hay editor abierto con este documento.'
    );
    return;
  }

  const text = editor.document.getText();
  const resolved = resolveAnchor(text, comment.anchor);

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

  // Trae el editor al frente sin robar el foco del TreeView permanentemente
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
  output.appendLine('mesh-review: activado');

  // --- TreeView ---
  const provider = new ReviewTreeDataProvider();
  const treeView = vscode.window.createTreeView('meshReviewComments', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  // --- Estado inicial ---
  const initialEditor = vscode.window.activeTextEditor;
  if (initialEditor) {
    refreshEditorState(initialEditor, provider).catch(() => {});
  }

  // --- Refresco al cambiar de editor ---
  const onEditorChange = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      refreshEditorState(editor, provider).catch(() => {});
    }
  });

  // --- FileSystemWatcher sobre sidecars del workspace ---
  const watcher = vscode.workspace.createFileSystemWatcher('**/.ai/review/**/*.json');
  const onSidecarChange = () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      refreshEditorState(editor, provider).catch(() => {});
    }
  };
  watcher.onDidChange(onSidecarChange);
  watcher.onDidCreate(onSidecarChange);
  watcher.onDidDelete(onSidecarChange);

  // ---------------------------------------------------------------------------
  // Helper para obtener el editor activo con mensaje de error estándar
  // ---------------------------------------------------------------------------
  async function withActiveEditor<T>(
    fn: (editor: vscode.TextEditor) => Promise<T>
  ): Promise<T | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('mesh-review: No hay editor activo.');
      return undefined;
    }
    return fn(editor);
  }

  context.subscriptions.push(
    output,
    treeView,
    onEditorChange,
    watcher,
    { dispose: disposeDecorationTypes },

    // --- Add Comment ---
    vscode.commands.registerCommand('mesh-review.addComment', async () => {
      try {
        await addCommentImpl(output, provider);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`mesh-review: error al guardar el comentario — ${msg}`);
        output.appendLine(`mesh-review: error — ${msg}`);
      }
    }),

    // --- Edit Comment ---
    // itemArg: CommentItem cuando viene desde el TreeView; undefined desde la paleta.
    vscode.commands.registerCommand(
      'mesh-review.editComment',
      async (itemArg?: CommentItem) => {
        try {
          await withActiveEditor(editor =>
            editCommentImpl(itemArg, editor, provider)
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`mesh-review: error al editar — ${msg}`);
        }
      }
    ),

    // --- Resolve Comment ---
    vscode.commands.registerCommand(
      'mesh-review.resolveComment',
      async (itemArg?: CommentItem) => {
        try {
          await withActiveEditor(editor =>
            resolveCommentImpl(itemArg, editor, provider)
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`mesh-review: error al resolver — ${msg}`);
        }
      }
    ),

    // --- Delete Comment ---
    vscode.commands.registerCommand(
      'mesh-review.deleteComment',
      async (itemArg?: CommentItem) => {
        try {
          await withActiveEditor(editor =>
            deleteCommentImpl(itemArg, editor, provider)
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          vscode.window.showErrorMessage(`mesh-review: error al eliminar — ${msg}`);
        }
      }
    ),

    // --- List Comments ---
    vscode.commands.registerCommand('mesh-review.listComments', async () => {
      await vscode.commands.executeCommand('meshReviewComments.focus');
    }),

    // --- Jump to Comment (desde TreeView al hacer clic en un item) ---
    vscode.commands.registerCommand(
      'mesh-review.jumpToComment',
      async (comment: Comment) => {
        try {
          await jumpToCommentImpl(comment, provider);
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

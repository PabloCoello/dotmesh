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

import { createAnchor } from './anchor';

// ---------------------------------------------------------------------------
// Estado de sesión: supresión del aviso de gitignore por workspace
// ---------------------------------------------------------------------------

const suppressedWorkspaces = new Set<string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Calcula la ruta del sidecar y el git root para un documento activo. */
async function resolveSidecarPath(
  docFsPath: string
): Promise<{ sidecarPath: string; gitRoot: string | null; relativeFile: string }> {
  const gitRoot = await getGitRoot(path.dirname(docFsPath));
  if (gitRoot) {
    return {
      sidecarPath: sidecarPathForDoc(docFsPath, gitRoot),
      gitRoot,
      relativeFile: path.relative(gitRoot, docFsPath),
    };
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
 * `.git/info/exclude` si no lo está. La advertencia se suprime por workspace
 * y sesión si el usuario rechaza.
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
    vscode.window.showInformationMessage('mesh-review: `.ai/review/` añadido a `.git/info/exclude`.');
  } else {
    // Rechaza o cierra el aviso: suprime para el resto de la sesión
    suppressedWorkspaces.add(gitRoot);
  }
}

// ---------------------------------------------------------------------------
// Implementación del comando Add Comment
// ---------------------------------------------------------------------------

async function addCommentImpl(output: vscode.OutputChannel): Promise<void> {
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
    validateInput: (v) => (v.trim() === '' ? 'El comentario no puede estar vacío' : undefined),
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

  output.appendLine(
    `mesh-review: comentario añadido — ${newComment.id} (${type.label}, ${priority.label})`
  );
  vscode.window.showInformationMessage(
    `mesh-review: comentario añadido (${type.label} · ${priority.label})`
  );
}

// ---------------------------------------------------------------------------
// activate / deactivate
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('mesh-review');
  output.appendLine('mesh-review: activado');

  context.subscriptions.push(
    output,
    vscode.commands.registerCommand('mesh-review.addComment', async () => {
      try {
        await addCommentImpl(output);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`mesh-review: error al guardar el comentario — ${msg}`);
        output.appendLine(`mesh-review: error — ${msg}`);
      }
    }),
    vscode.commands.registerCommand('mesh-review.editComment', () => {
      vscode.window.showInformationMessage('mesh-review: Edit Comment — pendiente de fase 4.');
    }),
    vscode.commands.registerCommand('mesh-review.deleteComment', () => {
      vscode.window.showInformationMessage('mesh-review: Delete Comment — pendiente de fase 4.');
    }),
    vscode.commands.registerCommand('mesh-review.resolveComment', () => {
      vscode.window.showInformationMessage('mesh-review: Resolve Comment — pendiente de fase 4.');
    }),
    vscode.commands.registerCommand('mesh-review.listComments', () => {
      vscode.window.showInformationMessage('mesh-review: List Comments — pendiente de fase 4.');
    })
  );
}

export function deactivate(): void {}

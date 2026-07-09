import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('mesh-review');
  output.appendLine('mesh-review: activado');

  const addComment = vscode.commands.registerCommand('mesh-review.addComment', () => {
    vscode.window.showInformationMessage('Mesh Review: Add Comment (stub fase 2)');
  });

  const editComment = vscode.commands.registerCommand('mesh-review.editComment', () => {
    vscode.window.showInformationMessage('Mesh Review: Edit Comment (pendiente de fase 4)');
  });

  const deleteComment = vscode.commands.registerCommand('mesh-review.deleteComment', () => {
    vscode.window.showInformationMessage('Mesh Review: Delete Comment (pendiente de fase 4)');
  });

  const resolveComment = vscode.commands.registerCommand('mesh-review.resolveComment', () => {
    vscode.window.showInformationMessage('Mesh Review: Resolve Comment (pendiente de fase 4)');
  });

  const listComments = vscode.commands.registerCommand('mesh-review.listComments', () => {
    vscode.window.showInformationMessage('Mesh Review: List Comments (pendiente de fase 4)');
  });

  context.subscriptions.push(output, addComment, editComment, deleteComment, resolveComment, listComments);
}

export function deactivate(): void {}

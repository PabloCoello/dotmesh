import * as vscode from 'vscode';
import { MeshRenderHoverProvider } from './hover';

export function activate(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = [
    { language: 'markdown' },
    { language: 'plaintext' },
  ];
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, new MeshRenderHoverProvider()),
  );
}

export function deactivate(): void {}

/**
 * thread-cards.ts — proveedor de vista webview para el panel de tarjetas de hilo.
 *
 * Implementa vscode.WebviewViewProvider. Gestiona el ciclo de vida del webview:
 * HTML inicial con nonce y CSP, postMessage de actualización, clic para saltar
 * al ancla y rehidratación al volver a mostrar el panel.
 */

import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import type { ThreadProjection } from './sidecar';
import { buildCardViewModels, buildCardsHtml, buildBulletStyles } from './thread-cards-utils';

export class ThreadCardsViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _projections: ThreadProjection[] = [];

  constructor(private readonly _extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };
    webviewView.webview.html = this._buildHtml(webviewView.webview);

    // Recibe el clic en una tarjeta anclada y navega al ancla en el editor
    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.type !== 'jump') return;
      const thread = this._projections.find(t => t.thread_id === msg.thread_id);
      if (thread && 'line_hint' in thread.anchor) {
        vscode.commands.executeCommand('mesh-review.jumpToComment', thread.anchor);
      }
    });

    // Al volver a mostrar el panel, el DOM se descartó: rehidrata las tarjetas
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this._push();
    });

    this._push();
  }

  /**
   * Actualiza las proyecciones y reenvía el HTML al webview.
   * Misma firma que ReviewTreeDataProvider.update — se llama en los mismos puntos.
   */
  update(projections: ThreadProjection[], _docUri?: vscode.Uri): void {
    this._projections = projections;
    this._push();
  }

  /** Envía el HTML de tarjetas actualizado al webview mediante postMessage. */
  private _push(): void {
    if (!this._view) return;
    const cards = buildCardViewModels(this._projections);
    const html  = buildCardsHtml(cards);
    this._view.webview.postMessage({ type: 'update', html });
  }

  /** Construye el documento HTML estático del webview con CSP y nonce. */
  private _buildHtml(webview: vscode.Webview): string {
    // Nonce de 32 hex sin guiones — válido como token CSP (UUID v4 hex)
    const nonce = randomUUID().replace(/-/g, '');
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    body {
      background: var(--vscode-sideBar-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      padding: 8px;
      margin: 0;
    }
    .card {
      border: 1px solid var(--vscode-widget-border);
      border-radius: 4px;
      margin-bottom: 8px;
      padding: 8px;
      cursor: pointer;
      overflow-wrap: break-word;
      word-break: break-word;
    }
    .card:hover { background: var(--vscode-list-hoverBackground); }
    .card[data-has-anchor="false"] { cursor: default; opacity: 0.7; }
    .card-header {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 6px;
      font-weight: 600;
    }
    .card-line {
      margin-left: auto;
      font-weight: normal;
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
    }
    .card-meta {
      color: var(--vscode-descriptionForeground);
      font-size: 0.85em;
      margin-top: 2px;
      margin-bottom: 4px;
    }
    .card-message { margin-top: 4px; }
    .empty {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      padding: 8px 0;
    }
    ${buildBulletStyles()}
  </style>
</head>
<body>
  <div id="cards-container"></div>
  <script nonce="${nonce}">
    // acquireVsCodeApi() se llama una sola vez y se guarda en la variable vscode
    const vscode = acquireVsCodeApi();

    window.addEventListener('message', event => {
      if (event.data.type === 'update') {
        document.getElementById('cards-container').innerHTML = event.data.html;
      }
    });

    document.getElementById('cards-container').addEventListener('click', e => {
      const card = e.target.closest('[data-thread-id][data-has-anchor="true"]');
      if (card) {
        vscode.postMessage({ type: 'jump', thread_id: card.dataset.threadId });
      }
    });
  </script>
</body>
</html>`;
  }
}

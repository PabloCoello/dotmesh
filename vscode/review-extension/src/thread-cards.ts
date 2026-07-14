/**
 * thread-cards.ts — proveedor de vista webview para el panel de tarjetas de hilo.
 *
 * Implementa vscode.WebviewViewProvider. Gestiona el ciclo de vida del webview:
 * HTML inicial con nonce y CSP, postMessage de actualización, clic para saltar
 * al ancla, botones de acción con delegación de eventos y rehidratación al volver
 * a mostrar el panel.
 */

import * as vscode from 'vscode';
import { randomUUID } from 'node:crypto';
import type { ThreadProjection } from './sidecar';
import { buildCardViewModels, buildCardsHtml, buildBulletStyles } from './thread-cards-utils';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/**
 * Mensajes de acción que el webview envía al provider.
 * El slice 4 (extension.ts) registra el handler con setActionHandler.
 */
export type WebviewActionMessage =
  | { type: 'reply';   thread_id: string }
  | { type: 'resolve'; thread_id: string }
  | { type: 'edit';    thread_id: string; message_id: string }
  | { type: 'retract'; thread_id: string; message_id: string };

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class ThreadCardsViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _projections: ThreadProjection[] = [];
  private _docUri?: vscode.Uri;
  private _actionHandler?: (msg: WebviewActionMessage) => void | Promise<void>;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  /** URI del documento activo; lo asigna update() y lo lee extension.ts. */
  get docUri(): vscode.Uri | undefined { return this._docUri; }

  /**
   * Registra el callback que despacha los mensajes de acción del webview.
   * Lo llama extension.ts en activate() una sola vez.
   */
  setActionHandler(handler: (msg: WebviewActionMessage) => void | Promise<void>): void {
    this._actionHandler = handler;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [] };
    webviewView.webview.html = this._buildHtml(webviewView.webview);

    // Recibe mensajes del webview: jump al ancla o acciones sobre hilos/mensajes
    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg.type === 'jump') {
        const thread = this._projections.find(t => t.thread_id === msg.thread_id);
        if (thread && 'line_hint' in thread.anchor) {
          vscode.commands.executeCommand('mesh-review.jumpToComment', thread.anchor);
        }
        return;
      }
      // Acciones de hilo/mensaje: reply, resolve, edit, retract
      const actionTypes = ['reply', 'resolve', 'edit', 'retract'];
      if (actionTypes.includes(msg.type) && this._actionHandler) {
        this._actionHandler(msg as WebviewActionMessage);
      }
    });

    // Al volver a mostrar el panel, el DOM se descartó: rehidrata las tarjetas
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this._push();
    });

    this._push();
  }

  /**
   * Actualiza las proyecciones y el docUri activo, y reenvía el HTML al webview.
   * Misma firma que ReviewTreeDataProvider.update — se llama en los mismos puntos.
   */
  update(projections: ThreadProjection[], docUri?: vscode.Uri): void {
    this._projections = projections;
    this._docUri = docUri;
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
    /* Botones de acción — visibles solo al hacer hover sobre la tarjeta o el mensaje */
    .card-actions {
      visibility: hidden;
      display: inline-flex;
      gap: 4px;
      margin-left: auto;
    }
    .msg-actions {
      visibility: hidden;
      display: inline-flex;
      gap: 4px;
    }
    .card:hover .card-actions,
    .card-message:hover .msg-actions { visibility: visible; }
    .action-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: inherit;
      font: inherit;
      padding: 0 2px;
      opacity: 0.7;
    }
    .action-btn:hover { opacity: 1; }
    /* Secciones colapsables de hilos resueltos y desanclados */
    .section-header {
      cursor: pointer;
      font-weight: 600;
      padding: 4px 0;
      list-style: none;
    }
    .section-header::-webkit-details-marker { display: none; }
    .section-header::marker { display: none; }
    details.section-collapsed { margin-top: 12px; }
    ${buildBulletStyles()}
  </style>
</head>
<body>
  <div id="cards-container"></div>
  <script nonce="${nonce}">
    // acquireVsCodeApi() se llama una sola vez y se guarda en la variable vscode
    const vscode = acquireVsCodeApi();

    window.addEventListener('message', event => {
      if (event.data.type !== 'update') return;
      const container = document.getElementById('cards-container');
      // Guardar el estado de plegado antes de reemplazar el innerHTML
      const foldState = {};
      container.querySelectorAll('details[data-section]').forEach(el => {
        foldState[el.dataset.section] = el.open;
      });
      container.innerHTML = event.data.html;
      // Restaurar el estado de plegado; los que no estén en el mapa quedan colapsados
      container.querySelectorAll('details[data-section]').forEach(el => {
        if (el.dataset.section in foldState) {
          el.open = foldState[el.dataset.section];
        }
      });
    });

    document.getElementById('cards-container').addEventListener('click', e => {
      // Delegación de acciones: comprobamos primero si el clic viene de un botón de acción
      const btn = e.target.closest('[data-action]');
      if (btn) {
        const action = btn.dataset.action;
        const threadId = btn.dataset.threadId;
        const messageId = btn.dataset.messageId;
        const msg = { type: action, thread_id: threadId };
        if (action === 'edit' || action === 'retract') {
          msg.message_id = messageId;
        }
        vscode.postMessage(msg);
        return; // evita que el clic también dispare el salto al ancla
      }
      // Salto al ancla: solo si el clic no fue en un botón de acción
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

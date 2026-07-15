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
import { buildCardViewModels, buildCardsHtml, buildBulletStyles, isWebviewActionMessage, type WebviewActionMessage } from './thread-cards-utils';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

// WebviewActionMessage e isWebviewActionMessage viven en thread-cards-utils.ts
// (sin importaciones de VS Code) para poder testearse con node:test.
export type { WebviewActionMessage } from './thread-cards-utils';

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
        // Excepción deliberada al boundary isWebviewActionMessage: jump es solo-lectura.
        // msg.thread_id se usa únicamente como clave de búsqueda en las proyecciones del
        // servidor; el comando ejecuta thread.anchor (dato del servidor), nunca el payload
        // del webview. Si el hilo no existe, no-op. No amplíes este handler para usar
        // campos del webview sin pasarlo por isWebviewActionMessage.
        const thread = this._projections.find(t => t.thread_id === msg.thread_id);
        if (thread && 'line_hint' in thread.anchor) {
          vscode.commands.executeCommand('mesh-review.jumpToComment', thread.anchor);
        }
        return;
      }
      // Acciones de hilo/mensaje: reply, resolve, edit, retract.
      // El mensaje llega del webview (contexto no privilegiado): validamos su
      // forma en runtime antes de confiar en el cast. La CSP ya impide script
      // arbitrario y los *Impl revalidan los ids contra las proyecciones, así
      // que esto es defensa en profundidad para que el límite sea explícito.
      if (this._actionHandler && isWebviewActionMessage(msg)) {
        const thread_id = msg.thread_id;
        Promise.resolve(this._actionHandler(msg))
          .then(() => {
            this._view?.webview.postMessage({ type: 'action-ack', ok: true, thread_id });
          })
          .catch((err: unknown) => {
            const error = err instanceof Error ? err.message : String(err);
            this._view?.webview.postMessage({ type: 'action-ack', ok: false, error, thread_id });
          });
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

  /** Construye el documento HTML estático del webview con CSP y nonces independientes. */
  private _buildHtml(webview: vscode.Webview): string {
    // Dos nonces distintos: uno para style-src y otro para script-src.
    // Usar el mismo nonce para ambas directivas mezcla los permisos; separarlos
    // es más estricto y evita que un script pueda inyectar estilos arbitrarios.
    const nonceStyle  = randomUUID().replace(/-/g, '');
    const nonceScript = randomUUID().replace(/-/g, '');
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonceStyle}'; script-src 'nonce-${nonceScript}';">
  <style nonce="${nonceStyle}">
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
    .action-btn:disabled { opacity: 0.3; cursor: default; }
    /* Error inline bajo la tarjeta tras una acción fallida */
    .card-error {
      display: block;
      margin-top: 4px;
      font-size: 0.85em;
      color: var(--vscode-errorForeground, #f48771);
    }
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
  <script nonce="${nonceScript}">
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

    // Escucha el ACK del provider: re-habilita los botones del hilo y
    // muestra el error inline si la acción falló.
    window.addEventListener('message', event => {
      if (event.data.type !== 'action-ack') return;
      const { ok, error, thread_id } = event.data;
      // Re-habilita todos los botones del hilo
      document.querySelectorAll('[data-thread-id="' + thread_id + '"][data-action]').forEach(b => {
        b.disabled = false;
      });
      if (!ok && error) {
        // Inserta el error inline bajo la tarjeta del hilo
        const card = document.querySelector('[data-thread-id="' + thread_id + '"].card');
        if (card) {
          // Elimina cualquier error previo del mismo hilo
          card.querySelector('.card-error')?.remove();
          const span = document.createElement('span');
          span.className = 'card-error';
          span.textContent = error;
          card.appendChild(span);
        }
      }
    });

    document.getElementById('cards-container').addEventListener('click', e => {
      // Delegación de acciones: comprobamos primero si el clic viene de un botón de acción
      const btn = e.target.closest('[data-action]');
      if (btn) {
        const action = btn.dataset.action;
        const threadId = btn.dataset.threadId;
        const messageId = btn.dataset.messageId;
        // Diff: lee el modo actual, lo envía y alterna el atributo para el próximo clic.
        // El SHA del fix se resuelve en extension.ts desde el event log, no desde el DOM.
        if (action === 'diff') {
          const mode = btn.dataset.diffMode || 'last';
          btn.dataset.diffMode = mode === 'last' ? 'range' : 'last';
          vscode.postMessage({ type: 'diff', thread_id: threadId, mode });
          return;
        }
        btn.disabled = true; // deshabilita mientras la acción está en vuelo
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

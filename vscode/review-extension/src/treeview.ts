/**
 * treeview.ts — proveedor del TreeView lateral de revisión (modelo V2).
 *
 * Árbol de tres niveles:
 *   GroupItem   — grupo por tipo o estado ('resolved'/'detached')
 *   ThreadItem  — hilo de revisión con su ancla y estado
 *   MessageItem — mensaje individual dentro del hilo
 *
 * La lógica pura de agrupación vive en treeview-utils.ts (groupByThread).
 */

import * as vscode from 'vscode';
import type { ThreadProjection, MessageProjection, CommentType } from './sidecar';
import { groupByThread } from './treeview-utils';
import { buildThreadHover } from './decorations-utils';

// ---------------------------------------------------------------------------
// Tipos del árbol
// ---------------------------------------------------------------------------

export type ReviewTreeItem = GroupItem | ThreadItem | MessageItem;

// ---------------------------------------------------------------------------
// GroupItem — nodo raíz de grupo (nivel 1)
// ---------------------------------------------------------------------------

/** Nodo de grupo: un tipo de comentario, 'resolved' o 'detached'. */
export class GroupItem extends vscode.TreeItem {
  readonly kind = 'group' as const;

  constructor(
    public readonly groupKey: CommentType | 'resolved' | 'detached',
    label: string,
    public readonly threads: ThreadProjection[]
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'group';
    this.description = `(${threads.length})`;
    // Resueltos y archivados comienzan colapsados
    if (groupKey === 'resolved' || groupKey === 'detached') {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }
  }
}

// ---------------------------------------------------------------------------
// ThreadItem — hilo de revisión (nivel 2)
// ---------------------------------------------------------------------------

export class ThreadItem extends vscode.TreeItem {
  readonly kind = 'thread' as const;
  readonly thread_id: string;

  constructor(public readonly thread: ThreadProjection) {
    const firstMsg = thread.messages[0];
    const bodyExcerpt = firstMsg
      ? (firstMsg.body.length > 40 ? firstMsg.body.slice(0, 40) + '…' : firstMsg.body)
      : '';
    super(
      `${thread.commentType} — ${bodyExcerpt}`,
      vscode.TreeItemCollapsibleState.Collapsed
    );

    this.thread_id = thread.thread_id;

    this.contextValue =
      thread.status === 'resolved' ? 'resolvedThread' :
      thread.status === 'detached' ? 'detachedThread' :
      'openThread';

    const md = new vscode.MarkdownString(buildThreadHover(thread, vscode.env.language));
    md.supportHtml = true;
    this.tooltip = md;

    const lineLabel =
      'line_hint' in thread.anchor
        ? `L${thread.anchor.line_hint + 1}`
        : '(desanclado)';
    this.description = thread.messages.length > 1
      ? `${lineLabel}  (${thread.messages.length} msgs)`
      : lineLabel;

    this.iconPath = new vscode.ThemeIcon(
      thread.status === 'resolved' ? 'pass-filled' :
      thread.status === 'detached' ? 'debug-disconnect' :
      'comment-discussion'
    );

    // Clic navega al ancla (solo si el hilo no está desanclado)
    if ('line_hint' in thread.anchor) {
      this.command = {
        command: 'mesh-review.jumpToComment',
        title: 'Ir al hilo',
        arguments: [thread.anchor],
      };
    }
  }
}

// ---------------------------------------------------------------------------
// MessageItem — mensaje individual (nivel 3)
// ---------------------------------------------------------------------------

export class MessageItem extends vscode.TreeItem {
  readonly kind = 'message' as const;
  readonly messageId: string;

  constructor(
    public readonly threadId: string,
    public readonly message: MessageProjection
  ) {
    const bodyExcerpt = message.body.length > 52
      ? message.body.slice(0, 52) + '…'
      : message.body;
    super(bodyExcerpt, vscode.TreeItemCollapsibleState.None);

    this.messageId = message.id;
    this.contextValue = message.retracted ? 'retractedMessage' : 'message';
    this.tooltip = message.body;
    this.description = message.retracted
      ? '[retirado]'
      : message.author.kind === 'ai' ? '[IA]' : undefined;
    this.iconPath = new vscode.ThemeIcon(
      message.retracted ? 'circle-slash' : 'comment'
    );
  }
}

// ---------------------------------------------------------------------------
// ReviewTreeDataProvider
// ---------------------------------------------------------------------------

export class ReviewTreeDataProvider
  implements vscode.TreeDataProvider<ReviewTreeItem>
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<ReviewTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _projections: ThreadProjection[] = [];
  private _docUri: vscode.Uri | undefined;

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  /**
   * Actualiza las proyecciones mostradas y dispara un refresco del árbol.
   * Llamar tras cada escritura de evento y al cambiar de editor activo.
   */
  update(projections: ThreadProjection[], docUri?: vscode.Uri): void {
    this._projections = projections;
    this._docUri = docUri;
    this._onDidChangeTreeData.fire();
  }

  /** URI del documento cuyas proyecciones se muestran actualmente. */
  get docUri(): vscode.Uri | undefined {
    return this._docUri;
  }

  // ---------------------------------------------------------------------------
  // TreeDataProvider
  // ---------------------------------------------------------------------------

  getTreeItem(element: ReviewTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ReviewTreeItem): ReviewTreeItem[] {
    if (!element) {
      // Raíz: grupos por tipo/estado
      return groupByThread(this._projections).map(
        g => new GroupItem(g.key, g.label, g.threads)
      );
    }

    if (element instanceof GroupItem) {
      return element.threads.map(t => new ThreadItem(t));
    }

    if (element instanceof ThreadItem) {
      return element.thread.messages.map(
        m => new MessageItem(element.thread_id, m)
      );
    }

    // MessageItem es hoja
    return [];
  }
}

/**
 * treeview.ts — proveedor del TreeView lateral de revisión.
 *
 * Implementa ReviewTreeDataProvider (vscode.TreeDataProvider) con dos
 * niveles de árbol:
 *   - GroupItem:   nodo colapsable con la etiqueta de prioridad
 *   - CommentItem: hoja con el comentario; dispara jumpToComment al hacer clic
 *
 * La lógica pura de agrupación y ordenación vive en treeview-utils.ts para
 * poder testearse directamente con node:test.
 */

import * as vscode from 'vscode';
import type { Comment } from './sidecar';
import { groupCommentsByPriority, type CommentGroup } from './treeview-utils';

// ---------------------------------------------------------------------------
// Tipos del árbol
// ---------------------------------------------------------------------------

export type ReviewTreeItem = GroupItem | CommentItem;

/** Nodo de grupo (prioridad alta / media / baja / resueltos). */
export class GroupItem extends vscode.TreeItem {
  readonly kind = 'group' as const;

  constructor(public readonly group: CommentGroup) {
    super(group.label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'group';
    this.description = `(${group.comments.length})`;
    if (group.priority === 'resolved') {
      this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
    }
  }
}

/** Hoja de comentario individual. */
export class CommentItem extends vscode.TreeItem {
  readonly kind = 'comment' as const;

  constructor(public readonly comment: Comment) {
    const shortBody =
      comment.body.length > 52
        ? comment.body.slice(0, 52) + '…'
        : comment.body;
    const label = `${comment.type} — ${shortBody}`;
    super(label, vscode.TreeItemCollapsibleState.None);

    this.contextValue = comment.status === 'resolved' ? 'resolvedComment' : 'openComment';
    this.tooltip = comment.body;
    this.description = `L${comment.anchor.line_hint + 1}`;

    // Atenuado visual para resueltos: prefijo en description
    if (comment.status === 'resolved') {
      this.description = `[resuelto] L${comment.anchor.line_hint + 1}`;
    }

    // Icono codicon según estado
    this.iconPath = new vscode.ThemeIcon(
      comment.status === 'resolved' ? 'pass-filled' : 'comment'
    );

    // Comando de navegación al hacer clic
    this.command = {
      command: 'mesh-review.jumpToComment',
      title: 'Ir al comentario',
      arguments: [comment],
    };
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

  private _comments: Comment[] = [];
  private _docUri: vscode.Uri | undefined;

  // ---------------------------------------------------------------------------
  // API pública
  // ---------------------------------------------------------------------------

  /**
   * Actualiza los comentarios mostrados y dispara un refresco del árbol.
   * Llamar tras cada mutación del sidecar y al cambiar de editor activo.
   */
  update(comments: Comment[], docUri?: vscode.Uri): void {
    this._comments = comments;
    this._docUri = docUri;
    this._onDidChangeTreeData.fire();
  }

  /** URI del documento cuyo sidecar está mostrándose actualmente. */
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
      // Raíz: devuelve los nodos de grupo
      const groups = groupCommentsByPriority(this._comments);
      return groups.map(g => new GroupItem(g));
    }

    if (element instanceof GroupItem) {
      return element.group.comments.map(c => new CommentItem(c));
    }

    // CommentItem es hoja: sin hijos
    return [];
  }
}

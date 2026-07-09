/**
 * treeview-utils.ts — funciones puras para la vista lateral de revisión.
 *
 * Sin importaciones de VS Code. Testeable directamente con node:test.
 *
 * Exporta:
 *   - groupCommentsByPriority: agrupa y ordena comentarios para el TreeView
 *   - findCommentAtOffset:     localiza el comentario bajo el cursor del editor
 */

import type { Comment, Priority } from './sidecar';
import { resolveAnchor } from './anchor.ts';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const PRIORITY_ORDER: readonly Priority[] = ['alta', 'media', 'baja'];

export const PRIORITY_LABELS: Readonly<Record<Priority, string>> = {
  alta: 'Alta prioridad',
  media: 'Media prioridad',
  baja: 'Baja prioridad',
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CommentGroup {
  priority: Priority | 'resolved';
  label: string;
  comments: Comment[];
}

// ---------------------------------------------------------------------------
// Funciones puras
// ---------------------------------------------------------------------------

/**
 * Agrupa los comentarios por prioridad (alta → media → baja) y añade los
 * resueltos al final como grupo propio.
 *
 * Dentro de cada grupo, los comentarios se ordenan ascendentemente por
 * `anchor.line_hint`. Los grupos sin comentarios se omiten.
 * No muta el array de entrada.
 */
export function groupCommentsByPriority(comments: Comment[]): CommentGroup[] {
  const open = comments.filter(c => c.status === 'open');
  const resolved = comments.filter(c => c.status !== 'open');

  const groups: CommentGroup[] = [];

  for (const priority of PRIORITY_ORDER) {
    const group = open.filter(c => c.priority === priority);
    if (group.length === 0) continue;
    groups.push({
      priority,
      label: PRIORITY_LABELS[priority],
      comments: sortByLineHint(group),
    });
  }

  if (resolved.length > 0) {
    groups.push({
      priority: 'resolved',
      label: 'Resueltos',
      comments: sortByLineHint(resolved),
    });
  }

  return groups;
}

/** Ordena comentarios por line_hint ascendente sin mutar el array. */
function sortByLineHint(comments: Comment[]): Comment[] {
  return [...comments].sort((a, b) => a.anchor.line_hint - b.anchor.line_hint);
}

/**
 * Devuelve el primer comentario abierto cuyo rango resuelto contiene el
 * offset del cursor. Devuelve null si ningún comentario cubre esa posición
 * o si el quote ya no existe en el documento.
 *
 * Cuando varios comentarios se solapan, devuelve el de menor startOffset.
 *
 * @param comments     Lista de comentarios del sidecar.
 * @param cursorOffset Offset de carácter del cursor en el documento.
 * @param docText      Contenido actual del documento.
 */
export function findCommentAtOffset(
  comments: Comment[],
  cursorOffset: number,
  docText: string,
): Comment | null {
  const open = comments.filter(c => c.status === 'open');
  const matches: Array<{ comment: Comment; startOffset: number }> = [];

  for (const comment of open) {
    const range = resolveAnchor(docText, comment.anchor);
    if (!range) continue;
    if (cursorOffset >= range.startOffset && cursorOffset <= range.endOffset) {
      matches.push({ comment, startOffset: range.startOffset });
    }
  }

  if (matches.length === 0) return null;
  matches.sort((a, b) => a.startOffset - b.startOffset);
  return matches[0].comment;
}

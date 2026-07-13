/**
 * treeview-utils.ts — funciones puras para la vista lateral de revisión.
 *
 * Sin importaciones de VS Code. Testeable directamente con node:test.
 *
 * Exporta:
 *   - groupCommentsByType: agrupa y ordena comentarios para el TreeView
 *   - findCommentAtOffset: localiza el comentario bajo el cursor del editor
 */

import type { Comment, CommentType, Sidecar, ThreadProjection } from './sidecar';
import { resolveAnchor } from './anchor.ts';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

// TYPE_ORDER conserva los 5 tipos V1: es el orden del path legacy
// `groupCommentsByType` (agrupación por tipo del sidecar plano). Las anotaciones
// V2 (`referencia`, `supuesto`) NO se añaden aquí a propósito: se exponen por la
// vista por hilos (`groupByThread`, F3a→F4), no por este path. TYPE_LABELS sí las
// incluye porque `Record<CommentType, string>` exige las 7 claves tras ampliar
// CommentType; la asimetría es deliberada y `treeview.test.ts` fija TYPE_ORDER a 5.
export const TYPE_ORDER: readonly CommentType[] = [
  'edita',
  'sugerencia',
  'pregunta',
  'verifica',
  'nota',
];

export const TYPE_LABELS: Readonly<Record<CommentType, string>> = {
  edita:      'Ediciones',
  sugerencia: 'Sugerencias',
  pregunta:   'Preguntas',
  verifica:   'Verificaciones',
  nota:       'Notas',
  referencia: 'Referencias',
  supuesto:   'Supuestos',
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CommentGroup {
  type: CommentType | 'resolved';
  label: string;
  comments: Comment[];
}

// ---------------------------------------------------------------------------
// Thread view — tipos V2
// ---------------------------------------------------------------------------

/**
 * Orden de los 7 tipos para la vista por hilos: accionables primero,
 * anotaciones después. Distinto de TYPE_ORDER (5 tipos, ruta legacy).
 */
export const THREAD_TYPE_ORDER: readonly CommentType[] = [
  'edita', 'sugerencia', 'pregunta', 'verifica',  // accionables
  'nota', 'referencia', 'supuesto',                // anotaciones
];

export interface ThreadGroup {
  key: CommentType | 'resolved' | 'detached';
  label: string;
  threads: ThreadProjection[];
}

// ---------------------------------------------------------------------------
// Funciones puras
// ---------------------------------------------------------------------------

/**
 * Agrupa los comentarios por tipo (edita → sugerencia → pregunta → verifica →
 * nota) y añade los resueltos al final como grupo propio.
 *
 * Dentro de cada grupo, los comentarios se ordenan ascendentemente por
 * `anchor.line_hint`. Los grupos sin comentarios se omiten.
 * No muta el array de entrada.
 */
export function groupCommentsByType(comments: Comment[]): CommentGroup[] {
  const open = comments.filter(c => c.status === 'open');
  const resolved = comments.filter(c => c.status !== 'open');

  const groups: CommentGroup[] = [];

  for (const type of TYPE_ORDER) {
    const group = open.filter(c => c.type === type);
    if (group.length === 0) continue;
    groups.push({
      type,
      label: TYPE_LABELS[type],
      comments: sortByLineHint(group),
    });
  }

  if (resolved.length > 0) {
    groups.push({
      type: 'resolved',
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

/** Extrae el line_hint de un ancla de hilo, o MAX_SAFE_INTEGER si está desanclado. */
function threadLineHint(t: ThreadProjection): number {
  return 'line_hint' in t.anchor ? t.anchor.line_hint : Number.MAX_SAFE_INTEGER;
}

/** Ordena hilos por line_hint ascendente sin mutar el array. */
function sortThreadsByLineHint(threads: ThreadProjection[]): ThreadProjection[] {
  return [...threads].sort((a, b) => threadLineHint(a) - threadLineHint(b));
}

/**
 * Agrupa hilos V2 por tipo (THREAD_TYPE_ORDER) y añade grupos especiales para
 * resueltos y desanclados al final. No muta el array de entrada.
 *
 * Reglas:
 *   1. Entrada vacía → [].
 *   2. Partición por status: 'open', 'resolved', 'detached'.
 *   3. Hilos abiertos: itera THREAD_TYPE_ORDER; omite tipos sin hilos.
 *      Dentro de cada grupo ordena por line_hint ascendente.
 *   4. Si hay resueltos: añade { key: 'resolved', label: 'Resueltos', … } al final.
 *   5. Si hay desanclados: añade { key: 'detached', label: 'Archivados', … } al final.
 */
export function groupByThread(projections: ThreadProjection[]): ThreadGroup[] {
  if (projections.length === 0) return [];

  const open     = projections.filter(t => t.status === 'open');
  const resolved = projections.filter(t => t.status === 'resolved');
  const detached = projections.filter(t => t.status === 'detached');

  const groups: ThreadGroup[] = [];

  for (const type of THREAD_TYPE_ORDER) {
    const subset = open.filter(t => t.commentType === type);
    if (subset.length === 0) continue;
    groups.push({ key: type, label: TYPE_LABELS[type], threads: sortThreadsByLineHint(subset) });
  }

  if (resolved.length > 0) {
    groups.push({ key: 'resolved', label: 'Resueltos', threads: sortThreadsByLineHint(resolved) });
  }

  if (detached.length > 0) {
    groups.push({ key: 'detached', label: 'Archivados', threads: sortThreadsByLineHint(detached) });
  }

  return groups;
}

/**
 * Muta un comentario del sidecar por id operando sobre una copia fresca.
 *
 * El mutador recibe el comentario encontrado y devuelve:
 *   - el comentario modificado (editar, resolver), o
 *   - null para eliminarlo (borrar).
 *
 * No modifica el objeto `sidecar` recibido.
 *
 * @returns `{ sidecar: copia modificada, found: true }` si el id existe.
 *          `{ sidecar: original sin copiar, found: false }` si no existe.
 */
export function mutateCommentById(
  sidecar: Sidecar,
  id: string,
  mutator: (comment: Comment) => Comment | null
): { sidecar: Sidecar; found: boolean } {
  const idx = sidecar.comments.findIndex(c => c.id === id);
  if (idx === -1) {
    return { sidecar, found: false };
  }

  const result = mutator(sidecar.comments[idx]);
  const comments = [...sidecar.comments];

  if (result === null) {
    comments.splice(idx, 1);
  } else {
    comments[idx] = result;
  }

  return { sidecar: { ...sidecar, comments }, found: true };
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

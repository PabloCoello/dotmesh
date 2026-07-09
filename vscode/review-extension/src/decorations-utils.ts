/**
 * decorations-utils.ts — funciones puras para el módulo de decoraciones.
 *
 * Sin importaciones de VS Code ni de Node. Testeable directamente con
 * node:test igual que anchor.ts y sidecar.ts.
 *
 * Colores de la paleta dotmesh — fuente de verdad: docs/DESIGN.md
 * -----------------------------------------------------------------------
 *   teal   #6CB6B0   fondo del rango (con alpha) y prioridad baja
 *   rose   #E59A9A   prioridad alta
 *   gold   #E3C58A   prioridad media
 *   grey   #6e6e6e   texto atenuado (Graphite, «atenuado»)
 *
 * El fondo del rango es teal con alpha 0.18: el gris ink-2 sobre Ink
 * (#121212) quedaba por debajo del umbral de visibilidad. El teal es el
 * color de nota en todo dotmesh (hunk, VS Code accent) y con alpha funciona
 * sobre Paper (blanco) y sobre Ink.
 */

import type { Comment } from './sidecar';

// ---------------------------------------------------------------------------
// Constantes de paleta (DESIGN.md)
// ---------------------------------------------------------------------------

/** Fondo del rango anclado: teal con alpha, legible sobre Ink y Paper. */
export const RANGE_BG_COLOR = 'rgba(108, 182, 176, 0.18)';

/** Mapa prioridad → color dotmesh (DESIGN.md). */
export const PRIORITY_COLORS: Readonly<Record<string, string>> = {
  alta: '#E59A9A',  // rose  — DESIGN.md
  media: '#E3C58A', // gold  — DESIGN.md
  baja: '#6CB6B0',  // teal  — DESIGN.md
};

/** Color de fallback si la prioridad no está reconocida. */
export const FALLBACK_COLOR = '#9e9e9e'; // Graphite secundario

// ---------------------------------------------------------------------------
// Funciones puras
// ---------------------------------------------------------------------------

/**
 * Construye el texto de la etiqueta after: «● tipo·prioridad».
 *
 * Nota: la especificación pide «●» en el color de prioridad y el texto
 * restante en gris #6e6e6e. La Decorations API de VS Code solo permite un
 * color por contentText; con exactamente dos TextEditorDecorationType (según
 * el plan) toda la etiqueta toma el color de prioridad. El resultado sigue
 * siendo informativo y coherente con la paleta dotmesh.
 */
export function buildLabelText(
  comment: Pick<Comment, 'type' | 'priority'>
): string {
  return `● ${comment.type}·${comment.priority}`;
}

/**
 * Devuelve el color dotmesh correspondiente a la prioridad.
 * Devuelve el gris secundario si la prioridad no está reconocida.
 */
export function priorityColor(priority: string): string {
  return PRIORITY_COLORS[priority] ?? FALLBACK_COLOR;
}

/**
 * Construye el texto del mensaje de hover en Markdown: tipo, prioridad,
 * body completo y created_at.
 *
 * Devuelve una cadena cruda; decorations.ts la envuelve en MarkdownString.
 */
export function buildHoverMessage(
  comment: Pick<Comment, 'type' | 'priority' | 'body' | 'created_at'>
): string {
  return [
    `**Tipo:** ${comment.type}  `,
    `**Prioridad:** ${comment.priority}  `,
    `**Creado:** ${comment.created_at}  `,
    '',
    comment.body,
  ].join('\n');
}

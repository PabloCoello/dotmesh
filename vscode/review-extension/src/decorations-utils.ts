/**
 * decorations-utils.ts — funciones puras para el módulo de decoraciones.
 *
 * Sin importaciones de VS Code ni de Node. Testeable directamente con
 * node:test igual que anchor.ts y sidecar.ts.
 *
 * Colores de la paleta dotmesh — fuente de verdad: docs/DESIGN.md
 * -----------------------------------------------------------------------
 *   rose   #E59A9A   edita
 *   gold   #E3C58A   sugerencia
 *   blue   #8FB4E3   pregunta
 *   peach  #FFAA7A   verifica
 *   teal   #6CB6B0   nota
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

/** Mapa tipo → color dotmesh (DESIGN.md). */
export const TYPE_COLORS: Readonly<Record<string, string>> = {
  edita:      '#E59A9A', // rose  — DESIGN.md
  sugerencia: '#E3C58A', // gold  — DESIGN.md
  pregunta:   '#8FB4E3', // blue  — DESIGN.md
  verifica:   '#FFAA7A', // peach — DESIGN.md
  nota:       '#6CB6B0', // teal  — DESIGN.md
};

/** Color de fallback si el tipo no está reconocido. */
export const FALLBACK_COLOR = '#9e9e9e'; // Graphite secundario

// ---------------------------------------------------------------------------
// Funciones puras
// ---------------------------------------------------------------------------

/**
 * Construye el texto de la etiqueta after: «● tipo» o «● tipo·agente».
 *
 * Nota: la especificación pide «●» en el color de tipo y el texto
 * restante en gris #6e6e6e. La Decorations API de VS Code solo permite un
 * color por contentText; con exactamente dos TextEditorDecorationType (según
 * el plan) toda la etiqueta toma el color de tipo. El resultado sigue
 * siendo informativo y coherente con la paleta dotmesh.
 */
export function buildLabelText(
  comment: Pick<Comment, 'type' | 'agent'>
): string {
  return comment.agent
    ? `● ${comment.type}·${comment.agent}`
    : `● ${comment.type}`;
}

/**
 * Devuelve el color dotmesh correspondiente al tipo.
 * Devuelve el gris secundario si el tipo no está reconocido.
 */
export function typeColor(type: string): string {
  return TYPE_COLORS[type] ?? FALLBACK_COLOR;
}

/**
 * Formatea un timestamp ISO 8601 a una cadena legible usando Intl.DateTimeFormat.
 * Parámetros:
 *   iso       — cadena ISO UTC (ej. '2026-07-09T10:00:00Z')
 *   locale    — locale BCP 47 para el formato (por defecto 'es-ES')
 *   timeZone  — zona horaria IANA (ej. 'UTC', 'Europe/Madrid'); si se omite,
 *               se usa la zona horaria local del sistema.
 * Si la fecha no puede parsearse, devuelve la cadena original tal cual.
 *
 * Ejemplo (es-ES, UTC): '9 jul 2026, 10:00'
 */
export function formatTimestamp(
  iso: string,
  locale = 'es-ES',
  timeZone?: string
): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(timeZone !== undefined ? { timeZone } : {}),
  }).format(date);
}

/**
 * Construye el texto del mensaje de hover en Markdown: tipo, agente (si
 * existe), body completo y created_at.
 *
 * Devuelve una cadena cruda; decorations.ts la envuelve en MarkdownString.
 */
export function buildHoverMessage(
  comment: Pick<Comment, 'type' | 'agent' | 'body' | 'created_at'>
): string {
  const lines = [
    `**Tipo:** ${comment.type}  `,
  ];
  if (comment.agent) {
    lines.push(`**Agente:** ${comment.agent}  `);
  }
  lines.push(
    `**Creado:** ${comment.created_at}  `,
    '',
    comment.body,
  );
  return lines.join('\n');
}

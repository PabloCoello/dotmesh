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
 * Escapa los caracteres HTML especiales de una cadena de texto de usuario.
 * Se aplica antes de interpolar contenido libre (body, agent) en el markdown
 * del hover para evitar que el saneador de VS Code elimine texto legítimo
 * (ej. «el tipo <T> no compila» → «el tipo &lt;T&gt; no compila»).
 *
 * Orden obligatorio: & primero para no doble-escapar después.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Construye el mensaje de hover para MarkdownString con HTML saneado por VS Code.
 *
 * Estructura emitida (párrafos separados por línea en blanco):
 *   1. Cabecera: «● tipo» coloreado con el color del tipo + negrita del nombre
 *                y, si hay agente, « · agente» en texto plano (escapado HTML).
 *   2. Separador: línea de 40 «─» en el color del tipo.
 *   3. Body: el texto del comentario (escapado HTML).
 *   4. Pie: fecha legible en gris atenuado (#9e9e9e).
 *
 * El HTML se restringe a `<span style="color:#rrggbb;">` — única sintaxis
 * permitida por el sanitizador de VS Code para MarkdownString con
 * supportHtml = true (fuente: src/vs/base/browser/markdownRenderer.ts).
 * Los valores hex de TYPE_COLORS ya incluyen la mayúscula requerida por la
 * regex del sanitizador: #[0-9a-fA-F]+.
 *
 * El separador (;) tras el valor de color es obligatorio para pasar la
 * regex: /^(color\:(#[0-9a-fA-F]+|var\(...\));)?...$/
 *
 * Parámetros:
 *   comment  — datos del comentario (type, agent, body, created_at)
 *   locale   — locale BCP 47 para la fecha legible (por defecto 'es-ES')
 *   timeZone — zona horaria IANA para la fecha (por defecto: sistema)
 */
export function buildHoverMessage(
  comment: Pick<Comment, 'type' | 'agent' | 'body' | 'created_at'>,
  locale = 'es-ES',
  timeZone?: string
): string {
  const color = typeColor(comment.type);
  const bullet    = `<span style="color:${color};">●</span>`;
  const separator = `<span style="color:${color};">${'─'.repeat(40)}</span>`;

  const agentSuffix = comment.agent ? ` · ${escapeHtml(comment.agent)}` : '';
  const header = `${bullet} **${comment.type}**${agentSuffix}`;

  const footer = `<span style="color:#9e9e9e;">Creado: ${formatTimestamp(comment.created_at, locale, timeZone)}</span>`;

  return [header, separator, escapeHtml(comment.body), footer].join('\n\n');
}

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
 *   sage   #A8CBA0   referencia
 *   lilac  #CBAACB   supuesto
 *   grey   #6e6e6e   texto atenuado (Graphite, «atenuado»)
 *
 * El fondo del rango se tinta con el color del tipo a alpha 0.18 (RANGE_ALPHA):
 * el gris ink-2 sobre Ink (#121212) quedaba por debajo del umbral de
 * visibilidad, pero los pasteles de la paleta a 0.18 funcionan sobre Paper
 * (blanco) y sobre Ink. Un comentario «nota» conserva el teal histórico porque
 * teal es su color de tipo; el resto reciben su propio tinte. Ese fondo es
 * además lo que VS Code pinta en el minimapa, de modo que el tinte por tipo
 * sirve de indicador de color para localizar comentarios en la vista previa;
 * la overview ruler recibe el mismo color a opacidad plena (ver decorations.ts).
 */

import type { Comment, ThreadProjection } from './sidecar';

// ---------------------------------------------------------------------------
// Constantes de paleta (DESIGN.md)
// ---------------------------------------------------------------------------

/** Alpha del fondo del rango anclado: legible sobre Ink y Paper. */
export const RANGE_ALPHA = 0.18;

/**
 * Mapa tipo → color dotmesh (DESIGN.md).
 *
 * Objeto de prototipo nulo: un commentType leído del disco podría ser
 * «__proto__» o «constructor»; con un objeto normal, TYPE_COLORS[type]
 * devolvería un miembro heredado de Object.prototype (truthy) y se saltaría
 * el guard `?? FALLBACK_COLOR` de typeColor(). Sin prototipo, esas claves dan
 * undefined y caen al fallback.
 */
export const TYPE_COLORS: Readonly<Record<string, string>> = Object.freeze(
  Object.assign(Object.create(null) as Record<string, string>, {
    edita:      '#E59A9A', // rose  — DESIGN.md
    sugerencia: '#E3C58A', // gold  — DESIGN.md
    pregunta:   '#8FB4E3', // blue  — DESIGN.md
    verifica:   '#FFAA7A', // peach — DESIGN.md
    nota:       '#6CB6B0', // teal  — DESIGN.md
    referencia: '#A8CBA0', // sage  — DESIGN.md (formalizado en F5)
    supuesto:   '#CBAACB', // lilac — DESIGN.md (formalizado en F5)
  })
);

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
 * Convierte un color «#rrggbb» en «rgba(r, g, b, alpha)» para usarlo como
 * backgroundColor con transparencia. Los valores de TYPE_COLORS y
 * FALLBACK_COLOR ya son hex de 6 dígitos, así que esta es la única forma que
 * necesita soportar; ante una entrada malformada devuelve el hex tal cual, de
 * modo que el color se aplica opaco en vez de romper la decoración.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return hex;
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
 * Escapa los caracteres especiales de Markdown para uso seguro en MarkdownString.
 *
 * Se aplica a valores leídos del disco que se interpolan en MarkdownString con
 * supportHtml = true (p. ej. commentType). Aunque los siete valores reconocidos
 * del schema no contienen metacaracteres, un evento con un tipo desconocido podría
 * traer `*`, `_`, `` ` ``, `[`, `]`, `(`, `)`, `#`, `~` o `\`, que activarían
 * formato Markdown o podrían inyectar contenido adicional en el tooltip.
 *
 * Orden obligatorio: `\` primero para no doble-escapar los demás.
 */
export function escapeMd(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/#/g, '\\#')
    .replace(/~/g, '\\~');
}

/**
 * Escapa los caracteres HTML especiales de una cadena de texto de usuario.
 * Se aplica antes de interpolar contenido libre (body, agent) en el markdown
 * del hover para evitar que el saneador de VS Code elimine texto legítimo
 * (ej. «el tipo <T> no compila» → «el tipo &lt;T&gt; no compila»).
 *
 * Orden obligatorio: & primero para no doble-escapar después.
 *
 * Se escapan también las comillas (« " » → &quot;, « ' » → &#39;) para que el
 * resultado sea seguro al interpolarse dentro de un atributo HTML entre comillas
 * (ej. data-thread-id="…" en buildCardsHtml); sin ello, una comilla en el valor
 * rompería el atributo y permitiría inyectar atributos adicionales.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const header = `${bullet} **${escapeMd(comment.type)}**${agentSuffix}`;

  const footer = `<span style="color:#9e9e9e;">Creado: ${formatTimestamp(comment.created_at, locale, timeZone)}</span>`;

  return [header, separator, escapeHtml(comment.body), footer].join('\n\n');
}

/**
 * Construye el mensaje de hover completo para un hilo entero (todos los
 * mensajes no retractados), reutilizable en el editor y en el TreeView.
 *
 * Estructura emitida (párrafos separados por línea en blanco):
 *   1. Cabecera: «● commentType» coloreado y, si hay assignee, « · assignee».
 *   2. Separador: línea de 40 «─» en el color del tipo.
 *   3. Un bloque por mensaje no retractado. Cada bloque abre con una
 *      meta-línea tenue «── autor · fecha» y, debajo, el cuerpo escapado:
 *        - autor IA: subagent · model (o solo el que esté presente).
 *        - autor humano: name ?? «humano».
 *      La meta-línea gris hace de separador visible entre mensajes, de modo
 *      que un salto de línea dentro de un cuerpo no se confunde con el inicio
 *      de una respuesta nueva. La fecha por mensaje sustituye al antiguo pie
 *      «Creado:», que era redundante con la del primer mensaje.
 *
 * Parámetros:
 *   thread   — hilo proyectado (commentType, assignee, messages)
 *   locale   — locale BCP 47 para la fecha legible (por defecto 'es-ES')
 *   timeZone — zona horaria IANA (por defecto: sistema)
 */
export function buildThreadHover(
  thread: Pick<ThreadProjection, 'commentType' | 'assignee' | 'messages'>,
  locale = 'es-ES',
  timeZone?: string
): string {
  const color     = typeColor(thread.commentType);
  const bullet    = `<span style="color:${color};">●</span>`;
  const separator = `<span style="color:${color};">${'─'.repeat(40)}</span>`;

  const assigneeSuffix = thread.assignee ? ` · ${escapeHtml(thread.assignee)}` : '';
  const header = `${bullet} **${escapeMd(thread.commentType)}**${assigneeSuffix}`;

  const activeMessages = thread.messages.filter(m => !m.retracted);

  const blocks = activeMessages.map(msg => {
    const label = msg.author.kind === 'ai'
      ? ([msg.author.subagent, msg.author.model].filter(Boolean).join(' · ') || 'modelo desconocido')
      : (msg.author.name ?? 'humano');
    // formatTimestamp devuelve created_at crudo si no parsea, así que la fecha
    // también se escapa antes de interpolarla en el HTML del span.
    const when = escapeHtml(formatTimestamp(msg.created_at, locale, timeZone));
    const meta = `<span style="color:#9E9E9E;">── ${escapeHtml(label)} · ${when}</span>`;
    return `${meta}\n\n${escapeHtml(msg.body)}`;
  });

  return [header, separator, ...blocks].join('\n\n');
}

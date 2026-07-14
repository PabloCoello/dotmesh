/**
 * thread-cards-utils.ts — funciones puras para el panel de tarjetas de hilo.
 *
 * Sin importaciones de VS Code. Testeable con node:test.
 * Transforma ThreadProjection[] en modelos de vista y genera el HTML de tarjetas.
 */

import type { ThreadProjection } from './sidecar';
import {
  formatTimestamp,
  escapeHtml,
  TYPE_COLORS,
  FALLBACK_COLOR,
} from './decorations-utils.ts';

// ---------------------------------------------------------------------------
// Interfaces de modelo de vista
// ---------------------------------------------------------------------------

/** Un mensaje individual dentro de una tarjeta (ya sin retractados). */
export interface CardMessage {
  id: string;
  authorLabel: string; // "humano" | author.name | subagent | model
  dateLabel: string;   // formatTimestamp(created_at)
  body: string;        // texto sin escapar; escapeHtml se aplica en buildCardsHtml
}

/** Modelo de vista de un hilo completo para su representación como tarjeta. */
export interface CardViewModel {
  thread_id: string;
  commentType: string;     // CommentType — determina también la clase de color del bullet
  lineLabel: string;       // "L12" | "(desanclado)"
  hasAnchor: boolean;      // true si 'line_hint' in thread.anchor
  status: 'open' | 'resolved' | 'detached'; // estado del hilo
  messages: CardMessage[]; // solo mensajes no retractados
}

// ---------------------------------------------------------------------------
// buildCardViewModels
// ---------------------------------------------------------------------------

/**
 * Transforma un array de proyecciones de hilo en modelos de vista para las tarjetas.
 *
 * - Filtra mensajes retractados.
 * - Computa lineLabel y hasAnchor según si el ancla tiene line_hint.
 * - El color del bullet no viaja en el modelo: lo aplica una clase CSS por tipo
 *   (buildBulletStyles), para no interpolar un atributo style inline en el HTML.
 * - No escapa HTML aquí: la interpolación la hace buildCardsHtml.
 */
export function buildCardViewModels(
  threads: ThreadProjection[],
  locale?: string,
  timeZone?: string
): CardViewModel[] {
  return threads.map(thread => {
    const hasAnchor = 'line_hint' in thread.anchor;
    const lineLabel = hasAnchor
      ? `L${(thread.anchor as { line_hint: number }).line_hint + 1}`
      : '(desanclado)';

    const messages: CardMessage[] = thread.messages
      .filter(m => m.retracted !== true)
      .map(m => {
        const authorLabel = m.author.kind === 'ai'
          ? (m.author.subagent ?? m.author.model ?? 'modelo desconocido')
          : (m.author.name ?? 'humano');
        const dateLabel = formatTimestamp(m.created_at, locale ?? 'es-ES', timeZone);
        return { id: m.id, authorLabel, dateLabel, body: m.body };
      });

    return {
      thread_id: thread.thread_id,
      commentType: thread.commentType,
      lineLabel,
      hasAnchor,
      status: thread.status,
      messages,
    };
  });
}

// ---------------------------------------------------------------------------
// partitionCardsByStatus
// ---------------------------------------------------------------------------

/**
 * Divide un array de CardViewModel en tres cubos según el estado del hilo.
 * Función pura, sin importaciones de VS Code.
 */
export function partitionCardsByStatus(
  cards: CardViewModel[]
): { open: CardViewModel[]; resolved: CardViewModel[]; detached: CardViewModel[] } {
  const open: CardViewModel[] = [];
  const resolved: CardViewModel[] = [];
  const detached: CardViewModel[] = [];
  for (const card of cards) {
    if (card.status === 'open') open.push(card);
    else if (card.status === 'resolved') resolved.push(card);
    else detached.push(card);
  }
  return { open, resolved, detached };
}

// ---------------------------------------------------------------------------
// buildCardsHtml
// ---------------------------------------------------------------------------

/**
 * Genera el fragmento HTML con todas las tarjetas de hilo.
 *
 * Escapa con escapeHtml todo valor derivado de los datos del evento
 * (commentType, lineLabel, authorLabel, dateLabel, body, thread_id) antes de
 * interpolarlo. No se interpola ningún color: el bullet se colorea por la clase
 * `bullet-<tipo>` definida en buildBulletStyles(), de modo que el HTML no lleva
 * atributos style inline (requisito para restringir style-src a un nonce).
 */
export function buildCardsHtml(cards: CardViewModel[]): string {
  if (cards.length === 0) {
    return '<p class="empty">Sin comentarios en este documento.</p>';
  }

  return cards.map(card => {
    const messagesHtml = card.messages.map(msg => `<div class="card-message">
        <div class="card-body">${escapeHtml(msg.body)}</div>
        <div class="card-meta">── ${escapeHtml(msg.authorLabel)} · ${escapeHtml(msg.dateLabel)}</div>
      </div>`).join('\n      ');

    return `<div class="card" data-thread-id="${escapeHtml(card.thread_id)}" data-has-anchor="${card.hasAnchor}">
      <div class="card-header">
        <span class="bullet bullet-${escapeHtml(card.commentType)}">●</span>
        <span class="card-type">${escapeHtml(card.commentType)}</span>
        <span class="card-line">${escapeHtml(card.lineLabel)}</span>
      </div>
      <div class="card-messages">
      ${messagesHtml}</div>
    </div>`;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// buildBulletStyles
// ---------------------------------------------------------------------------

/**
 * Genera las reglas CSS que colorean el bullet de cada tipo desde la paleta
 * dotmesh (TYPE_COLORS). Se inyectan en el <style nonce> del webview.
 *
 * Mover el color a CSS (en vez de un atributo style inline en cada bullet)
 * permite que la CSP restrinja style-src a un nonce, sin 'unsafe-inline'. La
 * regla base `.bullet` fija el fallback; cada `.bullet-<tipo>`, emitida después,
 * lo sobrescribe por igual especificidad y orden de fuente. Un tipo desconocido
 * no tiene regla propia y hereda el fallback.
 *
 * Los nombres de tipo y los hex provienen de constantes de la paleta, nunca de
 * input de usuario, así que no necesitan escaparse.
 */
export function buildBulletStyles(): string {
  const rules = [`.bullet { color: ${FALLBACK_COLOR}; }`];
  for (const [type, hex] of Object.entries(TYPE_COLORS)) {
    rules.push(`.bullet-${type} { color: ${hex}; }`);
  }
  return rules.join('\n');
}

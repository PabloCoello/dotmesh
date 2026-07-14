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
  authorLabel: string; // "humano" | author.name | "subagent · model" | model | "modelo desconocido"
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
  fixCommit: string | null;   // SHA del último message.posted de IA con commit !== null
  openCommit: string | null;  // openedCommit del hilo (base para rango acumulado)
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
          ? ([m.author.subagent, m.author.model].filter(Boolean).join(' · ') || 'modelo desconocido')
          : (m.author.name ?? 'humano');
        const dateLabel = formatTimestamp(m.created_at, locale ?? 'es-ES', timeZone);
        return { id: m.id, authorLabel, dateLabel, body: m.body };
      });

    const lastAiFix = thread.messages
      .filter(m => !m.retracted && m.author.kind === 'ai' && m.commit !== null)
      .at(-1);

    return {
      thread_id: thread.thread_id,
      commentType: thread.commentType,
      lineLabel,
      hasAnchor,
      status: thread.status,
      messages,
      fixCommit: lastAiFix?.commit ?? null,
      openCommit: thread.openedCommit,
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
 * Genera el HTML de una tarjeta de hilo.
 *
 * - withActions=true: añade botones de acción en la cabecera y al pie de cada
 *   mensaje (solo para hilos abiertos).
 * - Añade data-message-id en cada div.card-message.
 * - Todo valor derivado de datos de evento se escapa con escapeHtml.
 * - Sin atributos style inline (requisito para restringir style-src a un nonce).
 */
function buildCardHtml(card: CardViewModel, withActions: boolean): string {
  const tid = escapeHtml(card.thread_id);

  const cardActionsHtml = withActions
    ? `\n        <span class="card-actions"><button class="action-btn" data-action="reply" data-thread-id="${tid}">↩</button><button class="action-btn" data-action="resolve" data-thread-id="${tid}">✓</button></span>`
    : '';

  const messagesHtml = card.messages.map(msg => {
    const mid = escapeHtml(msg.id);
    const msgActionsHtml = withActions
      ? `\n        <span class="msg-actions"><button class="action-btn" data-action="edit" data-thread-id="${tid}" data-message-id="${mid}">✎</button><button class="action-btn" data-action="retract" data-thread-id="${tid}" data-message-id="${mid}">⊘</button></span>`
      : '';
    return `<div class="card-message" data-message-id="${mid}">
        <div class="card-body">${escapeHtml(msg.body)}</div>
        <div class="card-meta">── ${escapeHtml(msg.authorLabel)} · ${escapeHtml(msg.dateLabel)}</div>${msgActionsHtml}
      </div>`;
  }).join('\n      ');

  return `<div class="card" data-thread-id="${tid}" data-has-anchor="${card.hasAnchor}">
      <div class="card-header">
        <span class="bullet bullet-${escapeHtml(card.commentType)}">●</span>
        <span class="card-type">${escapeHtml(card.commentType)}</span>
        <span class="card-line">${escapeHtml(card.lineLabel)}</span>${cardActionsHtml}
      </div>
      <div class="card-messages">
      ${messagesHtml}</div>
    </div>`;
}

/**
 * Genera el fragmento HTML con todas las tarjetas de hilo, particionadas por estado.
 *
 * - Hilos abiertos: lista plana (sin agrupar por tipo), con botones de acción.
 * - Hilos resueltos: sección <details data-section="resolved"> colapsada por defecto.
 * - Hilos desanclados: sección <details data-section="detached"> colapsada por defecto.
 * - Omite la sección completa si su cubo está vacío.
 * - Sin atributos style inline (requisito de CSP con nonce).
 */
export function buildCardsHtml(cards: CardViewModel[]): string {
  const { open, resolved, detached } = partitionCardsByStatus(cards);

  if (open.length === 0 && resolved.length === 0 && detached.length === 0) {
    return '<p class="empty">Sin comentarios en este documento.</p>';
  }

  const parts: string[] = [];

  // Hilos abiertos: lista plana con botones de acción
  for (const card of open) {
    parts.push(buildCardHtml(card, true));
  }

  // Hilos resueltos: sección colapsada
  if (resolved.length > 0) {
    const inner = resolved.map(c => buildCardHtml(c, false)).join('\n');
    parts.push(
      `<details data-section="resolved" class="section-collapsed">\n` +
      `<summary class="section-header">Resueltos (${resolved.length})</summary>\n` +
      `${inner}\n` +
      `</details>`
    );
  }

  // Hilos desanclados: sección colapsada
  if (detached.length > 0) {
    const inner = detached.map(c => buildCardHtml(c, false)).join('\n');
    parts.push(
      `<details data-section="detached" class="section-collapsed">\n` +
      `<summary class="section-header">Desanclados (${detached.length})</summary>\n` +
      `${inner}\n` +
      `</details>`
    );
  }

  return parts.join('\n');
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

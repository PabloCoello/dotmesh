/**
 * thread-cards-utils.ts — funciones puras para el panel de tarjetas de hilo.
 *
 * Sin importaciones de VS Code. Testeable con node:test.
 * Transforma ThreadProjection[] en modelos de vista y genera el HTML de tarjetas.
 */

import type { ThreadProjection } from './sidecar';
import { isUuid, VALID_COMMENT_TYPES } from './sidecar.ts';
import {
  formatTimestamp,
  escapeHtml,
  TYPE_COLORS,
  FALLBACK_COLOR,
} from './decorations-utils.ts';

// ---------------------------------------------------------------------------
// WebviewActionMessage e isWebviewActionMessage
// ---------------------------------------------------------------------------

/**
 * ACK que el provider posta de vuelta al webview tras completar una acción.
 * El webview lo usa para re-habilitar el botón y mostrar errores inline.
 * No forma parte de WebviewActionMessage (fluye en dirección opuesta).
 */
export type WebviewAckMessage = {
  type: 'action-ack';
  ok: boolean;
  error?: string;
  thread_id: string;
};

/**
 * Mensajes de acción que el webview envía al provider.
 * El slice 4 (extension.ts) registra el handler con setActionHandler.
 *
 * Vive aquí (sin importaciones de VS Code) para poder ser testeable con node:test
 * y para que isWebviewActionMessage esté junto al tipo que valida.
 */
export type WebviewActionMessage =
  | { type: 'reply';         thread_id: string }
  | { type: 'resolve';       thread_id: string }
  | { type: 'edit';          thread_id: string; message_id: string }
  | { type: 'retract';       thread_id: string; message_id: string }
  | { type: 'diff';          thread_id: string; mode: 'last' | 'range' }
  | { type: 'reply-submit';  thread_id: string; body: string }
  | { type: 'edit-submit';   thread_id: string; message_id: string; body: string }
  | { type: 'assign';        thread_id: string }
  | { type: 'jump-doc';      thread_id: string; doc_path: string };

/**
 * Valida que una ruta de documento sea relativa y sin segmentos de traversal.
 *
 * Reglas:
 * - No vacía.
 * - No absoluta (ni Unix `/…` ni Windows `C:\…`).
 * - Sin segmentos `..` (separador `/` o `\`).
 *
 * El host (extension.ts) aplica además una comprobación de contención con
 * `path.relative` antes de abrir el documento.
 */
function isRelativeSafePath(p: unknown): p is string {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return false;
  const segments = p.split(/[/\\]/);
  return !segments.some(seg => seg === '..');
}

/**
 * Valida en runtime que un mensaje del webview es una acción bien formada.
 * Boundary de seguridad entre el contexto no privilegiado del webview y la extensión:
 * ningún valor del webview cruza este límite sin pasar por aquí.
 *
 * - thread_id: string no vacío en los cinco tipos.
 * - message_id: string no vacío en edit/retract.
 * - mode: literal 'last' | 'range' en diff (no se interpola en comandos de shell).
 * - doc_path: ruta relativa sin traversal en jump-doc.
 */
export function isWebviewActionMessage(msg: unknown): msg is WebviewActionMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;
  // thread_id y message_id deben ser UUIDs canónicos: rechaza cadenas arbitrarias
  // y valores manipulados del webview (p. ej. traversal: «../../.ssh/evil»).
  const hasThread  = typeof m.thread_id  === 'string' && isUuid(m.thread_id);
  const hasMessage = typeof m.message_id === 'string' && isUuid(m.message_id);
  switch (m.type) {
    case 'reply':
    case 'resolve':
      return hasThread;
    case 'edit':
    case 'retract':
      return hasThread && hasMessage;
    case 'diff':
      return hasThread && (m.mode === 'last' || m.mode === 'range');
    case 'reply-submit':
      // body es texto libre del usuario: no vacío, no solo espacios, y ≤ 10 000 chars.
      return hasThread && typeof m.body === 'string' && m.body.trim() !== '' && m.body.length <= 10_000;
    case 'edit-submit':
      return hasThread && hasMessage && typeof m.body === 'string' && m.body.trim() !== '' && m.body.length <= 10_000;
    case 'assign':
      return hasThread;
    case 'jump-doc':
      // doc_path: ruta relativa segura; la contención definitiva se valida en el host.
      return hasThread && isRelativeSafePath(m.doc_path);
    default:
      return false;
  }
}

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
  confidence?: 'alta' | 'media' | 'baja'; // P5: nivel de confianza (verifica/supuesto)
  assignee?: string;                       // P5: subagente asignado al hilo
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

    const card: CardViewModel = {
      thread_id: thread.thread_id,
      commentType: thread.commentType,
      lineLabel,
      hasAnchor,
      status: thread.status,
      messages,
      fixCommit: lastAiFix?.commit ?? null,
      openCommit: thread.openedCommit,
    };
    if (thread.confidence !== undefined) card.confidence = thread.confidence;
    if (thread.assignee   !== undefined) card.assignee   = thread.assignee;
    return card;
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

  // Botón diff: visible solo en hilos abiertos (withActions) con al menos un fix de IA.
  // data-diff-mode rastrea el toggle last↔range en el webview; el SHA se resuelve
  // en extension.ts desde las proyecciones del event log, nunca desde el DOM.
  const diffBtnHtml = (withActions && card.fixCommit !== null)
    ? `<button class="action-btn" data-action="diff" data-thread-id="${tid}" data-diff-mode="last">⟷</button>`
    : '';

  const cardActionsHtml = withActions
    ? `\n        <span class="card-actions">${diffBtnHtml}<button class="action-btn" data-action="assign" data-thread-id="${tid}">⊕</button><button class="action-btn" data-action="reply" data-thread-id="${tid}">↩</button><button class="action-btn" data-action="resolve" data-thread-id="${tid}">✓</button></span>`
    : '';

  // Etiquetas opcionales de confianza y asignado: escapadas y con clase semántica
  const confidenceHtml = card.confidence !== undefined
    ? ` <span class="card-confidence card-confidence-${escapeHtml(card.confidence)}">${escapeHtml(card.confidence)}</span>`
    : '';
  const assigneeHtml = card.assignee !== undefined
    ? ` <span class="card-assignee">${escapeHtml(card.assignee)}</span>`
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
        <span class="card-type">${escapeHtml(card.commentType)}</span>${confidenceHtml}${assigneeHtml}
        <span class="card-line">${escapeHtml(card.lineLabel)}</span>${cardActionsHtml}
      </div>
      <div class="card-messages">
      ${messagesHtml}</div>
    </div>`;
}

/**
 * Genera el HTML de la sección multi-fichero "Repositorio (N)" al pie del panel.
 *
 * - Devuelve cadena vacía si `allDocs` está vacío y `overflow` es 0.
 * - Sección `<details data-section="all-docs">` colapsada por defecto.
 * - N = total de hilos abiertos en el mapa (no el número de documentos).
 * - Cada documento aparece como grupo con nombre de fichero y recuento.
 * - Cada hilo en el grupo tiene un botón con data-action="jump-doc",
 *   data-thread-id y data-doc-path; el clic envía el mensaje al host.
 * - overflow > 0: añade una nota "(+N más)" al final de la sección.
 * - Toda interpolación de datos pasa por escapeHtml.
 */
export function buildAllDocsHtml(
  allDocs: Map<string, CardViewModel[]>,
  overflow = 0
): string {
  // Fix 6: si no hay hilos visibles no renderizar la sección, aunque haya overflow;
  // una sección con 0 entradas concretas no aporta información útil.
  let totalThreads = 0;
  for (const cards of allDocs.values()) totalThreads += cards.length;
  if (totalThreads === 0) return '';

  // Fix 4: orden estable — alfabético por ruta relativa (localeCompare),
  // independientemente del orden que devuelva readdir en el sistema de ficheros.
  const sortedEntries = [...allDocs.entries()].sort(([a], [b]) => a.localeCompare(b));

  const groups: string[] = [];
  for (const [docPath, cards] of sortedEntries) {
    if (cards.length === 0) continue;
    const escapedPath = escapeHtml(docPath);
    // Cabecera del grupo: solo el nombre de fichero; la ruta completa va en data-doc-path.
    const segments = docPath.split(/[/\\]/);
    const displayName = escapeHtml(segments[segments.length - 1] ?? docPath);
    const threads = cards.map(card => {
      const tid  = escapeHtml(card.thread_id);
      // Fix 5: la clase CSS sale de la lista blanca VALID_COMMENT_TYPES para evitar
      // inyección de clases arbitrarias desde un commentType manipulado en disco.
      // El texto visible usa el valor escapado sin restricción de lista blanca.
      const rawType     = card.commentType;
      const safeClass   = VALID_COMMENT_TYPES.has(rawType) ? escapeHtml(rawType) : 'nota';
      const displayType = escapeHtml(rawType);
      const line = escapeHtml(card.lineLabel);
      return `<button class="all-doc-thread action-btn" data-action="jump-doc" data-thread-id="${tid}" data-doc-path="${escapedPath}"><span class="bullet bullet-${safeClass}">●</span> ${displayType} · ${line}</button>`;
    }).join('\n');
    groups.push(
      `<div class="all-doc-group">\n` +
      `<div class="all-doc-title">${displayName} (${cards.length})</div>\n` +
      threads + '\n' +
      `</div>`
    );
  }

  const overflowHtml = overflow > 0
    ? `\n<div class="all-doc-overflow">(+${overflow} más)</div>`
    : '';

  return (
    `<details data-section="all-docs" class="section-collapsed">\n` +
    `<summary class="section-header">Repositorio (${totalThreads})</summary>\n` +
    groups.join('\n') +
    overflowHtml + '\n' +
    `</details>`
  );
}

/**
 * Genera el fragmento HTML con todas las tarjetas de hilo, particionadas por estado.
 *
 * - Hilos abiertos: lista plana (sin agrupar por tipo), con botones de acción.
 * - Hilos resueltos: sección <details data-section="resolved"> colapsada por defecto.
 * - Hilos desanclados: sección <details data-section="detached"> colapsada por defecto.
 * - Sección multi-fichero: `<details data-section="all-docs">` al final si `allDocs`
 *   tiene entradas (generada con buildAllDocsHtml).
 * - Omite la sección completa si su cubo está vacío.
 * - Sin atributos style inline (requisito de CSP con nonce).
 */
export function buildCardsHtml(
  cards: CardViewModel[],
  allDocs?: Map<string, CardViewModel[]>,
  overflow?: number
): string {
  const { open, resolved, detached } = partitionCardsByStatus(cards);
  const allDocsHtml = buildAllDocsHtml(allDocs ?? new Map(), overflow ?? 0);

  if (open.length === 0 && resolved.length === 0 && detached.length === 0) {
    const emptyMsg = '<p class="empty">Sin comentarios en este documento.</p>';
    return allDocsHtml ? emptyMsg + '\n' + allDocsHtml : emptyMsg;
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

  // Sección multi-fichero (P6)
  if (allDocsHtml) parts.push(allDocsHtml);

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// computeUnseenCount — badge de respuestas IA nuevas (P1)
// ---------------------------------------------------------------------------

/**
 * Cuenta los mensajes de autor IA no retractados cuyo `id` no está en `seen`.
 * Función pura: no modifica `seen`, sin IO, testeable con node:test.
 *
 * Un mensaje se considera "visto" cuando su `id` aparece en el Set `seen`,
 * que se persiste en `workspaceState` y se actualiza en extension.ts al
 * mostrar el panel (DA-1).
 */
export function computeUnseenCount(
  projections: ThreadProjection[],
  seen: Set<string>
): number {
  let count = 0;
  for (const thread of projections) {
    for (const msg of thread.messages) {
      if (!msg.retracted && msg.author.kind === 'ai' && !seen.has(msg.id)) {
        count++;
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// pickNextThread — navegación por teclado entre hilos (P2)
// ---------------------------------------------------------------------------

/**
 * Selecciona el siguiente o anterior hilo abierto con ancla, en orden de
 * `char_offset`, respecto a la posición del cursor en el documento activo.
 *
 * Función pura: sin IO ni dependencias de VS Code.
 *
 * - Filtra hilos con `status === 'open'` y `'line_hint' in anchor`.
 * - Ordena por `anchor.char_offset` ascendente. En caso de empate de
 *   `char_offset`, se preserva el orden del array de proyecciones de entrada
 *   (el sort de V8 es estable).
 * - `currentOffset`: posición del cursor (offset en caracteres del documento).
 * - `direction: 'next'`: el primer hilo cuyo `char_offset` es **estrictamente
 *   mayor** que `currentOffset`. Si el cursor está exactamente sobre el
 *   `char_offset` de un hilo, ese hilo se omite y se salta al siguiente (mismo
 *   comportamiento que F8 de diagnósticos de VS Code). Si no hay ninguno y
 *   `cyclic: true`, devuelve el primero.
 * - `direction: 'prev'`: el último hilo cuyo `char_offset` es **estrictamente
 *   menor** que `currentOffset`. Si el cursor está exactamente sobre el
 *   `char_offset` de un hilo, ese hilo se omite. Si no hay ninguno y
 *   `cyclic: true`, devuelve el último.
 * - Lista vacía o sin candidatos no cíclicos → null.
 */
export function pickNextThread(
  projections: ThreadProjection[],
  currentOffset: number,
  direction: 'next' | 'prev',
  cyclic: boolean
): ThreadProjection | null {
  // Filtrar y ordenar por char_offset
  const candidates = projections
    .filter(t => t.status === 'open' && 'line_hint' in t.anchor)
    .sort((a, b) => {
      const offA = (a.anchor as { char_offset: number }).char_offset;
      const offB = (b.anchor as { char_offset: number }).char_offset;
      return offA - offB;
    });

  if (candidates.length === 0) return null;

  if (direction === 'next') {
    const found = candidates.find(
      t => (t.anchor as { char_offset: number }).char_offset > currentOffset
    );
    if (found) return found;
    return cyclic ? candidates[0] : null;
  } else {
    // 'prev': el último con char_offset estrictamente menor que currentOffset
    const found = [...candidates]
      .reverse()
      .find(t => (t.anchor as { char_offset: number }).char_offset < currentOffset);
    if (found) return found;
    return cyclic ? candidates[candidates.length - 1] : null;
  }
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

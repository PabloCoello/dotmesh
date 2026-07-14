/**
 * Tests unitarios para thread-cards-utils.ts.
 *
 * Sin importaciones de VS Code: módulo puro testeable con node:test.
 * Cubre buildCardViewModels y buildCardsHtml (14 casos).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCardViewModels,
  buildCardsHtml,
  buildBulletStyles,
  type CardViewModel,
} from './thread-cards-utils.ts';
import type { ThreadProjection, MessageProjection } from './sidecar.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMsg(
  overrides: Pick<MessageProjection, 'id' | 'body'> & Partial<MessageProjection>
): MessageProjection {
  return {
    id:         overrides.id,
    body:       overrides.body,
    author:     overrides.author ?? { kind: 'human' },
    created_at: overrides.created_at ?? '2026-07-13T10:00:00Z',
    retracted:  overrides.retracted ?? false,
  };
}

function makeThread(
  overrides: Pick<ThreadProjection, 'commentType'> & Partial<ThreadProjection>
): ThreadProjection {
  return {
    thread_id:  overrides.thread_id ?? 'thread-1',
    commentType: overrides.commentType,
    anchor:     overrides.anchor ?? { quote: 'texto', line_hint: 12, char_offset: 0 },
    status:     overrides.status ?? 'open',
    messages:   overrides.messages ?? [],
    openedAt:   overrides.openedAt ?? '2026-07-13T10:00:00Z',
    openedBy:   overrides.openedBy ?? { kind: 'human' },
  };
}

// ---------------------------------------------------------------------------
// buildCardViewModels — casos de modelo de vista
// ---------------------------------------------------------------------------

test('buildCardViewModels con array vacío devuelve []', () => {
  assert.deepEqual(buildCardViewModels([]), []);
});

test('buildCardViewModels hilo anclado: lineLabel=L13, hasAnchor=true, color correcto', () => {
  const thread = makeThread({
    commentType: 'nota',
    anchor: { quote: 'algo', line_hint: 12, char_offset: 0 },
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.lineLabel, 'L13');
  assert.equal(card.hasAnchor, true);
});

test('buildCardViewModels hilo desanclado: lineLabel=(desanclado), hasAnchor=false', () => {
  const thread = makeThread({
    commentType: 'nota',
    anchor: { detached: true },
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.lineLabel, '(desanclado)');
  assert.equal(card.hasAnchor, false);
});

test('buildCardViewModels dos mensajes activos: messages.length===2, authorLabel y dateLabel correctos', () => {
  const thread = makeThread({
    commentType: 'sugerencia',
    messages: [
      makeMsg({ id: 'm1', body: 'primero', created_at: '2026-07-13T10:00:00Z' }),
      makeMsg({ id: 'm2', body: 'segundo', created_at: '2026-07-13T11:00:00Z' }),
    ],
  });
  const [card] = buildCardViewModels([thread], 'es-ES', 'UTC');
  assert.equal(card.messages.length, 2);
  assert.equal(card.messages[0].authorLabel, 'humano');
  assert.ok(
    card.messages[0].dateLabel.includes('13 jul'),
    `dateLabel debe incluir la fecha, obtenido: ${card.messages[0].dateLabel}`
  );
});

test('buildCardViewModels filtra mensajes retractados', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages: [
      makeMsg({ id: 'm1', body: 'visible' }),
      makeMsg({ id: 'm2', body: 'retirado', retracted: true }),
    ],
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.messages.length, 1);
  assert.equal(card.messages[0].body, 'visible');
});

test('buildCardViewModels autor IA con subagent: authorLabel=subagent', () => {
  const thread = makeThread({
    commentType: 'verifica',
    messages: [
      makeMsg({
        id: 'm1', body: 'x',
        author: { kind: 'ai', model: 'claude-sonnet', subagent: 'reviser' },
      }),
    ],
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.messages[0].authorLabel, 'reviser');
});

test('buildCardViewModels autor IA sin subagent: authorLabel=model', () => {
  const thread = makeThread({
    commentType: 'verifica',
    messages: [
      makeMsg({
        id: 'm1', body: 'x',
        author: { kind: 'ai', model: 'claude-sonnet', subagent: undefined },
      }),
    ],
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.messages[0].authorLabel, 'claude-sonnet');
});

test('buildCardViewModels autor humano con name: authorLabel=name', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages: [
      makeMsg({ id: 'm1', body: 'x', author: { kind: 'human', name: 'Pablo' } }),
    ],
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.messages[0].authorLabel, 'Pablo');
});

test('buildCardViewModels autor humano sin name: authorLabel="humano"', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages: [
      makeMsg({ id: 'm1', body: 'x', author: { kind: 'human' } }),
    ],
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.messages[0].authorLabel, 'humano');
});

test('buildCardViewModels autor IA sin subagent ni model cae a fallback (evento malformado)', () => {
  // El tipo Author.ai exige model, pero readEvents no lo valida en runtime:
  // un evento malformado en disco podría no traerlo. authorLabel no debe salir
  // como la cadena "undefined".
  const thread = makeThread({
    commentType: 'verifica',
    messages: [
      makeMsg({
        id: 'm1', body: 'x',
        author: { kind: 'ai', model: undefined as unknown as string, subagent: undefined },
      }),
    ],
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.messages[0].authorLabel, 'modelo desconocido');
});

// ---------------------------------------------------------------------------
// buildCardsHtml — escapado y estructura
// ---------------------------------------------------------------------------

test('buildCardsHtml body con <script> sale escapado', () => {
  const card: CardViewModel = {
    thread_id:   't1',
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    messages: [
      { id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'peligro <script>alert(1)</script>' },
    ],
  };
  const html = buildCardsHtml([card]);
  assert.ok(!html.includes('<script>alert'), 'El <script> crudo no debe aparecer');
  assert.ok(html.includes('&lt;script&gt;'), 'El body debe salir escapado');
});

test('buildCardsHtml authorLabel con < sale escapado', () => {
  const card: CardViewModel = {
    thread_id:   't1',
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    messages: [
      { id: 'm1', authorLabel: 'claude<script>', dateLabel: '13 jul', body: 'ok' },
    ],
  };
  const html = buildCardsHtml([card]);
  assert.ok(!html.includes('claude<script>'), 'El authorLabel con < crudo no debe aparecer');
  assert.ok(html.includes('claude&lt;script&gt;'), 'El authorLabel debe salir escapado');
});

test('buildCardsHtml con array vacío contiene "Sin comentarios"', () => {
  const html = buildCardsHtml([]);
  assert.ok(html.includes('Sin comentarios'), `Debe contener "Sin comentarios", obtenido: ${html}`);
});

test('buildCardsHtml con una tarjeta contiene commentType y body', () => {
  const card: CardViewModel = {
    thread_id:   't1',
    commentType: 'sugerencia',
    lineLabel:   'L5',
    hasAnchor:   true,
    messages: [
      { id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'texto del body' },
    ],
  };
  const html = buildCardsHtml([card]);
  assert.ok(html.includes('sugerencia'), 'Debe contener el commentType');
  assert.ok(html.includes('texto del body'), 'Debe contener el body');
});

test('buildCardsHtml colorea el bullet por clase de tipo (sin style inline)', () => {
  const card: CardViewModel = {
    thread_id:   't1',
    commentType: 'supuesto',
    lineLabel:   'L1',
    hasAnchor:   true,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(html.includes('bullet-supuesto'), 'El bullet debe llevar la clase de tipo');
  assert.ok(!html.includes('style="color'), 'No debe haber atributo style inline (CSP con nonce)');
});

// ---------------------------------------------------------------------------
// buildBulletStyles — reglas CSS del bullet generadas desde la paleta
// ---------------------------------------------------------------------------

test('buildBulletStyles genera una regla por tipo con su hex de TYPE_COLORS', () => {
  const css = buildBulletStyles();
  assert.ok(css.includes('.bullet-supuesto'), 'Debe incluir la clase del tipo supuesto');
  assert.ok(css.includes('#CBAACB'), 'Debe incluir el hex lilac de supuesto');
  assert.ok(css.includes('.bullet {'), 'Debe incluir la regla base .bullet con el fallback');
});

test('buildCardsHtml escapa comillas en thread_id (no rompe el atributo)', () => {
  const card: CardViewModel = {
    thread_id:   'x" onclick="alert(1)',
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(!html.includes('" onclick="alert(1)"'), `La comilla no debe romper el atributo, obtenido:\n${html}`);
  assert.ok(html.includes('data-thread-id="x&quot; onclick=&quot;alert(1)"'), 'El thread_id debe salir escapado en el atributo');
});

test('buildCardsHtml tarjeta desanclada tiene data-has-anchor="false"', () => {
  const card: CardViewModel = {
    thread_id:   't2',
    commentType: 'nota',
    lineLabel:   '(desanclado)',
    hasAnchor:   false,
    messages:    [],
  };
  const html = buildCardsHtml([card]);
  assert.ok(html.includes('data-has-anchor="false"'), `Debe tener data-has-anchor="false", obtenido: ${html}`);
});

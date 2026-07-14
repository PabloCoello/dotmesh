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
  partitionCardsByStatus,
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
    commit:     overrides.commit ?? null,
  };
}

function makeThread(
  overrides: Pick<ThreadProjection, 'commentType'> & Partial<ThreadProjection>
): ThreadProjection {
  return {
    thread_id:    overrides.thread_id ?? 'thread-1',
    commentType:  overrides.commentType,
    anchor:       overrides.anchor ?? { quote: 'texto', line_hint: 12, char_offset: 0 },
    status:       overrides.status ?? 'open',
    messages:     overrides.messages ?? [],
    openedAt:     overrides.openedAt ?? '2026-07-13T10:00:00Z',
    openedBy:     overrides.openedBy ?? { kind: 'human' },
    openedCommit: overrides.openedCommit ?? null,
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

test('buildCardViewModels autor IA con subagent y model: authorLabel=subagent · model', () => {
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
  assert.equal(card.messages[0].authorLabel, 'reviser · claude-sonnet');
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
// buildCardViewModels — fixCommit y openCommit (Fase commit-por-comentario)
// ---------------------------------------------------------------------------

test('buildCardViewModels openCommit toma el valor de thread.openedCommit', () => {
  const thread = makeThread({
    commentType: 'nota',
    openedCommit: 'base001',
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.openCommit, 'base001');
});

test('buildCardViewModels openCommit es null cuando openedCommit es null', () => {
  const thread = makeThread({
    commentType: 'nota',
    openedCommit: null,
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.openCommit, null);
});

test('buildCardViewModels fixCommit toma el commit del último message.posted de IA no retractado', () => {
  const thread = makeThread({
    commentType: 'edita',
    messages: [
      makeMsg({ id: 'm1', body: 'comentario humano', author: { kind: 'human' }, commit: null }),
      makeMsg({ id: 'm2', body: 'fix 1', author: { kind: 'ai', model: 'claude-sonnet' }, commit: 'sha0001' }),
      makeMsg({ id: 'm3', body: 'fix 2', author: { kind: 'ai', model: 'claude-sonnet' }, commit: 'sha0002' }),
    ],
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.fixCommit, 'sha0002');
});

test('buildCardViewModels fixCommit ignora mensajes de IA retractados', () => {
  const thread = makeThread({
    commentType: 'edita',
    messages: [
      makeMsg({ id: 'm1', body: 'fix retractado', author: { kind: 'ai', model: 'claude-sonnet' }, commit: 'sha0003', retracted: true }),
      makeMsg({ id: 'm2', body: 'fix activo', author: { kind: 'ai', model: 'claude-sonnet' }, commit: 'sha0004' }),
    ],
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.fixCommit, 'sha0004');
});

test('buildCardViewModels fixCommit es null cuando no hay mensajes de IA con commit', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages: [
      makeMsg({ id: 'm1', body: 'respuesta sin commit', author: { kind: 'ai', model: 'claude-sonnet' }, commit: null }),
    ],
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.fixCommit, null);
});

test('buildCardViewModels fixCommit es null cuando no hay mensajes de IA', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages: [
      makeMsg({ id: 'm1', body: 'solo humano', author: { kind: 'human' }, commit: null }),
    ],
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(card.fixCommit, null);
});

// ---------------------------------------------------------------------------
// partitionCardsByStatus — cubos por estado
// ---------------------------------------------------------------------------

test('partitionCardsByStatus con array vacío devuelve tres cubos vacíos', () => {
  const result = partitionCardsByStatus([]);
  assert.deepEqual(result, { open: [], resolved: [], detached: [] });
});

test('partitionCardsByStatus reparte correctamente los tres estados', () => {
  const cards: CardViewModel[] = [
    { thread_id: 'o1', commentType: 'nota', lineLabel: 'L1', hasAnchor: true,  status: 'open',     messages: [], fixCommit: null, openCommit: null },
    { thread_id: 'r1', commentType: 'nota', lineLabel: 'L2', hasAnchor: true,  status: 'resolved', messages: [], fixCommit: null, openCommit: null },
    { thread_id: 'd1', commentType: 'nota', lineLabel: '(desanclado)', hasAnchor: false, status: 'detached', messages: [], fixCommit: null, openCommit: null },
  ];
  const { open, resolved, detached } = partitionCardsByStatus(cards);
  assert.equal(open.length, 1);
  assert.equal(open[0].thread_id, 'o1');
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].thread_id, 'r1');
  assert.equal(detached.length, 1);
  assert.equal(detached[0].thread_id, 'd1');
});

test('partitionCardsByStatus con hilos mixtos respeta el orden dentro de cada cubo', () => {
  const cards: CardViewModel[] = [
    { thread_id: 'o1', commentType: 'nota', lineLabel: 'L1', hasAnchor: true, status: 'open',     messages: [], fixCommit: null, openCommit: null },
    { thread_id: 'r1', commentType: 'nota', lineLabel: 'L2', hasAnchor: true, status: 'resolved', messages: [], fixCommit: null, openCommit: null },
    { thread_id: 'o2', commentType: 'nota', lineLabel: 'L3', hasAnchor: true, status: 'open',     messages: [], fixCommit: null, openCommit: null },
    { thread_id: 'r2', commentType: 'nota', lineLabel: 'L4', hasAnchor: true, status: 'resolved', messages: [], fixCommit: null, openCommit: null },
    { thread_id: 'd1', commentType: 'nota', lineLabel: '(desanclado)', hasAnchor: false, status: 'detached', messages: [], fixCommit: null, openCommit: null },
  ];
  const { open, resolved, detached } = partitionCardsByStatus(cards);
  assert.deepEqual(open.map(c => c.thread_id),     ['o1', 'o2']);
  assert.deepEqual(resolved.map(c => c.thread_id), ['r1', 'r2']);
  assert.deepEqual(detached.map(c => c.thread_id), ['d1']);
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
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
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
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
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
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
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
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(html.includes('bullet-supuesto'), 'El bullet debe llevar la clase de tipo');
  assert.ok(!html.includes('style="color'), 'No debe haber atributo style inline (CSP con nonce)');
});

// ---------------------------------------------------------------------------
// buildCardsHtml — secciones por estado, botones de acción y data-message-id
// ---------------------------------------------------------------------------

test('buildCardsHtml sección resolved presente cuando hay hilos resueltos', () => {
  const card: CardViewModel = {
    thread_id:   'r1',
    commentType: 'nota',
    lineLabel:   'L3',
    hasAnchor:   true,
    status:      'resolved',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(
    html.includes('data-section="resolved"'),
    'Debe incluir data-section="resolved" cuando hay resueltos'
  );
  assert.ok(
    html.includes('Resueltos (1)'),
    'El summary debe indicar el recuento'
  );
});

test('buildCardsHtml sección resolved ausente cuando no hay hilos resueltos', () => {
  const card: CardViewModel = {
    thread_id:   'o1',
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(
    !html.includes('data-section="resolved"'),
    'No debe incluir data-section="resolved" cuando no hay resueltos'
  );
});

test('buildCardsHtml sección detached presente cuando hay hilos desanclados', () => {
  const card: CardViewModel = {
    thread_id:   'd1',
    commentType: 'nota',
    lineLabel:   '(desanclado)',
    hasAnchor:   false,
    status:      'detached',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(
    html.includes('data-section="detached"'),
    'Debe incluir data-section="detached" cuando hay desanclados'
  );
  assert.ok(
    html.includes('Desanclados (1)'),
    'El summary debe indicar el recuento'
  );
});

test('buildCardsHtml data-message-id presente en cada mensaje', () => {
  const card: CardViewModel = {
    thread_id:   't1',
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages: [
      { id: 'msg-abc', authorLabel: 'humano', dateLabel: '13 jul', body: 'primero' },
      { id: 'msg-xyz', authorLabel: 'humano', dateLabel: '13 jul', body: 'segundo' },
    ],
  };
  const html = buildCardsHtml([card]);
  assert.ok(html.includes('data-message-id="msg-abc"'), 'Debe contener data-message-id del primer mensaje');
  assert.ok(html.includes('data-message-id="msg-xyz"'), 'Debe contener data-message-id del segundo mensaje');
});

test('buildCardsHtml botones de acción presentes en hilo abierto', () => {
  const card: CardViewModel = {
    thread_id:   'o1',
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(html.includes('data-action="reply"'),   'Debe incluir botón reply en abiertos');
  assert.ok(html.includes('data-action="resolve"'), 'Debe incluir botón resolve en abiertos');
  assert.ok(html.includes('data-action="edit"'),    'Debe incluir botón edit en abiertos');
  assert.ok(html.includes('data-action="retract"'), 'Debe incluir botón retract en abiertos');
});

test('buildCardsHtml botones de acción ausentes en hilo resuelto', () => {
  const card: CardViewModel = {
    thread_id:   'r1',
    commentType: 'nota',
    lineLabel:   'L2',
    hasAnchor:   true,
    status:      'resolved',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(!html.includes('data-action="reply"'),   'No debe incluir botón reply en resueltos');
  assert.ok(!html.includes('data-action="resolve"'), 'No debe incluir botón resolve en resueltos');
  assert.ok(!html.includes('data-action="edit"'),    'No debe incluir botón edit en resueltos');
  assert.ok(!html.includes('data-action="retract"'), 'No debe incluir botón retract en resueltos');
});

test('buildCardsHtml botones de acción ausentes en hilo desanclado', () => {
  const card: CardViewModel = {
    thread_id:   'd1',
    commentType: 'nota',
    lineLabel:   '(desanclado)',
    hasAnchor:   false,
    status:      'detached',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(!html.includes('data-action="reply"'),   'No debe incluir botón reply en desanclados');
  assert.ok(!html.includes('data-action="resolve"'), 'No debe incluir botón resolve en desanclados');
  assert.ok(!html.includes('data-action="edit"'),    'No debe incluir botón edit en desanclados');
  assert.ok(!html.includes('data-action="retract"'), 'No debe incluir botón retract en desanclados');
});

test('buildCardsHtml no contiene atributos style inline', () => {
  const cards: CardViewModel[] = [
    { thread_id: 'o1', commentType: 'nota',       lineLabel: 'L1',            hasAnchor: true,  status: 'open',     fixCommit: null, openCommit: null, messages: [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }] },
    { thread_id: 'r1', commentType: 'sugerencia', lineLabel: 'L2',            hasAnchor: true,  status: 'resolved', fixCommit: null, openCommit: null, messages: [{ id: 'm2', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }] },
    { thread_id: 'd1', commentType: 'verifica',   lineLabel: '(desanclado)',  hasAnchor: false, status: 'detached', fixCommit: null, openCommit: null, messages: [{ id: 'm3', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }] },
  ];
  const html = buildCardsHtml(cards);
  assert.ok(!html.includes(' style='), 'El HTML no debe contener atributos style inline (CSP con nonce)');
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
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
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
    status:      'detached',
    fixCommit:   null,
    openCommit:  null,
    messages:    [],
  };
  const html = buildCardsHtml([card]);
  assert.ok(html.includes('data-has-anchor="false"'), `Debe tener data-has-anchor="false", obtenido: ${html}`);
});

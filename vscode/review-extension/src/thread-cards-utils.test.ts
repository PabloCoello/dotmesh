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
  buildAllDocsHtml,
  buildBulletStyles,
  partitionCardsByStatus,
  isWebviewActionMessage,
  computeUnseenCount,
  pickNextThread,
  type CardViewModel,
  type WebviewAckMessage,
} from './thread-cards-utils.ts';
import type { ThreadProjection, MessageProjection } from './sidecar.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMsg(
  overrides: Pick<MessageProjection, 'id' | 'body'> & Partial<MessageProjection>
): MessageProjection {
  const msg: MessageProjection = {
    id:         overrides.id,
    body:       overrides.body,
    author:     overrides.author ?? { kind: 'human' },
    created_at: overrides.created_at ?? '2026-07-13T10:00:00Z',
    retracted:  overrides.retracted ?? false,
    commit:     overrides.commit ?? null,
  };
  if (overrides.confidence !== undefined) msg.confidence = overrides.confidence;
  return msg;
}

function makeThread(
  overrides: Pick<ThreadProjection, 'commentType'> & Partial<ThreadProjection>
): ThreadProjection {
  const base: ThreadProjection = {
    thread_id:    overrides.thread_id ?? 'thread-1',
    commentType:  overrides.commentType,
    anchor:       overrides.anchor ?? { quote: 'texto', line_hint: 12, char_offset: 0 },
    status:       overrides.status ?? 'open',
    messages:     overrides.messages ?? [],
    openedAt:     overrides.openedAt ?? '2026-07-13T10:00:00Z',
    openedBy:     overrides.openedBy ?? { kind: 'human' },
    openedCommit: overrides.openedCommit ?? null,
  };
  if (overrides.confidence !== undefined) base.confidence = overrides.confidence;
  if (overrides.assignee   !== undefined) base.assignee   = overrides.assignee;
  return base;
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

// ---------------------------------------------------------------------------
// buildCardsHtml — botón diff por fixCommit (Fase 3)
// ---------------------------------------------------------------------------

test('buildCardsHtml botón diff presente en hilo abierto con fixCommit !== null', () => {
  const card: CardViewModel = {
    thread_id:   'o-diff',
    commentType: 'edita',
    lineLabel:   'L5',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   'abc1234',
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(html.includes('data-action="diff"'), 'Debe incluir botón diff cuando fixCommit !== null');
  assert.ok(html.includes('data-diff-mode="last"'), 'El botón diff debe iniciarse en modo last');
});

test('buildCardsHtml botón diff ausente en hilo abierto con fixCommit === null', () => {
  const card: CardViewModel = {
    thread_id:   'o-nodiff',
    commentType: 'nota',
    lineLabel:   'L6',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(!html.includes('data-action="diff"'), 'No debe incluir botón diff cuando fixCommit === null');
});

// ---------------------------------------------------------------------------
// sec#3 — isWebviewActionMessage valida thread_id y message_id como UUID
// ---------------------------------------------------------------------------

test('isWebviewActionMessage rechaza thread_id que no es UUID', () => {
  assert.ok(!isWebviewActionMessage({ type: 'reply', thread_id: 'no-es-uuid' }));
  assert.ok(!isWebviewActionMessage({ type: 'resolve', thread_id: 'any-string' }));
});

test('isWebviewActionMessage acepta thread_id que es UUID canónico', () => {
  assert.ok(isWebviewActionMessage({ type: 'reply', thread_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }));
});

test('isWebviewActionMessage rechaza message_id que no es UUID en edit/retract', () => {
  assert.ok(!isWebviewActionMessage({ type: 'edit', thread_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', message_id: 'no-es-uuid' }));
  assert.ok(!isWebviewActionMessage({ type: 'retract', thread_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', message_id: '' }));
});

test('isWebviewActionMessage acepta message_id UUID en edit/retract', () => {
  assert.ok(isWebviewActionMessage({ type: 'edit', thread_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', message_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }));
});

test('buildCardsHtml botón diff ausente en hilo resuelto aunque fixCommit !== null', () => {
  const card: CardViewModel = {
    thread_id:   'r-diff',
    commentType: 'edita',
    lineLabel:   'L7',
    hasAnchor:   true,
    status:      'resolved',
    fixCommit:   'abc1234',
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(!html.includes('data-action="diff"'), 'No debe incluir botón diff en hilos resueltos (sin acciones)');
});

// ---------------------------------------------------------------------------
// isWebviewActionMessage — validación del tipo diff (Fase 3)
// ---------------------------------------------------------------------------

// UUIDs canónicos de uso en los tests de isWebviewActionMessage
const TID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

test('isWebviewActionMessage acepta diff válido con mode last', () => {
  assert.ok(isWebviewActionMessage({ type: 'diff', thread_id: TID, mode: 'last' }));
});

test('isWebviewActionMessage acepta diff válido con mode range', () => {
  assert.ok(isWebviewActionMessage({ type: 'diff', thread_id: TID, mode: 'range' }));
});

test('isWebviewActionMessage rechaza diff con mode inválido', () => {
  assert.ok(!isWebviewActionMessage({ type: 'diff', thread_id: TID, mode: 'full' }));
});

test('isWebviewActionMessage rechaza diff sin mode', () => {
  assert.ok(!isWebviewActionMessage({ type: 'diff', thread_id: TID }));
});

test('isWebviewActionMessage rechaza diff sin thread_id', () => {
  assert.ok(!isWebviewActionMessage({ type: 'diff', mode: 'last' }));
});

test('isWebviewActionMessage rechaza diff con thread_id vacío', () => {
  assert.ok(!isWebviewActionMessage({ type: 'diff', thread_id: '', mode: 'last' }));
});

test('isWebviewActionMessage sigue aceptando tipos existentes tras añadir diff', () => {
  assert.ok(isWebviewActionMessage({ type: 'reply',   thread_id: TID }));
  assert.ok(isWebviewActionMessage({ type: 'resolve', thread_id: TID }));
  assert.ok(isWebviewActionMessage({ type: 'edit',    thread_id: TID, message_id: MID }));
  assert.ok(isWebviewActionMessage({ type: 'retract', thread_id: TID, message_id: MID }));
});

// ---------------------------------------------------------------------------
// F4 — WebviewAckMessage: tipo del ACK de acción del webview
// ---------------------------------------------------------------------------

test('WebviewAckMessage tiene la forma esperada (ok:true)', () => {
  const ack: WebviewAckMessage = {
    type: 'action-ack',
    ok: true,
    thread_id: 'tid-1',
  };
  assert.strictEqual(ack.type, 'action-ack');
  assert.strictEqual(ack.ok, true);
  assert.strictEqual(ack.thread_id, 'tid-1');
  assert.strictEqual(ack.error, undefined);
});

test('WebviewAckMessage tiene la forma esperada (ok:false con error)', () => {
  const ack: WebviewAckMessage = {
    type: 'action-ack',
    ok: false,
    error: 'algo falló',
    thread_id: 'tid-2',
  };
  assert.strictEqual(ack.ok, false);
  assert.strictEqual(ack.error, 'algo falló');
  assert.strictEqual(ack.thread_id, 'tid-2');
});

// ---------------------------------------------------------------------------
// P1 — computeUnseenCount: badge de respuestas IA nuevas
// ---------------------------------------------------------------------------

test('computeUnseenCount cuenta mensajes IA no vistos', () => {
  const mid = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const thread = makeThread({
    commentType: 'nota',
    messages: [
      makeMsg({ id: mid, body: 'respuesta IA', author: { kind: 'ai', model: 'claude-sonnet' } }),
    ],
  });
  assert.equal(computeUnseenCount([thread], new Set()), 1);
});

test('computeUnseenCount ignora mensajes humanos', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages: [
      makeMsg({ id: 'm-human', body: 'solo humano', author: { kind: 'human' } }),
    ],
  });
  assert.equal(computeUnseenCount([thread], new Set()), 0);
});

test('computeUnseenCount ignora mensajes IA retractados', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages: [
      makeMsg({
        id: 'm-retract',
        body: 'retirado',
        author: { kind: 'ai', model: 'claude-sonnet' },
        retracted: true,
      }),
    ],
  });
  assert.equal(computeUnseenCount([thread], new Set()), 0);
});

test('computeUnseenCount devuelve 0 si todos los mensajes IA ya están vistos', () => {
  const mid = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  const thread = makeThread({
    commentType: 'nota',
    messages: [
      makeMsg({ id: mid, body: 'IA visto', author: { kind: 'ai', model: 'claude-sonnet' } }),
    ],
  });
  const seen = new Set<string>([mid]);
  assert.equal(computeUnseenCount([thread], seen), 0);
});

// ---------------------------------------------------------------------------
// P2 — pickNextThread: navegación entre hilos abiertos
// ---------------------------------------------------------------------------

// Fixture: hilo anclado con char_offset dado
function makeAnchoredThread(
  thread_id: string,
  charOffset: number,
  status: 'open' | 'resolved' | 'detached' = 'open'
): import('./sidecar.ts').ThreadProjection {
  return makeThread({
    thread_id,
    commentType: 'nota',
    anchor: { quote: 'texto', line_hint: 0, char_offset: charOffset },
    status,
  });
}

test('pickNextThread con lista vacía devuelve null (next, cyclic:true)', () => {
  assert.equal(pickNextThread([], 0, 'next', true), null);
});

test('pickNextThread con lista vacía devuelve null (next, cyclic:false)', () => {
  assert.equal(pickNextThread([], 0, 'next', false), null);
});

test('pickNextThread con lista vacía devuelve null (prev, cyclic:true)', () => {
  assert.equal(pickNextThread([], 0, 'prev', true), null);
});

test('pickNextThread con lista vacía devuelve null (prev, cyclic:false)', () => {
  assert.equal(pickNextThread([], 0, 'prev', false), null);
});

test('pickNextThread con un solo hilo abierto devuelve ese hilo (next, cyclic)', () => {
  const t = makeAnchoredThread('t1', 10);
  const result = pickNextThread([t], 0, 'next', true);
  assert.equal(result?.thread_id, 't1');
});

test('pickNextThread con un solo hilo abierto devuelve ese hilo (prev, cyclic)', () => {
  const t = makeAnchoredThread('t1', 10);
  const result = pickNextThread([t], 999, 'prev', true);
  assert.equal(result?.thread_id, 't1');
});

test('pickNextThread con varios hilos devuelve el siguiente en orden de char_offset', () => {
  const t1 = makeAnchoredThread('t1', 10);
  const t2 = makeAnchoredThread('t2', 50);
  const t3 = makeAnchoredThread('t3', 100);
  // Cursor en offset 5 (antes del primero): siguiente es t1
  const result = pickNextThread([t3, t1, t2], 5, 'next', false);
  assert.equal(result?.thread_id, 't1');
});

test('pickNextThread salta al siguiente tras el cursor', () => {
  const t1 = makeAnchoredThread('t1', 10);
  const t2 = makeAnchoredThread('t2', 50);
  const t3 = makeAnchoredThread('t3', 100);
  // Cursor en offset 10 (en t1): siguiente es t2
  const result = pickNextThread([t1, t2, t3], 10, 'next', false);
  assert.equal(result?.thread_id, 't2');
});

test('pickNextThread al llegar al final con cyclic:true vuelve al primero', () => {
  const t1 = makeAnchoredThread('t1', 10);
  const t2 = makeAnchoredThread('t2', 50);
  const t3 = makeAnchoredThread('t3', 100);
  // Cursor en offset 100 (en t3): siguiente con cyclic es t1
  const result = pickNextThread([t1, t2, t3], 100, 'next', true);
  assert.equal(result?.thread_id, 't1');
});

test('pickNextThread al llegar al final con cyclic:false devuelve null', () => {
  const t1 = makeAnchoredThread('t1', 10);
  const t2 = makeAnchoredThread('t2', 50);
  const t3 = makeAnchoredThread('t3', 100);
  // Cursor en offset 100 (en t3): sin cyclic no hay siguiente
  const result = pickNextThread([t1, t2, t3], 100, 'next', false);
  assert.equal(result, null);
});

test('pickNextThread prev devuelve el hilo anterior al cursor', () => {
  const t1 = makeAnchoredThread('t1', 10);
  const t2 = makeAnchoredThread('t2', 50);
  const t3 = makeAnchoredThread('t3', 100);
  // Cursor en offset 100 (en t3): anterior es t2
  const result = pickNextThread([t1, t2, t3], 100, 'prev', false);
  assert.equal(result?.thread_id, 't2');
});

test('pickNextThread prev al llegar al primero con cyclic:true vuelve al último', () => {
  const t1 = makeAnchoredThread('t1', 10);
  const t2 = makeAnchoredThread('t2', 50);
  const t3 = makeAnchoredThread('t3', 100);
  // Cursor en offset 10 (en t1): anterior con cyclic es t3
  const result = pickNextThread([t1, t2, t3], 10, 'prev', true);
  assert.equal(result?.thread_id, 't3');
});

test('pickNextThread prev al llegar al primero con cyclic:false devuelve null', () => {
  const t1 = makeAnchoredThread('t1', 10);
  const t2 = makeAnchoredThread('t2', 50);
  // Cursor en offset 10 (en t1): sin cyclic no hay anterior
  const result = pickNextThread([t1, t2], 10, 'prev', false);
  assert.equal(result, null);
});

test('pickNextThread ignora hilos resueltos y desanclados', () => {
  const open = makeAnchoredThread('open', 50);
  const resolved = makeAnchoredThread('resolved', 10, 'resolved');
  const detached = makeThread({
    thread_id: 'detached',
    commentType: 'nota',
    anchor: { detached: true },
    status: 'detached',
  });
  // Solo hay un hilo abierto con ancla; debe devolverlo siempre
  const result = pickNextThread([resolved, open, detached], 0, 'next', true);
  assert.equal(result?.thread_id, 'open');
});

test('pickNextThread ignora hilos abiertos sin line_hint (desanclados en estado open)', () => {
  const anchored = makeAnchoredThread('anchored', 50);
  const noAnchor = makeThread({
    thread_id: 'no-anchor',
    commentType: 'nota',
    anchor: { detached: true },
    status: 'open',
  });
  const result = pickNextThread([noAnchor, anchored], 0, 'next', false);
  assert.equal(result?.thread_id, 'anchored');
});

// Empate de char_offset: fija el comportamiento de desempate.
// El sort es estable (V8 ≥ 70, Node ≥ 11): igual char_offset → preserva el
// orden del array de entrada (primer candidato en projections gana).

test('pickNextThread cursor antes de dos hilos con mismo char_offset: next devuelve el primero en projections', () => {
  // t-a y t-b ambos en offset 50; cursor en 10 (antes de ambos)
  const ta = makeAnchoredThread('t-a', 50);
  const tb = makeAnchoredThread('t-b', 50);
  // Entrada: [ta, tb] → sort estable mantiene ta antes que tb
  const result = pickNextThread([ta, tb], 10, 'next', false);
  assert.equal(result?.thread_id, 't-a');
});

test('pickNextThread cursor exactamente sobre char_offset de un hilo: next salta al siguiente (estricto)', () => {
  // cursor en 50 (igual que t2); 'next' debe saltar a t3, no quedarse en t2
  const t1 = makeAnchoredThread('t1', 10);
  const t2 = makeAnchoredThread('t2', 50);
  const t3 = makeAnchoredThread('t3', 100);
  const result = pickNextThread([t1, t2, t3], 50, 'next', false);
  assert.equal(result?.thread_id, 't3');
});

test('pickNextThread cursor exactamente sobre char_offset de un hilo: prev salta al anterior (estricto)', () => {
  // cursor en 50 (igual que t2); 'prev' debe saltar a t1, no quedarse en t2
  const t1 = makeAnchoredThread('t1', 10);
  const t2 = makeAnchoredThread('t2', 50);
  const t3 = makeAnchoredThread('t3', 100);
  const result = pickNextThread([t1, t2, t3], 50, 'prev', false);
  assert.equal(result?.thread_id, 't1');
});

// ---------------------------------------------------------------------------
// P4 — XSS: cuerpo precargado en textarea y rendering en tarjeta
// ---------------------------------------------------------------------------
//
// El body de un mensaje circula por dos vías:
//   a) Rendering en tarjeta → buildCardHtml aplica escapeHtml → HTML seguro.
//   b) Pre-relleno del textarea (modo edit) → textarea.value = currentBody
//      → no hay parsing HTML; el valor es texto plano.
//
// En la vía (b), el body que viaja al webview debe ser texto crudo (NO
// HTML-escapado), porque textarea.value no interpreta entidades y el usuario
// vería "&lt;script&gt;" en lugar de "<script>". El escaping ocurre solo
// en la vía (a). Los tests siguientes fijan ambos contratos.

test('buildCardViewModels preserva body crudo con caracteres HTML especiales (no pre-escapa)', () => {
  // El ViewModel debe conservar el texto tal como viene del evento.
  // El escaping ocurre en buildCardsHtml, no antes.
  const rawBody = '<script>xss()</script>&amp;";';
  const thread = makeThread({
    commentType: 'nota',
    messages: [makeMsg({ id: 'm1', body: rawBody })],
  });
  const [card] = buildCardViewModels([thread]);
  assert.equal(
    card.messages[0].body,
    rawBody,
    'buildCardViewModels no debe pre-escapar el body; el escaping lo hace buildCardsHtml'
  );
});

test('buildCardsHtml escapa body con caracteres XSS al renderizar la tarjeta', () => {
  // Contrato inverso: el HTML final sí debe contener el body escapado.
  const card: CardViewModel = {
    thread_id:   'p4-xss',
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages: [
      { id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: '<script>xss()</script>' },
    ],
  };
  const html = buildCardsHtml([card]);
  assert.ok(
    !html.includes('<script>xss()'),
    'El body con <script> crudo no debe aparecer en el HTML'
  );
  assert.ok(
    html.includes('&lt;script&gt;xss()&lt;/script&gt;'),
    'El body debe salir HTML-escapado en la tarjeta renderizada'
  );
});

test('buildCardsHtml escapa body con ampersand y comillas (entidades HTML)', () => {
  const card: CardViewModel = {
    thread_id:   'p4-entities',
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages: [
      { id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'a & b "c"' },
    ],
  };
  const html = buildCardsHtml([card]);
  assert.ok(html.includes('a &amp; b &quot;c&quot;'), 'Ampersand y comillas deben escaparse');
});

// ---------------------------------------------------------------------------
// P4 — reply-submit y edit-submit: compositor multilínea del webview
// ---------------------------------------------------------------------------

test('isWebviewActionMessage acepta reply-submit con body no vacío', () => {
  assert.ok(isWebviewActionMessage({
    type: 'reply-submit',
    thread_id: TID,
    body: 'Texto de respuesta',
  }));
});

test('isWebviewActionMessage rechaza reply-submit con body vacío', () => {
  assert.ok(!isWebviewActionMessage({
    type: 'reply-submit',
    thread_id: TID,
    body: '',
  }));
});

test('isWebviewActionMessage rechaza reply-submit con body solo espacios', () => {
  assert.ok(!isWebviewActionMessage({
    type: 'reply-submit',
    thread_id: TID,
    body: '   ',
  }));
});

test('isWebviewActionMessage rechaza reply-submit sin body', () => {
  assert.ok(!isWebviewActionMessage({
    type: 'reply-submit',
    thread_id: TID,
  }));
});

test('isWebviewActionMessage rechaza reply-submit con thread_id no UUID', () => {
  assert.ok(!isWebviewActionMessage({
    type: 'reply-submit',
    thread_id: 'no-es-uuid',
    body: 'Texto',
  }));
});

test('isWebviewActionMessage acepta edit-submit con thread_id, message_id y body', () => {
  assert.ok(isWebviewActionMessage({
    type: 'edit-submit',
    thread_id: TID,
    message_id: MID,
    body: 'Texto editado',
  }));
});

test('isWebviewActionMessage rechaza edit-submit sin message_id', () => {
  assert.ok(!isWebviewActionMessage({
    type: 'edit-submit',
    thread_id: TID,
    body: 'Texto editado',
  }));
});

test('isWebviewActionMessage rechaza edit-submit con message_id no UUID', () => {
  assert.ok(!isWebviewActionMessage({
    type: 'edit-submit',
    thread_id: TID,
    message_id: 'no-es-uuid',
    body: 'Texto editado',
  }));
});

test('isWebviewActionMessage rechaza edit-submit con body vacío', () => {
  assert.ok(!isWebviewActionMessage({
    type: 'edit-submit',
    thread_id: TID,
    message_id: MID,
    body: '',
  }));
});

test('isWebviewActionMessage rechaza edit-submit con body solo espacios', () => {
  assert.ok(!isWebviewActionMessage({
    type: 'edit-submit',
    thread_id: TID,
    message_id: MID,
    body: '   ',
  }));
});

// Cota de tamaño: body <= 10 000 caracteres en reply-submit y edit-submit
test('isWebviewActionMessage acepta reply-submit con body de exactamente 10000 caracteres', () => {
  assert.ok(isWebviewActionMessage({
    type: 'reply-submit',
    thread_id: TID,
    body: 'a'.repeat(10_000),
  }));
});

test('isWebviewActionMessage rechaza reply-submit con body de 10001 caracteres', () => {
  assert.ok(!isWebviewActionMessage({
    type: 'reply-submit',
    thread_id: TID,
    body: 'a'.repeat(10_001),
  }));
});

test('isWebviewActionMessage acepta edit-submit con body de exactamente 10000 caracteres', () => {
  assert.ok(isWebviewActionMessage({
    type: 'edit-submit',
    thread_id: TID,
    message_id: MID,
    body: 'a'.repeat(10_000),
  }));
});

test('isWebviewActionMessage rechaza edit-submit con body de 10001 caracteres', () => {
  assert.ok(!isWebviewActionMessage({
    type: 'edit-submit',
    thread_id: TID,
    message_id: MID,
    body: 'a'.repeat(10_001),
  }));
});

// ---------------------------------------------------------------------------
// P5 — slice 6.1: confidence en CardViewModel
// ---------------------------------------------------------------------------

test('buildCardViewModels propaga confidence cuando el hilo la tiene', () => {
  const thread = makeThread({ commentType: 'verifica', confidence: 'alta' });
  const [card] = buildCardViewModels([thread]);
  assert.strictEqual(card.confidence, 'alta');
});

test('buildCardViewModels confidence es undefined cuando el hilo no la tiene', () => {
  const thread = makeThread({ commentType: 'nota' });
  const [card] = buildCardViewModels([thread]);
  assert.strictEqual(card.confidence, undefined);
});

test('buildCardsHtml incluye etiqueta card-confidence cuando confidence está presente', () => {
  const card: CardViewModel = {
    thread_id:   't-conf',
    commentType: 'verifica',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    confidence:  'alta',
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(html.includes('card-confidence'), 'debe incluir la clase card-confidence');
  assert.ok(html.includes('alta'), 'debe incluir el valor de confianza');
});

test('buildCardsHtml no incluye etiqueta card-confidence cuando confidence es undefined', () => {
  const card: CardViewModel = {
    thread_id:   't-noconf',
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(!html.includes('card-confidence'), 'no debe incluir la clase card-confidence cuando no hay confianza');
});

// ---------------------------------------------------------------------------
// P5 — slice 6.2: assignee en CardViewModel + botón assign + isWebviewActionMessage
// ---------------------------------------------------------------------------

test('buildCardViewModels propaga assignee cuando el hilo lo tiene', () => {
  const thread = makeThread({ commentType: 'edita', assignee: 'security' });
  const [card] = buildCardViewModels([thread]);
  assert.strictEqual(card.assignee, 'security');
});

test('buildCardViewModels assignee es undefined cuando el hilo no lo tiene', () => {
  const thread = makeThread({ commentType: 'nota' });
  const [card] = buildCardViewModels([thread]);
  assert.strictEqual(card.assignee, undefined);
});

test('buildCardsHtml incluye etiqueta card-assignee cuando assignee está presente', () => {
  const card: CardViewModel = {
    thread_id:   't-assign',
    commentType: 'edita',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    assignee:    'security',
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(html.includes('card-assignee'), 'debe incluir la clase card-assignee');
  assert.ok(html.includes('security'), 'debe incluir el nombre del agente asignado');
});

test('buildCardsHtml no incluye card-assignee cuando assignee es undefined', () => {
  const card: CardViewModel = {
    thread_id:   't-noassign',
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(!html.includes('card-assignee'), 'no debe incluir la clase card-assignee cuando no hay asignado');
});

test('isWebviewActionMessage acepta assign con thread_id UUID', () => {
  assert.ok(isWebviewActionMessage({ type: 'assign', thread_id: TID }));
});

test('isWebviewActionMessage rechaza assign sin thread_id', () => {
  assert.ok(!isWebviewActionMessage({ type: 'assign' }));
});

test('isWebviewActionMessage rechaza assign con thread_id no-UUID', () => {
  assert.ok(!isWebviewActionMessage({ type: 'assign', thread_id: 'no-es-uuid' }));
});

test('buildCardsHtml incluye botón assign en hilo abierto', () => {
  const card: CardViewModel = {
    thread_id:   TID,
    commentType: 'edita',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(html.includes('data-action="assign"'), 'debe incluir botón assign en hilo abierto');
});

test('buildCardsHtml no incluye botón assign en hilo resuelto', () => {
  const card: CardViewModel = {
    thread_id:   TID,
    commentType: 'edita',
    lineLabel:   'L2',
    hasAnchor:   true,
    status:      'resolved',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(!html.includes('data-action="assign"'), 'no debe incluir botón assign en hilo resuelto');
});

// ---------------------------------------------------------------------------
// P6 — buildAllDocsHtml: sección multi-fichero
// ---------------------------------------------------------------------------

test('buildAllDocsHtml con mapa vacío devuelve cadena vacía', () => {
  assert.strictEqual(buildAllDocsHtml(new Map()), '');
});

test('buildAllDocsHtml con mapa vacío y overflow 0 devuelve cadena vacía', () => {
  assert.strictEqual(buildAllDocsHtml(new Map(), 0), '');
});

test('buildAllDocsHtml con un doc y dos hilos genera sección colapsada con nombre y recuento', () => {
  const cards: CardViewModel[] = [
    { thread_id: TID, commentType: 'nota',      lineLabel: 'L5',  hasAnchor: true, status: 'open', fixCommit: null, openCommit: null, messages: [] },
    { thread_id: MID, commentType: 'sugerencia', lineLabel: 'L10', hasAnchor: true, status: 'open', fixCommit: null, openCommit: null, messages: [] },
  ];
  const allDocs = new Map([['README.md', cards]]);
  const html = buildAllDocsHtml(allDocs);

  assert.ok(html.includes('data-section="all-docs"'),  'debe incluir data-section="all-docs"');
  assert.ok(html.includes('section-collapsed'),         'debe estar colapsada por defecto');
  assert.ok(html.includes('Repositorio (2)'),           'el summary debe indicar 2 hilos');
  assert.ok(html.includes('README.md (2)'),             'el grupo debe indicar el nombre y recuento');
  assert.ok(html.includes('data-action="jump-doc"'),    'debe incluir botones jump-doc');
  assert.ok(html.includes(`data-doc-path="README.md"`), 'debe incluir la ruta del documento');
});

test('buildAllDocsHtml escapa paths con caracteres especiales', () => {
  const cards: CardViewModel[] = [
    { thread_id: TID, commentType: 'nota', lineLabel: 'L1', hasAnchor: true, status: 'open', fixCommit: null, openCommit: null, messages: [] },
  ];
  const allDocs = new Map([['src/<evil>.ts', cards]]);
  const html = buildAllDocsHtml(allDocs);

  assert.ok(!html.includes('src/<evil>'), 'el path con < no debe aparecer sin escapar');
  assert.ok(html.includes('src/&lt;evil&gt;.ts'), 'el path debe salir escapado en data-doc-path');
});

test('buildAllDocsHtml con overflow > 0 incluye el indicador "(+N más)"', () => {
  const cards: CardViewModel[] = [
    { thread_id: TID, commentType: 'nota', lineLabel: 'L1', hasAnchor: true, status: 'open', fixCommit: null, openCommit: null, messages: [] },
  ];
  const allDocs = new Map([['doc.md', cards]]);
  const html = buildAllDocsHtml(allDocs, 7);

  assert.ok(html.includes('(+7 más)'), 'debe incluir el indicador de overflow');
});

test('buildAllDocsHtml sin overflow no incluye indicador de overflow', () => {
  const cards: CardViewModel[] = [
    { thread_id: TID, commentType: 'nota', lineLabel: 'L1', hasAnchor: true, status: 'open', fixCommit: null, openCommit: null, messages: [] },
  ];
  const allDocs = new Map([['doc.md', cards]]);
  const html = buildAllDocsHtml(allDocs, 0);

  assert.ok(!html.includes('más)'), 'no debe incluir indicador de overflow cuando overflow es 0');
});

test('buildAllDocsHtml muestra solo el nombre de fichero en la cabecera del grupo (no la ruta completa)', () => {
  const cards: CardViewModel[] = [
    { thread_id: TID, commentType: 'nota', lineLabel: 'L1', hasAnchor: true, status: 'open', fixCommit: null, openCommit: null, messages: [] },
  ];
  const allDocs = new Map([['src/deep/file.ts', cards]]);
  const html = buildAllDocsHtml(allDocs);

  assert.ok(html.includes('file.ts (1)'), 'la cabecera del grupo debe mostrar solo el nombre de fichero');
  // la ruta completa debe aparecer en data-doc-path pero no en el título del grupo
  assert.ok(html.includes('data-doc-path="src/deep/file.ts"'), 'data-doc-path debe contener la ruta completa');
});

test('buildAllDocsHtml omite grupos con 0 hilos', () => {
  const allDocs = new Map<string, CardViewModel[]>([
    ['vacio.md', []],
    ['conhilos.md', [{ thread_id: TID, commentType: 'nota', lineLabel: 'L1', hasAnchor: true, status: 'open', fixCommit: null, openCommit: null, messages: [] }]],
  ]);
  const html = buildAllDocsHtml(allDocs);

  assert.ok(!html.includes('vacio.md'), 'no debe incluir grupos con 0 hilos');
  assert.ok(html.includes('conhilos.md'), 'debe incluir grupos con hilos');
});

test('buildAllDocsHtml solo overflow sin docs devuelve cadena vacía', () => {
  // Fix 6: sin hilos visibles no se renderiza la sección aunque haya overflow;
  // una sección con 0 entradas concretas no aporta información útil.
  const html = buildAllDocsHtml(new Map(), 3);
  assert.strictEqual(html, '', 'sin hilos visibles devuelve cadena vacía aunque haya overflow');
});

test('buildAllDocsHtml ordena documentos alfabéticamente (fix 4)', () => {
  // Los documentos deben aparecer en orden localeCompare independientemente
  // del orden de inserción en el Map.
  const card: CardViewModel = {
    thread_id: TID, commentType: 'nota', lineLabel: 'L1',
    hasAnchor: true, status: 'open', fixCommit: null, openCommit: null, messages: [],
  };
  const allDocs = new Map<string, CardViewModel[]>([
    ['zebra.md',  [card]],
    ['alpha.md',  [card]],
    ['middle.md', [card]],
  ]);
  const html = buildAllDocsHtml(allDocs);

  const idxAlpha  = html.indexOf('alpha.md');
  const idxMiddle = html.indexOf('middle.md');
  const idxZebra  = html.indexOf('zebra.md');
  assert.ok(idxAlpha  < idxMiddle, 'alpha.md debe aparecer antes que middle.md');
  assert.ok(idxMiddle < idxZebra,  'middle.md debe aparecer antes que zebra.md');
});

test('buildAllDocsHtml usa clase "nota" como fallback para commentType desconocido (fix 5)', () => {
  // Un commentType no incluido en VALID_COMMENT_TYPES no debe inyectar clases arbitrarias.
  const card: CardViewModel = {
    thread_id: TID, commentType: 'tipo-malicioso con espacios', lineLabel: 'L1',
    hasAnchor: true, status: 'open', fixCommit: null, openCommit: null, messages: [],
  };
  const allDocs = new Map([['doc.md', [card]]]);
  const html = buildAllDocsHtml(allDocs);

  // La clase CSS usa el fallback seguro
  assert.ok(html.includes('bullet-nota'), 'debe usar bullet-nota como clase fallback');
  // El texto visible muestra el valor (escapado) del tipo original
  assert.ok(html.includes('tipo-malicioso'), 'el texto visible muestra el tipo original escapado');
  // No debe inyectar la clase con espacios tal cual
  assert.ok(!html.includes('bullet-tipo-malicioso con espacios'), 'no debe inyectar la clase con espacios');
});

// ---------------------------------------------------------------------------
// P6 — isWebviewActionMessage: jump-doc
// ---------------------------------------------------------------------------

test('isWebviewActionMessage acepta jump-doc con UUID y ruta relativa válida', () => {
  assert.ok(isWebviewActionMessage({ type: 'jump-doc', thread_id: TID, doc_path: 'src/foo.ts' }));
});

test('isWebviewActionMessage acepta jump-doc con ruta en el raíz del repo', () => {
  assert.ok(isWebviewActionMessage({ type: 'jump-doc', thread_id: TID, doc_path: 'README.md' }));
});

test('isWebviewActionMessage rechaza jump-doc con ruta absoluta Unix', () => {
  assert.ok(!isWebviewActionMessage({ type: 'jump-doc', thread_id: TID, doc_path: '/etc/passwd' }));
});

test('isWebviewActionMessage rechaza jump-doc con ruta absoluta Windows', () => {
  assert.ok(!isWebviewActionMessage({ type: 'jump-doc', thread_id: TID, doc_path: 'C:\\Users\\evil' }));
});

test('isWebviewActionMessage rechaza jump-doc con traversal ..' , () => {
  assert.ok(!isWebviewActionMessage({ type: 'jump-doc', thread_id: TID, doc_path: '../../etc/passwd' }));
});

test('isWebviewActionMessage rechaza jump-doc con .. en segmento interno', () => {
  assert.ok(!isWebviewActionMessage({ type: 'jump-doc', thread_id: TID, doc_path: 'src/../../../etc/passwd' }));
});

test('isWebviewActionMessage rechaza jump-doc con ruta vacía', () => {
  assert.ok(!isWebviewActionMessage({ type: 'jump-doc', thread_id: TID, doc_path: '' }));
});

test('isWebviewActionMessage rechaza jump-doc sin doc_path', () => {
  assert.ok(!isWebviewActionMessage({ type: 'jump-doc', thread_id: TID }));
});

test('isWebviewActionMessage rechaza jump-doc con thread_id no-UUID', () => {
  assert.ok(!isWebviewActionMessage({ type: 'jump-doc', thread_id: 'no-uuid', doc_path: 'README.md' }));
});

// ---------------------------------------------------------------------------
// P6 — buildCardsHtml con allDocs incluye la sección multi-fichero
// ---------------------------------------------------------------------------

test('buildCardsHtml con allDocs incluye sección all-docs al final', () => {
  const currentCard: CardViewModel = {
    thread_id:   TID,
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const otherCard: CardViewModel = {
    thread_id:   MID,
    commentType: 'sugerencia',
    lineLabel:   'L3',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages:    [],
  };
  const allDocs = new Map([['otro.md', [otherCard]]]);
  const html = buildCardsHtml([currentCard], allDocs);

  assert.ok(html.includes('data-section="all-docs"'), 'debe incluir la sección all-docs');
  assert.ok(html.includes('Repositorio (1)'), 'la sección all-docs debe indicar 1 hilo');
});

test('buildCardsHtml sin allDocs no incluye sección all-docs', () => {
  const card: CardViewModel = {
    thread_id:   TID,
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages:    [{ id: 'm1', authorLabel: 'humano', dateLabel: '13 jul', body: 'ok' }],
  };
  const html = buildCardsHtml([card]);
  assert.ok(!html.includes('data-section="all-docs"'), 'no debe incluir sección all-docs sin el parámetro');
});

test('buildCardsHtml vacío con allDocs muestra mensaje vacío y sección all-docs', () => {
  const otherCard: CardViewModel = {
    thread_id:   TID,
    commentType: 'nota',
    lineLabel:   'L5',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages:    [],
  };
  const allDocs = new Map([['otro.md', [otherCard]]]);
  const html = buildCardsHtml([], allDocs);

  assert.ok(html.includes('Sin comentarios'), 'debe incluir el mensaje de vacío');
  assert.ok(html.includes('data-section="all-docs"'), 'también debe incluir la sección all-docs');
});

// ---------------------------------------------------------------------------
// Fase 9.1 — banda de confianza del reviser en la meta del mensaje
// ---------------------------------------------------------------------------

test('buildCardViewModels propaga confidence del mensaje IA al CardMessage', () => {
  const thread = makeThread({
    commentType: 'verifica',
    messages: [
      makeMsg({
        id: 'm1', body: 'análisis del reviser',
        author: { kind: 'ai', model: 'claude-sonnet', subagent: 'reviser' },
        confidence: 'media',
      }),
    ],
  });
  const [card] = buildCardViewModels([thread]);
  assert.strictEqual(card.messages[0].confidence, 'media');
});

test('buildCardViewModels no propaga confidence cuando el mensaje no la trae', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages: [
      makeMsg({ id: 'm1', body: 'sin confianza', author: { kind: 'ai', model: 'claude-sonnet' } }),
    ],
  });
  const [card] = buildCardViewModels([thread]);
  assert.strictEqual(card.messages[0].confidence, undefined);
});

test('buildCardsHtml muestra banda de confianza en la meta del mensaje IA que la lleva', () => {
  const card: CardViewModel = {
    thread_id:   TID,
    commentType: 'verifica',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages: [
      { id: 'm1', authorLabel: 'reviser · claude-sonnet', dateLabel: '16 jul', body: 'ok', confidence: 'alta' },
    ],
  };
  const html = buildCardsHtml([card]);
  assert.ok(html.includes('card-confidence-alta'), 'debe incluir la clase de confianza alta del mensaje');
  assert.ok(html.includes('card-confidence'), 'debe incluir la clase base card-confidence');
});

test('buildCardsHtml no muestra banda de confianza en mensajes sin confidence', () => {
  const card: CardViewModel = {
    thread_id:   TID,
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages: [
      { id: 'm1', authorLabel: 'humano', dateLabel: '16 jul', body: 'ok' },
    ],
  };
  const html = buildCardsHtml([card]);
  // La tarjeta puede tener card-confidence por el thread-level confidence; aquí no hay.
  // Verificamos más estrictamente que el meta del mensaje no tiene card-confidence.
  // El meta del mensaje tiene clase card-meta, buscamos que no haya card-confidence DENTRO de un msg.
  // Usamos la ausencia total como proxy (no hay confidence de hilo tampoco).
  assert.ok(!html.includes('card-confidence'), 'no debe incluir card-confidence cuando no hay confianza en el mensaje ni en el hilo');
});

test('buildCardsHtml escapa el valor de confidence del mensaje (defensa en profundidad)', () => {
  // Aunque el campo solo puede ser 'alta'|'media'|'baja', un valor manipulado
  // en disco podría venir como cadena arbitraria; escapeHtml lo neutraliza.
  const card: CardViewModel = {
    thread_id:   TID,
    commentType: 'nota',
    lineLabel:   'L1',
    hasAnchor:   true,
    status:      'open',
    fixCommit:   null,
    openCommit:  null,
    messages: [
      {
        id: 'm1', authorLabel: 'reviser · claude-sonnet', dateLabel: '16 jul', body: 'ok',
        confidence: '<script>' as unknown as 'alta',
      },
    ],
  };
  const html = buildCardsHtml([card]);
  assert.ok(!html.includes('<script>'), 'el valor de confidence no debe aparecer sin escapar');
  assert.ok(html.includes('&lt;script&gt;'), 'el valor de confidence debe estar HTML-escapado');
});


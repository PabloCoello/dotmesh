/**
 * Tests unitarios para buildThreadHover (decorations-utils.ts).
 *
 * buildHoverMessage y el resto de las funciones puras ya están cubiertas
 * en decorations.test.ts. Este fichero añade los casos específicos de
 * buildThreadHover: hilo completo, mensajes retractados y assignee.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildThreadHover, escapeMd, buildHoverMessage } from './decorations-utils.ts';
import type { ThreadProjection, MessageProjection } from './sidecar.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMsg(
  overrides: Pick<MessageProjection, 'id' | 'body'> &
    Partial<MessageProjection>
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
  overrides: Pick<ThreadProjection, 'commentType' | 'messages'> &
    Partial<Pick<ThreadProjection, 'assignee'>>
): Pick<ThreadProjection, 'commentType' | 'assignee' | 'messages'> {
  return {
    commentType: overrides.commentType,
    assignee:    overrides.assignee,
    messages:    overrides.messages,
  };
}

// ---------------------------------------------------------------------------
// (i) Un solo mensaje humano → contiene el body y el tipo
// ---------------------------------------------------------------------------

test('buildThreadHover con un mensaje humano contiene el tipo', () => {
  const thread = makeThread({
    commentType: 'sugerencia',
    messages: [makeMsg({ id: 'm1', body: 'Texto de la sugerencia' })],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(result.includes('sugerencia'), `Debe contener el tipo, obtenido:\n${result}`);
});

test('buildThreadHover con un mensaje humano contiene el body', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages: [makeMsg({ id: 'm1', body: 'Cuerpo único del hilo' })],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(result.includes('Cuerpo único del hilo'), `Debe contener el body, obtenido:\n${result}`);
});

// ---------------------------------------------------------------------------
// (ii) Dos mensajes (humano + IA subagent 'reviser') → ambos bodies + etiqueta
// ---------------------------------------------------------------------------

test('buildThreadHover con dos mensajes contiene el body del primer mensaje (humano)', () => {
  const thread = makeThread({
    commentType: 'edita',
    messages: [
      makeMsg({ id: 'm1', body: 'Primera observación' }),
      makeMsg({
        id:     'm2',
        body:   'Respuesta del agente',
        author: { kind: 'ai', model: 'claude-sonnet', subagent: 'reviser' },
      }),
    ],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(result.includes('Primera observación'), `Debe contener el body humano, obtenido:\n${result}`);
});

test('buildThreadHover con dos mensajes contiene el body del segundo mensaje (IA)', () => {
  const thread = makeThread({
    commentType: 'edita',
    messages: [
      makeMsg({ id: 'm1', body: 'Primera observación' }),
      makeMsg({
        id:     'm2',
        body:   'Respuesta del agente',
        author: { kind: 'ai', model: 'claude-sonnet', subagent: 'reviser' },
      }),
    ],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(result.includes('Respuesta del agente'), `Debe contener el body de IA, obtenido:\n${result}`);
});

test('buildThreadHover con mensaje IA (subagent=reviser) contiene la etiqueta reviser', () => {
  const thread = makeThread({
    commentType: 'verifica',
    messages: [
      makeMsg({ id: 'm1', body: 'Pregunta inicial' }),
      makeMsg({
        id:     'm2',
        body:   'Verificado contra fuente',
        author: { kind: 'ai', model: 'claude-sonnet', subagent: 'reviser' },
      }),
    ],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(result.includes('reviser'), `Debe contener la etiqueta de subagente, obtenido:\n${result}`);
});

// ---------------------------------------------------------------------------
// (iii) Un mensaje activo + uno retractado → el retractado NO aparece
// ---------------------------------------------------------------------------

test('buildThreadHover omite el body del mensaje retractado', () => {
  const thread = makeThread({
    commentType: 'pregunta',
    messages: [
      makeMsg({ id: 'm1', body: 'Cuerpo visible' }),
      makeMsg({ id: 'm2', body: 'Cuerpo retirado', retracted: true }),
    ],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(!result.includes('Cuerpo retirado'), `No debe contener el body retractado, obtenido:\n${result}`);
});

test('buildThreadHover mantiene el body del mensaje activo cuando hay uno retractado', () => {
  const thread = makeThread({
    commentType: 'pregunta',
    messages: [
      makeMsg({ id: 'm1', body: 'Cuerpo visible' }),
      makeMsg({ id: 'm2', body: 'Cuerpo retirado', retracted: true }),
    ],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(result.includes('Cuerpo visible'), `Debe contener el body activo, obtenido:\n${result}`);
});

// ---------------------------------------------------------------------------
// (iv) Assignee presente → aparece en la cabecera
// ---------------------------------------------------------------------------

test('buildThreadHover con assignee lo incluye en la cabecera', () => {
  const thread = makeThread({
    commentType: 'supuesto',
    assignee:    'scribe',
    messages:    [makeMsg({ id: 'm1', body: 'Un supuesto asignado' })],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(result.includes('scribe'), `Debe contener el assignee, obtenido:\n${result}`);
});

test('buildThreadHover assignee aparece antes del separador', () => {
  const thread = makeThread({
    commentType: 'referencia',
    assignee:    'editor',
    messages:    [makeMsg({ id: 'm1', body: 'Una referencia' })],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  const assigneeIdx  = result.indexOf('editor');
  const separatorIdx = result.indexOf('─'.repeat(40));
  assert.ok(assigneeIdx < separatorIdx, 'El assignee debe aparecer antes del separador');
});

test('buildThreadHover sin assignee no contiene el separador · en la cabecera', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages:    [makeMsg({ id: 'm1', body: 'Sin asignado' })],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  // La cabecera es el primer bloque; «·» solo aparece ahí si hay assignee.
  // Las meta-líneas por mensaje sí usan « · » (autor · fecha), por eso se
  // acota la aserción a la cabecera.
  const header = result.split('\n\n')[0];
  assert.ok(!header.includes(' · '), `La cabecera no debe contener ‹ · › sin assignee, obtenido:\n${header}`);
});

// ---------------------------------------------------------------------------
// Escapado de HTML — el hover se pinta con MarkdownString.supportHtml=true,
// así que todo valor derivado del evento debe salir escapado o sería inyección.
// ---------------------------------------------------------------------------

test('buildThreadHover escapa el body del mensaje (no inyecta HTML)', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages: [makeMsg({ id: 'm1', body: 'peligro <img src=x onerror=alert(1)> & fin' })],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(!result.includes('<img'), `El <img crudo no debe aparecer, obtenido:\n${result}`);
  assert.ok(result.includes('&lt;img src=x onerror=alert(1)&gt;'), 'El body debe salir escapado');
  assert.ok(result.includes('&amp; fin'), 'El & del body debe salir escapado');
});

test('buildThreadHover escapa la etiqueta de autor IA (subagent/model)', () => {
  const thread = makeThread({
    commentType: 'verifica',
    messages: [makeMsg({
      id: 'm1', body: 'verificación',
      author: { kind: 'ai', model: 'claude<script>', subagent: undefined },
    })],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(!result.includes('claude<script>'), `El <script> crudo no debe aparecer, obtenido:\n${result}`);
  assert.ok(result.includes('claude&lt;script&gt;'), 'La etiqueta de autor debe salir escapada');
});

test('buildThreadHover escapa la fecha cuando created_at es inválido (no inyecta HTML)', () => {
  // formatTimestamp devuelve el created_at crudo si no parsea; ese valor
  // se interpola en el HTML del span y debe salir escapado.
  const thread = makeThread({
    commentType: 'nota',
    messages: [makeMsg({ id: 'm1', body: 'ok', created_at: '2026<img src=x onerror=alert(1)>' })],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(!result.includes('<img'), `El <img crudo de la fecha no debe aparecer, obtenido:\n${result}`);
  assert.ok(result.includes('2026&lt;img src=x onerror=alert(1)&gt;'), 'La fecha inválida debe salir escapada');
});

test('buildThreadHover escapa el assignee', () => {
  const thread = makeThread({
    commentType: 'referencia',
    assignee:    '<editor>',
    messages:    [makeMsg({ id: 'm1', body: 'ref' })],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(!result.includes('<editor>'), `El <editor> crudo no debe aparecer, obtenido:\n${result}`);
  assert.ok(result.includes('&lt;editor&gt;'), 'El assignee debe salir escapado');
});

test('buildThreadHover con messages vacío no lanza y rinde cabecera + separador', () => {
  const thread = makeThread({ commentType: 'nota', messages: [] });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(result.includes('nota'), 'Debe rendir la cabecera con el tipo aunque no haya mensajes');
  assert.ok(result.includes('─'.repeat(40)), 'Debe rendir el separador aunque no haya mensajes');
});

// ---------------------------------------------------------------------------
// (v) Meta-línea «── autor · fecha» por mensaje — separa visualmente los
//     mensajes del hilo (feedback: era indistinguible de un salto de línea).
// ---------------------------------------------------------------------------

test('buildThreadHover pone una meta-línea por cada mensaje activo', () => {
  const thread = makeThread({
    commentType: 'supuesto',
    messages: [
      makeMsg({ id: 'm1', body: 'Incluye cuentas de prueba' }),
      makeMsg({ id: 'm2', body: 'me lo creo bien' }),
      makeMsg({ id: 'm3', body: 'claro' }),
    ],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  // El separador de cabecera es «────…» sin espacio; «── » (con espacio) solo
  // aparece al inicio de cada meta-línea, así que contarlo cuenta los mensajes.
  const metaCount = result.split('── ').length - 1;
  assert.equal(metaCount, 3, `Debe haber una meta-línea por mensaje, obtenido:\n${result}`);
});

test('buildThreadHover etiqueta el autor humano como «humano»', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages: [makeMsg({ id: 'm1', body: 'x' })],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(result.includes('── humano · '), `Meta-línea humana esperada, obtenido:\n${result}`);
});

test('buildThreadHover usa author.name cuando el humano lo tiene', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages: [makeMsg({ id: 'm1', body: 'x', author: { kind: 'human', name: 'Pablo' } })],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(result.includes('── Pablo · '), `Debe usar el name del autor, obtenido:\n${result}`);
});

test('buildThreadHover incluye la fecha formateada en la meta-línea del mensaje', () => {
  const thread = makeThread({
    commentType: 'nota',
    messages: [makeMsg({ id: 'm1', body: 'x', created_at: '2026-07-13T10:00:00Z' })],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(result.includes('13 jul 2026'), `Debe incluir la fecha, obtenido:\n${result}`);
});

test('buildThreadHover pone la meta-línea del mensaje IA con su subagente', () => {
  const thread = makeThread({
    commentType: 'verifica',
    messages: [
      makeMsg({ id: 'm1', body: 'Pregunta' }),
      makeMsg({
        id: 'm2', body: 'Respuesta',
        author: { kind: 'ai', model: 'claude-sonnet', subagent: 'reviser' },
      }),
    ],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  assert.ok(result.includes('── reviser · '), `Meta-línea IA esperada, obtenido:\n${result}`);
});

// ---------------------------------------------------------------------------
// sec#2 — escapeMd y protección de commentType contra inyección de Markdown
// ---------------------------------------------------------------------------

test('escapeMd escapa los metacaracteres de Markdown: * _ ` [ ] ( ) # ~ \\', () => {
  assert.strictEqual(escapeMd('*negrita*'),  '\\*negrita\\*');
  assert.strictEqual(escapeMd('_cursiva_'),  '\\_cursiva\\_');
  assert.strictEqual(escapeMd('`código`'),   '\\`código\\`');
  assert.strictEqual(escapeMd('[link](url)'), '\\[link\\]\\(url\\)');
  assert.strictEqual(escapeMd('# cabecera'), '\\# cabecera');
  assert.strictEqual(escapeMd('~tachado~'),  '\\~tachado\\~');
  assert.strictEqual(escapeMd('a\\b'),       'a\\\\b');
});

test('escapeMd no altera un commentType normal (sin metacaracteres)', () => {
  assert.strictEqual(escapeMd('nota'),      'nota');
  assert.strictEqual(escapeMd('sugerencia'), 'sugerencia');
});

test('buildThreadHover escapa commentType con metacaracteres de Markdown', () => {
  const thread = makeThread({
    commentType: '*inyeccion*' as any,
    messages: [makeMsg({ id: 'm1', body: 'cuerpo' })],
  });
  const result = buildThreadHover(thread, 'es-ES', 'UTC');
  // El tipo no debe aparecer crudo como metacaracter activo en la cabecera
  assert.ok(result.includes('\\*inyeccion\\*'), `Debe salir escapado, obtenido:\n${result}`);
});

test('buildHoverMessage escapa comment.type con metacaracteres de Markdown', () => {
  const comment = {
    type: '_inyeccion_' as any,
    agent: undefined,
    body: 'cuerpo',
    created_at: '2026-07-15T10:00:00Z',
  };
  const result = buildHoverMessage(comment, 'es-ES', 'UTC');
  assert.ok(result.includes('\\_inyeccion\\_'), `Debe salir escapado, obtenido:\n${result}`);
});

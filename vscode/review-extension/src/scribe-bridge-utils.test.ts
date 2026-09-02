/**
 * Tests unitarios para scribe-bridge-utils.ts.
 *
 * Sin importaciones de VS Code: módulo puro testeable con node:test.
 * Cubre buildLaunchCommand, buildSendAllPrompt y buildFocusPrompt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLaunchCommand,
  buildSendAllPrompt,
  buildFocusPrompt,
  checkProcessAlive,
  resolveCliBundle,
  createPromiseQueue,
} from './scribe-bridge-utils.ts';

// UUID canónico de prueba
const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// ---------------------------------------------------------------------------
// buildLaunchCommand
// ---------------------------------------------------------------------------

test('buildLaunchCommand fija la persona con --settings', () => {
  const cmd = buildLaunchCommand('scribe');
  assert.equal(cmd, `claude --settings '{"outputStyle":"scribe"}'`);
});

test('buildLaunchCommand no usa --style (no existe en la CLI de Claude Code)', () => {
  const cmd = buildLaunchCommand('scribe');
  assert.ok(!cmd.includes('--style'), 'el comando no debe depender del wrapper de shell');
});

test('buildLaunchCommand con estilo diferente lo refleja en el resultado', () => {
  const cmd = buildLaunchCommand('maker');
  assert.equal(cmd, `claude --settings '{"outputStyle":"maker"}'`);
});

// ---------------------------------------------------------------------------
// buildSendAllPrompt
// ---------------------------------------------------------------------------

test('buildSendAllPrompt incluye la ruta del documento', () => {
  const prompt = buildSendAllPrompt('docs/informe.md');
  assert.ok(prompt.includes('docs/informe.md'), 'el prompt debe incluir la ruta del documento');
});

test('buildSendAllPrompt incluye mesh-review project --pending', () => {
  const prompt = buildSendAllPrompt('docs/informe.md');
  assert.ok(prompt.includes('mesh-review project --pending'), 'el prompt debe incluir el comando con --pending');
});

test('buildSendAllPrompt es una sola línea (sin saltos internos)', () => {
  const prompt = buildSendAllPrompt('docs/informe.md');
  assert.ok(!prompt.includes('\n'), 'el prompt no debe contener saltos de línea internos');
});

// ---------------------------------------------------------------------------
// buildFocusPrompt
// ---------------------------------------------------------------------------

test('buildFocusPrompt incluye el thread_id', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42');
  assert.ok(prompt.includes(UUID), 'el prompt debe incluir el thread_id');
});

test('buildFocusPrompt incluye el tipo de comentario', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42');
  assert.ok(prompt.includes('edita'), 'el prompt debe incluir el commentType');
});

test('buildFocusPrompt incluye la etiqueta de línea', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42');
  assert.ok(prompt.includes('L42'), 'el prompt debe incluir el lineLabel');
});

test('buildFocusPrompt incluye mesh-review project sin --pending', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42');
  assert.ok(prompt.includes('mesh-review project'), 'el prompt debe incluir mesh-review project');
  assert.ok(!prompt.includes('--pending'), 'el prompt de foco no debe incluir --pending');
});

test('buildFocusPrompt es una sola línea (sin saltos internos)', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42');
  assert.ok(!prompt.includes('\n'), 'el prompt no debe contener saltos de línea internos');
});

// ---------------------------------------------------------------------------
// Saneado (endurecimiento post-review)
// ---------------------------------------------------------------------------

test('buildLaunchCommand rechaza estilos con metacaracteres de shell', () => {
  assert.throws(() => buildLaunchCommand('scribe; rm -rf ~'), TypeError);
  assert.throws(() => buildLaunchCommand('scribe $(whoami)'), TypeError);
  assert.throws(() => buildLaunchCommand(''), TypeError);
});

test('buildLaunchCommand rechaza estilos que romperían el JSON de --settings', () => {
  // Una comilla doble cerraría el valor del JSON; una simple, el entrecomillado
  // del shell. Ninguna pasa el filtro de VALID_STYLE_RE.
  assert.throws(() => buildLaunchCommand('scribe"'), TypeError);
  assert.throws(() => buildLaunchCommand("scribe'"), TypeError);
  assert.throws(() => buildLaunchCommand('scribe}'), TypeError);
});

test('buildSendAllPrompt entrecomilla la ruta con comillas simples POSIX', () => {
  const prompt = buildSendAllPrompt('docs/$(rm -rf ~).md');
  assert.ok(
    prompt.includes(`'docs/$(rm -rf ~).md'`),
    'la ruta debe ir entre comillas simples para neutralizar $(…) en una shell'
  );
});

test('buildSendAllPrompt escapa comillas simples internas de la ruta', () => {
  const prompt = buildSendAllPrompt(`docs/o'hara.md`);
  assert.ok(
    prompt.includes(`'docs/o'\\''hara.md'`),
    'una comilla simple interna debe escaparse como \'\\\'\''
  );
});

test('buildSendAllPrompt colapsa saltos de línea de la ruta a una sola línea', () => {
  const prompt = buildSendAllPrompt('docs/eco\npwned.md');
  assert.ok(!prompt.includes('\n'), 'el prompt debe seguir siendo una sola línea');
});

test('buildFocusPrompt sustituye un commentType fuera de la lista blanca', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, '$(whoami)', 'L42');
  assert.ok(!prompt.includes('$(whoami)'), 'un commentType desconocido no debe interpolarse crudo');
  assert.ok(prompt.includes('comentario'), 'debe usarse la etiqueta neutra de fallback');
});

test('buildFocusPrompt conserva un commentType de la lista blanca', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'sugerencia', 'L42');
  assert.ok(prompt.includes('sugerencia'), 'un commentType válido debe conservarse');
});

test('buildFocusPrompt colapsa caracteres de control en lineLabel', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42\ninyección');
  assert.ok(!prompt.includes('\n'), 'el prompt debe seguir siendo una sola línea');
});

test('buildFocusPrompt entrecomilla lineLabel para neutralizar separadores de comandos', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42; rm -rf ~ #');
  assert.ok(
    prompt.includes(`'L42; rm -rf ~ #'`),
    'un lineLabel inesperado debe quedar inerte dentro de comillas simples'
  );
});

test('buildFocusPrompt elimina caracteres de control C1 (CSI) de los valores', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42\x9b31m');
  assert.ok(!prompt.includes('\x9b'), 'los caracteres C1 no deben llegar al terminal');
});

// ---------------------------------------------------------------------------
// checkProcessAlive (T3.2)
// ---------------------------------------------------------------------------

test('checkProcessAlive devuelve true para el proceso actual (self)', () => {
  // process.pid siempre existe mientras corre el test runner
  const result = checkProcessAlive(process.pid);
  assert.strictEqual(result, true, 'el proceso actual debe reportar alive=true');
});

test('checkProcessAlive devuelve false para un PID inexistente', () => {
  // PID 99999999 es muy improbable que exista; si existiera, el test fallaría
  // con un falso negativo no relacionado con el código. Tolerado por la naturaleza
  // probabilística del test: si falla, revisar el entorno, no el código.
  const result = checkProcessAlive(99999999);
  assert.ok(result === false || result === undefined,
    'un PID inexistente debe reportar alive=false o undefined (EPERM en algunos SO)');
});

test('checkProcessAlive devuelve undefined para PID no positivo (guardia defensiva)', () => {
  assert.strictEqual(checkProcessAlive(0),  undefined, 'pid=0 debe devolver undefined');
  assert.strictEqual(checkProcessAlive(-1), undefined, 'pid=-1 debe devolver undefined');
  assert.strictEqual(checkProcessAlive(1.5), undefined, 'pid no entero debe devolver undefined');
});

// ---------------------------------------------------------------------------
// resolveCliBundle (T3.3)
// ---------------------------------------------------------------------------

test('resolveCliBundle devuelve string o undefined (no lanza)', () => {
  // Solo verificamos que no lanza: el bundle puede estar o no en este entorno.
  let result: unknown;
  assert.doesNotThrow(() => { result = resolveCliBundle(); });
  assert.ok(result === undefined || typeof result === 'string',
    'resolveCliBundle debe devolver string o undefined');
});

test('resolveCliBundle usa MESH_REVIEW_CLI si apunta a un fichero existente', () => {
  // process.execPath siempre existe en cualquier entorno donde corren los tests.
  const realPath = process.execPath;
  const prev = process.env['MESH_REVIEW_CLI'];
  process.env['MESH_REVIEW_CLI'] = realPath;
  try {
    const result = resolveCliBundle();
    assert.strictEqual(result, realPath,
      'debe preferir MESH_REVIEW_CLI sobre las rutas conocidas cuando el fichero existe');
  } finally {
    if (prev === undefined) delete process.env['MESH_REVIEW_CLI'];
    else process.env['MESH_REVIEW_CLI'] = prev;
  }
});

test('resolveCliBundle ignora MESH_REVIEW_CLI si el fichero no existe', () => {
  const prev = process.env['MESH_REVIEW_CLI'];
  process.env['MESH_REVIEW_CLI'] = '/ruta/inexistente/mesh-review.mjs';
  try {
    const result = resolveCliBundle();
    assert.ok(result !== '/ruta/inexistente/mesh-review.mjs',
      'una ruta inexistente en MESH_REVIEW_CLI no debe devolverse');
    assert.ok(result === undefined || typeof result === 'string',
      'el resultado debe ser string o undefined');
  } finally {
    if (prev === undefined) delete process.env['MESH_REVIEW_CLI'];
    else process.env['MESH_REVIEW_CLI'] = prev;
  }
});

// ---------------------------------------------------------------------------
// createPromiseQueue (T3.4)
// ---------------------------------------------------------------------------

test('createPromiseQueue serializa dos envíos concurrentes en orden', async () => {
  const enqueue = createPromiseQueue();
  const order: number[] = [];
  // p1 tarda 20 ms; p2 se encola antes de que p1 termine.
  const p1 = enqueue(() => new Promise<void>(r => setTimeout(() => { order.push(1); r(); }, 20)));
  const p2 = enqueue(async () => { order.push(2); });
  await Promise.all([p1, p2]);
  assert.deepEqual(order, [1, 2], 'p2 debe ejecutarse después de p1 aunque se encolen a la vez');
});

test('createPromiseQueue no bloquea la cola tras un rechazo', async () => {
  const enqueue = createPromiseQueue();
  // p1 rechaza; p2 debe ejecutarse igualmente.
  const p1 = enqueue(async () => { throw new Error('fallo intencional'); });
  let ran = false;
  const p2 = enqueue(async () => { ran = true; });
  await p1.catch(() => {}); // consumir el rechazo para que el test no falle aquí
  await p2;
  assert.equal(ran, true, 'p2 debe ejecutarse aunque p1 haya rechazado');
});

test('createPromiseQueue propaga el rechazo al caller sin perderlo', async () => {
  const enqueue = createPromiseQueue();
  const p1 = enqueue(async () => { throw new Error('rechazo visible'); });
  await assert.rejects(p1, /rechazo visible/, 'el caller debe poder observar el error de fn');
});

test('createPromiseQueue devuelve el valor de retorno de fn', async () => {
  const enqueue = createPromiseQueue();
  const result = await enqueue(async () => 42);
  assert.equal(result, 42, 'debe propagar el valor de retorno de fn al caller');
});

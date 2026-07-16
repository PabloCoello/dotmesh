import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chunkHash } from './hash.ts';
import { computeOutputStates } from './stale.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Construye un bloque chunk válido. */
function makeChunk(id: string, code: string): string {
  return `\`\`\`python {#${id}}\n${code}\n\`\`\``;
}

/** Construye un bloque output válido con atributos opcionales. */
function makeOutput(
  id: string,
  hash: string,
  content: string,
  opts?: { warn?: boolean; seq?: number; up?: string }
): string {
  let attrs = `hash=${hash}`;
  if (opts?.warn === true) attrs += ' warn=1';
  if (opts?.seq !== undefined) attrs += ` seq=${opts.seq}`;
  if (opts?.up !== undefined) attrs += ` up=${opts.up}`;
  return `\`\`\`output {#${id} ${attrs}}\n${content}\n\`\`\``;
}

// ---------------------------------------------------------------------------
// Casos base — documentos sin outputs
// ---------------------------------------------------------------------------

test('computeOutputStates: documento vacío → []', () => {
  assert.deepStrictEqual(computeOutputStates(''), []);
});

test('computeOutputStates: documento solo con prosa, sin bloques → []', () => {
  assert.deepStrictEqual(computeOutputStates('# Título\n\nTexto normal.\n'), []);
});

test('computeOutputStates: chunk sin output → []', () => {
  const doc = `${makeChunk('c1', 'print("hello")')}\n`;
  assert.deepStrictEqual(computeOutputStates(doc), []);
});

// ---------------------------------------------------------------------------
// Estado 'fresh'
// ---------------------------------------------------------------------------

test('computeOutputStates: hash coincidente, sin prefijo de error → fresh', () => {
  const code = 'x = 1\nprint(x)';
  const hash = chunkHash(code);
  // Primer chunk (pos 0): up correcto = chunkHash('') = 'e3b0c442'
  const doc = `${makeChunk('c1', code)}\n\n${makeOutput('c1', hash, '1', { up: 'e3b0c442', seq: 1 })}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'fresh');
  assert.strictEqual(states[0].chunkId, 'c1');
});

// ---------------------------------------------------------------------------
// Estado 'stale'
// ---------------------------------------------------------------------------

test('computeOutputStates: hash almacenado distinto al hash actual → stale', () => {
  const originalCode = 'x = 1';
  const editedCode = 'x = 2'; // el documento contiene el código editado
  const staleHash = chunkHash(originalCode); // hash guardado en el output (obsoleto)

  const doc = `${makeChunk('c1', editedCode)}\n\n${makeOutput('c1', staleHash, '1')}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'stale');
  assert.strictEqual(states[0].chunkId, 'c1');
});

test('computeOutputStates: output huérfano (chunkId no existe en el documento) → stale', () => {
  // Solo hay un output; no hay ningún chunk con el mismo id
  const doc = `${makeOutput('noexiste', 'deadbeef', 'salida')}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'stale');
  assert.strictEqual(states[0].chunkId, 'noexiste');
});

// ---------------------------------------------------------------------------
// Estado 'error'
// ---------------------------------------------------------------------------

test('computeOutputStates: contenido con prefijo "# Error\\n" y hash coincidente → error', () => {
  const code = 'raise ValueError("oops")';
  const hash = chunkHash(code);
  const errorContent = '# Error\nTraceback (most recent call last):\n  ...\nValueError: oops';
  // up y seq correctos: sin ellos el output sería stale antes de llegar a la regla 8
  const doc = `${makeChunk('c1', code)}\n\n${makeOutput('c1', hash, errorContent, { up: 'e3b0c442', seq: 1 })}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'error');
});

test('computeOutputStates: prefijo "# Error\\n" con hash diferente → stale (stale precede a error)', () => {
  // El código fue editado después del error: el hash ya no coincide.
  // Nueva precedencia: stale > error — un output desactualizado no es fiable.
  const originalCode = 'raise ValueError("v1")';
  const editedCode = 'raise RuntimeError("v2")';
  const staleHash = chunkHash(originalCode); // hash del momento en que se guardó el error
  const errorContent = '# Error\nTraceback...\nValueError: v1';
  const doc = `${makeChunk('c1', editedCode)}\n\n${makeOutput('c1', staleHash, errorContent)}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'stale');
});

// ---------------------------------------------------------------------------
// Múltiples outputs con estados distintos
// ---------------------------------------------------------------------------

test('computeOutputStates: múltiples bloques → cada uno recibe su estado correcto', () => {
  const freshCode = 'print("a")';
  const freshHash = chunkHash(freshCode);

  const staleOrigCode = 'print("b")';
  const staleCurrentCode = 'print("b editado")';
  const staleOldHash = chunkHash(staleOrigCode);

  const errorCode = 'raise ValueError()';
  const errorHash = chunkHash(errorCode);
  const errorContent = '# Error\nValueError';

  // Chunks en orden: fresh (pos 0), stale (pos 1), err (pos 2).
  // up para err = chunkHash(chunkHash(freshCode) + '\n' + chunkHash(staleCurrentCode))
  const upForErr = chunkHash(chunkHash(freshCode) + '\n' + chunkHash(staleCurrentCode));

  const doc = [
    makeChunk('fresh', freshCode),
    '',
    makeOutput('fresh', freshHash, 'a', { up: 'e3b0c442', seq: 1 }),
    '',
    makeChunk('stale', staleCurrentCode),
    '',
    makeOutput('stale', staleOldHash, 'b'), // hash incorrecto → stale en regla 3
    '',
    makeChunk('err', errorCode),
    '',
    makeOutput('err', errorHash, errorContent, { up: upForErr, seq: 3 }),
    '',
  ].join('\n');

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 3);

  const byId = Object.fromEntries(states.map(s => [s.chunkId, s.state]));
  assert.strictEqual(byId['fresh'], 'fresh');
  assert.strictEqual(byId['stale'], 'stale');
  assert.strictEqual(byId['err'], 'error');
});

// ---------------------------------------------------------------------------
// IDs de chunk duplicados (hallazgo 1)
// ---------------------------------------------------------------------------

test('computeOutputStates: chunkId duplicado entre chunks → output marcado stale', () => {
  // Dos chunks con el mismo id: el emparejamiento es ambiguo.
  // El output tiene el hash del primer chunk pero igualmente se marca stale.
  const code1 = 'x = 1';
  const code2 = 'x = 2';
  const hash1 = chunkHash(code1);

  const doc = [
    makeChunk('dup', code1),
    '',
    makeChunk('dup', code2), // duplicado
    '',
    makeOutput('dup', hash1, 'resultado'),
    '',
  ].join('\n');

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'stale');
});

test('computeOutputStates: chunkId duplicado con prefijo error → stale (no error)', () => {
  // Con id duplicado, el estado es stale incluso si el output tiene prefijo
  // de error: el emparejamiento ambiguo toma precedencia.
  const code = 'raise ValueError()';
  const hash = chunkHash(code);
  const errorContent = '# Error\nValueError';

  const doc = [
    makeChunk('dup', code),
    '',
    makeChunk('dup', code), // duplicado
    '',
    makeOutput('dup', hash, errorContent),
    '',
  ].join('\n');

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'stale');
});

// ---------------------------------------------------------------------------
// Múltiples outputs para el mismo chunkId (hallazgo 4)
// ---------------------------------------------------------------------------

test('computeOutputStates: dos outputs con el mismo chunkId reciben estado independiente', () => {
  // El usuario tiene accidentalmente dos bloques output para el mismo chunk.
  // Cada uno se evalúa por separado: hash coincidente → fresh, hash antiguo → stale.
  const code = 'print("a")';
  const currentHash = chunkHash(code);
  const oldHash = chunkHash('print("old")');

  const doc = [
    makeChunk('c1', code),
    '',
    makeOutput('c1', currentHash, 'a', { up: 'e3b0c442', seq: 1 }), // hash coincide → fresh
    '',
    makeOutput('c1', oldHash, 'old'),   // hash obsoleto → stale (regla 3)
    '',
  ].join('\n');

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 2);
  // Orden de aparición en el documento
  assert.strictEqual(states[0].state, 'fresh');
  assert.strictEqual(states[1].state, 'stale');
});

// ---------------------------------------------------------------------------
// Offsets
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Estado 'warn'
// ---------------------------------------------------------------------------

test('computeOutputStates: warn=true, hash correcto, up correcto, seq correcto → warn', () => {
  const code = 'x = 1';
  const hash = chunkHash(code);
  const doc = `${makeChunk('c1', code)}\n\n${makeOutput('c1', hash, 'result', { warn: true, up: 'e3b0c442', seq: 1 })}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'warn');
});

// ---------------------------------------------------------------------------
// Condición 4: up ausente → stale
// ---------------------------------------------------------------------------

test('computeOutputStates: output con up ausente → stale', () => {
  const code = 'x = 1';
  const hash = chunkHash(code);
  // seq presente pero up ausente
  const doc = `${makeChunk('c1', code)}\n\n${makeOutput('c1', hash, 'result', { seq: 1 })}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'stale');
});

// ---------------------------------------------------------------------------
// Condición 5: up incorrecto → stale
// ---------------------------------------------------------------------------

test('computeOutputStates: output con up incorrecto (código upstream modificado) → stale', () => {
  const code = 'x = 1';
  const hash = chunkHash(code);
  // up correcto sería 'e3b0c442' (primer chunk, sin predecesores)
  const doc = `${makeChunk('c1', code)}\n\n${makeOutput('c1', hash, 'result', { up: 'deadbeef', seq: 1 })}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'stale');
});

// ---------------------------------------------------------------------------
// Condición 6: seq ausente → stale
// ---------------------------------------------------------------------------

test('computeOutputStates: output con seq ausente → stale', () => {
  const code = 'x = 1';
  const hash = chunkHash(code);
  // up presente pero seq ausente
  const doc = `${makeChunk('c1', code)}\n\n${makeOutput('c1', hash, 'result', { up: 'e3b0c442' })}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'stale');
});

// ---------------------------------------------------------------------------
// Condición 7: re-ejecución aguas arriba → stale / no-stale por seq
// ---------------------------------------------------------------------------

test('computeOutputStates: chunk upstream re-ejecutado después (seq mayor aguas arriba) → stale', () => {
  const codeA = 'a = 1';
  const codeB = 'b = 2';
  const hashA = chunkHash(codeA);
  const hashB = chunkHash(codeB);
  // a en pos 0, b en pos 1
  const upB = chunkHash(chunkHash(codeA)); // upstreamHashes[1]

  const doc = [
    makeChunk('a', codeA),
    '',
    makeOutput('a', hashA, 'ra', { up: 'e3b0c442', seq: 2 }), // a re-ejecutado (seq=2)
    '',
    makeChunk('b', codeB),
    '',
    makeOutput('b', hashB, 'rb', { up: upB, seq: 1 }),         // b ejecutado antes (seq=1)
    '',
  ].join('\n');

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 2);
  const byId = Object.fromEntries(states.map(s => [s.chunkId, s.state]));
  assert.strictEqual(byId['a'], 'fresh');
  assert.strictEqual(byId['b'], 'stale'); // a (upstream) tiene seq mayor
});

test('computeOutputStates: seq upstream menor que seq propio → b no es stale por seq', () => {
  const codeA = 'a = 1';
  const codeB = 'b = 2';
  const hashA = chunkHash(codeA);
  const hashB = chunkHash(codeB);
  const upB = chunkHash(chunkHash(codeA));

  const doc = [
    makeChunk('a', codeA),
    '',
    makeOutput('a', hashA, 'ra', { up: 'e3b0c442', seq: 2 }), // a seq=2
    '',
    makeChunk('b', codeB),
    '',
    makeOutput('b', hashB, 'rb', { up: upB, seq: 3 }),         // b seq=3 (ejecutado después de a)
    '',
  ].join('\n');

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 2);
  const byId = Object.fromEntries(states.map(s => [s.chunkId, s.state]));
  assert.strictEqual(byId['a'], 'fresh');
  assert.strictEqual(byId['b'], 'fresh'); // a.seq (2) no es > b.seq (3) → no stale
});

// ---------------------------------------------------------------------------
// Primer chunk: up correcto = chunkHash('') = 'e3b0c442'
// ---------------------------------------------------------------------------

test('computeOutputStates: primer chunk con up="e3b0c442" (hash de cadena vacía) → up correcto, no stale', () => {
  const code = 'x = 1';
  const hash = chunkHash(code);
  const doc = `${makeChunk('c1', code)}\n\n${makeOutput('c1', hash, 'result', { up: 'e3b0c442', seq: 1 })}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'fresh');
});

// ---------------------------------------------------------------------------
// Stale gana sobre error (nueva precedencia)
// ---------------------------------------------------------------------------

test('computeOutputStates: output de error con up incorrecto → stale (stale precede a error)', () => {
  const code = 'raise ValueError()';
  const hash = chunkHash(code);
  const errorContent = '# Error\nTraceback...\nValueError';
  // up incorrecto: correcto sería 'e3b0c442'
  const doc = `${makeChunk('c1', code)}\n\n${makeOutput('c1', hash, errorContent, { up: 'wrongup00', seq: 1 })}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'stale'); // stale gana sobre error
});

// ---------------------------------------------------------------------------
// Offsets
// ---------------------------------------------------------------------------

test('computeOutputStates: startOffset apunta al primer backtick del bloque output', () => {
  const code = 'x = 1';
  const hash = chunkHash(code);
  const chunkBlock = makeChunk('c1', code);
  const outputBlock = makeOutput('c1', hash, 'res');
  const doc = `${chunkBlock}\n\n${outputBlock}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  const { startOffset, endOffset } = states[0];
  // El segmento desde startOffset hasta endOffset arranca con ```output
  assert.ok(
    doc.slice(startOffset, endOffset).startsWith('```output'),
    `esperado que doc[${startOffset}:${endOffset}] empiece por \`\`\`output`
  );
});

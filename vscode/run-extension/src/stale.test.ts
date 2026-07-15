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

/** Construye un bloque output válido. */
function makeOutput(id: string, hash: string, content: string): string {
  return `\`\`\`output {#${id} hash=${hash}}\n${content}\n\`\`\``;
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
  const doc = `${makeChunk('c1', code)}\n\n${makeOutput('c1', hash, '1')}\n`;

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
  const doc = `${makeChunk('c1', code)}\n\n${makeOutput('c1', hash, errorContent)}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'error');
});

test('computeOutputStates: prefijo "# Error\\n" con hash diferente → error (error precede a stale)', () => {
  // El código fue editado después del error: el hash ya no coincide.
  // Error sigue teniendo precedencia sobre stale.
  const originalCode = 'raise ValueError("v1")';
  const editedCode = 'raise RuntimeError("v2")';
  const staleHash = chunkHash(originalCode); // hash del momento en que se guardó el error
  const errorContent = '# Error\nTraceback...\nValueError: v1';
  const doc = `${makeChunk('c1', editedCode)}\n\n${makeOutput('c1', staleHash, errorContent)}\n`;

  const states = computeOutputStates(doc);
  assert.strictEqual(states.length, 1);
  assert.strictEqual(states[0].state, 'error');
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

  const doc = [
    makeChunk('fresh', freshCode),
    '',
    makeOutput('fresh', freshHash, 'a'),
    '',
    makeChunk('stale', staleCurrentCode),
    '',
    makeOutput('stale', staleOldHash, 'b'),
    '',
    makeChunk('err', errorCode),
    '',
    makeOutput('err', errorHash, errorContent),
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
    makeOutput('c1', currentHash, 'a'), // hash coincide → fresh
    '',
    makeOutput('c1', oldHash, 'old'),   // hash obsoleto → stale
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

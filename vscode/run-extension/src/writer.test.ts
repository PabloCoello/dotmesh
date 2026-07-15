import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseChunks, parseOutputs } from './parser.ts';
import { chunkHash } from './hash.ts';
import {
  truncateOutput,
  buildOutputBlock,
  replaceOrInsertOutputBlock,
} from './writer.ts';

// ===========================================================================
// truncateOutput — casos base
// ===========================================================================

test('truncateOutput: por debajo del límite — devuelve todas las líneas sin marcador', () => {
  const result = truncateOutput(['a', 'b', 'c'], 5);
  assert.strictEqual(result, 'a\nb\nc');
});

test('truncateOutput: exactamente en el límite — sin marcador', () => {
  const result = truncateOutput(['a', 'b', 'c'], 3);
  assert.strictEqual(result, 'a\nb\nc');
});

test('truncateOutput: por encima del límite — añade marcador con N = límite', () => {
  const result = truncateOutput(['a', 'b', 'c', 'd', 'e'], 3);
  assert.strictEqual(result, 'a\nb\nc\n[... output truncado en 3 líneas]');
});

test('truncateOutput: límite 1 — solo primera línea más marcador si hay más', () => {
  const result = truncateOutput(['first', 'second'], 1);
  assert.strictEqual(result, 'first\n[... output truncado en 1 líneas]');
});

test('truncateOutput: lista vacía devuelve cadena vacía', () => {
  assert.strictEqual(truncateOutput([], 10), '');
});

test('truncateOutput: una sola línea dentro del límite devuelve esa línea', () => {
  assert.strictEqual(truncateOutput(['hello'], 50), 'hello');
});

// ===========================================================================
// truncateOutput — normalización de límites inválidos
// ===========================================================================

test('truncateOutput: NaN se normaliza a 50', () => {
  const lines = Array.from({ length: 60 }, (_, i) => `line${i}`);
  const result = truncateOutput(lines, NaN);
  // Con límite=50 habrá truncación
  const parts = result.split('\n');
  assert.strictEqual(parts[parts.length - 1], '[... output truncado en 50 líneas]');
});

test('truncateOutput: Infinity se normaliza a 50', () => {
  const lines = Array.from({ length: 60 }, (_, i) => `line${i}`);
  const result = truncateOutput(lines, Infinity);
  const parts = result.split('\n');
  assert.strictEqual(parts[parts.length - 1], '[... output truncado en 50 líneas]');
});

test('truncateOutput: -5 se normaliza a 50', () => {
  const lines = Array.from({ length: 60 }, (_, i) => `line${i}`);
  const result = truncateOutput(lines, -5);
  const parts = result.split('\n');
  assert.strictEqual(parts[parts.length - 1], '[... output truncado en 50 líneas]');
});

test('truncateOutput: 0 se normaliza a 50', () => {
  const lines = Array.from({ length: 60 }, (_, i) => `line${i}`);
  const result = truncateOutput(lines, 0);
  const parts = result.split('\n');
  assert.strictEqual(parts[parts.length - 1], '[... output truncado en 50 líneas]');
});

test('truncateOutput: -Infinity se normaliza a 50', () => {
  const lines = Array.from({ length: 60 }, (_, i) => `line${i}`);
  const result = truncateOutput(lines, -Infinity);
  const parts = result.split('\n');
  assert.strictEqual(parts[parts.length - 1], '[... output truncado en 50 líneas]');
});

test('truncateOutput: NaN con pocas líneas no añade marcador (50 es el límite real)', () => {
  const lines = ['only', 'three', 'lines'];
  assert.strictEqual(truncateOutput(lines, NaN), 'only\nthree\nlines');
});

// ===========================================================================
// buildOutputBlock
// ===========================================================================

test('buildOutputBlock: construye el bloque con la cabecera y el contenido correctos', () => {
  const block = buildOutputBlock('foo', 'abcd1234', 'hello world');
  assert.strictEqual(
    block,
    '```output {#foo hash=abcd1234}\nhello world\n```'
  );
});

test('buildOutputBlock: output con múltiples líneas', () => {
  const block = buildOutputBlock('bar', 'deadbeef', 'line1\nline2\nline3');
  assert.strictEqual(
    block,
    '```output {#bar hash=deadbeef}\nline1\nline2\nline3\n```'
  );
});

test('buildOutputBlock: output vacío genera bloque con cuerpo vacío', () => {
  const block = buildOutputBlock('baz', '00000000', '');
  assert.strictEqual(block, '```output {#baz hash=00000000}\n\n```');
});

// ===========================================================================
// replaceOrInsertOutputBlock — inserción sin output previo
// ===========================================================================

test('replaceOrInsertOutputBlock: inserta el bloque tras el chunk con línea en blanco', () => {
  // Chunk ocupa "```python {#foo}\ncode\n```", cierra en posición 25 (\n)
  const docText = '```python {#foo}\ncode\n```\nnext line\n';
  const chunks = parseChunks(docText);
  assert.strictEqual(chunks.length, 1);

  const block = buildOutputBlock('foo', 'abcd1234', 'result');
  const result = replaceOrInsertOutputBlock(docText, chunks[0], undefined, block);

  // El texto antes del punto de inserción no cambia
  const insertionPoint = chunks[0].endOffset + 1; // tras el \n de cierre
  assert.strictEqual(result.slice(0, insertionPoint), docText.slice(0, insertionPoint));

  // El bloque aparece en el resultado
  assert.ok(result.includes(block));

  // El texto después del bloque contiene lo que venía tras el chunk
  assert.ok(result.includes('next line'));
});

test('replaceOrInsertOutputBlock: inserción produce documento parseable', () => {
  const docText = '```python {#foo}\ncode\n```\n';
  const chunks = parseChunks(docText);

  const hash = chunkHash('code');
  const block = buildOutputBlock('foo', hash, 'result');
  const newDoc = replaceOrInsertOutputBlock(docText, chunks[0], undefined, block);

  const outputs = parseOutputs(newDoc);
  assert.strictEqual(outputs.length, 1);
  assert.strictEqual(outputs[0].chunkId, 'foo');
  assert.strictEqual(outputs[0].hash, hash);
  assert.strictEqual(outputs[0].content, 'result');
});

test('replaceOrInsertOutputBlock: inserción en EOF sin \\n final', () => {
  const docText = '```python {#foo}\ncode\n```';
  const chunks = parseChunks(docText);
  assert.strictEqual(chunks[0].endOffset, docText.length); // EOF sin \n

  const block = buildOutputBlock('foo', 'abcd1234', 'out');
  const result = replaceOrInsertOutputBlock(docText, chunks[0], undefined, block);

  // Empieza con el texto original
  assert.ok(result.startsWith(docText + '\n\n'));
  // Es parseable
  const outputs = parseOutputs(result);
  assert.strictEqual(outputs.length, 1);
  assert.strictEqual(outputs[0].content, 'out');
});

// ===========================================================================
// replaceOrInsertOutputBlock — reemplazo con output previo
// ===========================================================================

test('replaceOrInsertOutputBlock: reemplaza el bloque existente', () => {
  const docText = [
    '```python {#foo}',
    'code',
    '```',
    '',
    '```output {#foo hash=oldoldol}',
    'old result',
    '```',
    '',
    'rest',
  ].join('\n');

  const chunks = parseChunks(docText);
  const outputs = parseOutputs(docText);
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(outputs.length, 1);

  const newBlock = buildOutputBlock('foo', 'newnewne', 'new result');
  const result = replaceOrInsertOutputBlock(docText, chunks[0], outputs[0], newBlock);

  // El texto antes del bloque de salida no cambia
  assert.strictEqual(
    result.slice(0, outputs[0].startOffset),
    docText.slice(0, outputs[0].startOffset)
  );

  // El texto después del bloque no cambia
  assert.strictEqual(
    result.slice(outputs[0].startOffset + newBlock.length),
    docText.slice(outputs[0].endOffset)
  );

  // El nuevo bloque está en su lugar
  assert.strictEqual(
    result.slice(outputs[0].startOffset, outputs[0].startOffset + newBlock.length),
    newBlock
  );
});

test('replaceOrInsertOutputBlock: reemplazo — el texto "rest" al final no cambia', () => {
  const docText = [
    '```python {#foo}',
    'code',
    '```',
    '',
    '```output {#foo hash=oldoldol}',
    'old result',
    '```',
    'after block',
  ].join('\n');

  const chunks = parseChunks(docText);
  const outputs = parseOutputs(docText);

  const newBlock = buildOutputBlock('foo', 'newnewne', 'new');
  const result = replaceOrInsertOutputBlock(docText, chunks[0], outputs[0], newBlock);

  // El texto tras el offset de endOffset del output original no cambia
  const suffix = docText.slice(outputs[0].endOffset);
  assert.ok(result.endsWith(suffix));
});

// ===========================================================================
// Round-trip: buildOutputBlock → replaceOrInsertOutputBlock → parseOutputs
// ===========================================================================

test('round-trip: bloque insertado se vuelve a parsear con mismo hash y contenido', () => {
  const code = 'x = 42\nprint(x)';
  const outputText = '42';

  const docText = `\`\`\`python {#myid}\n${code}\n\`\`\`\n`;
  const chunks = parseChunks(docText);
  assert.strictEqual(chunks.length, 1);

  const hash = chunkHash(code);
  const block = buildOutputBlock('myid', hash, outputText);
  const newDoc = replaceOrInsertOutputBlock(docText, chunks[0], undefined, block);

  const outputs = parseOutputs(newDoc);
  assert.strictEqual(outputs.length, 1);
  assert.strictEqual(outputs[0].chunkId, 'myid');
  assert.strictEqual(outputs[0].hash, hash);
  assert.strictEqual(outputs[0].content, outputText);
});

test('round-trip: bloque reemplazado se vuelve a parsear con nuevo hash y contenido', () => {
  const code = 'y = 99';
  const docText = [
    '```python {#myid}',
    code,
    '```',
    '',
    '```output {#myid hash=staleold}',
    'stale output',
    '```',
    '',
  ].join('\n');

  const chunks = parseChunks(docText);
  const outputs = parseOutputs(docText);

  const hash = chunkHash(code);
  const block = buildOutputBlock('myid', hash, '99');
  const newDoc = replaceOrInsertOutputBlock(docText, chunks[0], outputs[0], block);

  const newOutputs = parseOutputs(newDoc);
  assert.strictEqual(newOutputs.length, 1);
  assert.strictEqual(newOutputs[0].hash, hash);
  assert.strictEqual(newOutputs[0].content, '99');
  // El chunk sigue presente y no cambió
  const newChunks = parseChunks(newDoc);
  assert.strictEqual(newChunks.length, 1);
  assert.strictEqual(newChunks[0].code, code);
});

test('round-trip: truncateOutput + buildOutputBlock → parseable', () => {
  const lines = Array.from({ length: 5 }, (_, i) => `line ${i}`);
  const output = truncateOutput(lines, 3);
  const block = buildOutputBlock('tr', 'aaaaaaaa', output);
  // El bloque de salida debe ser parseable
  const doc = block + '\n';
  const outputs = parseOutputs(doc);
  assert.strictEqual(outputs.length, 1);
  assert.strictEqual(outputs[0].content, output);
});

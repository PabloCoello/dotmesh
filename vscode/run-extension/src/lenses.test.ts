import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeLensSpecs, type LensSpec } from './lenses.ts';

// Helpers de filtrado para que cada aserción lea como especificación.
function byCommand(specs: LensSpec[], command: string): LensSpec[] {
  return specs.filter(s => s.command === command);
}

// ===========================================================================
// Documentos sin chunks
// ===========================================================================

test('computeLensSpecs: documento vacío devuelve []', () => {
  assert.deepStrictEqual(computeLensSpecs(''), []);
});

test('computeLensSpecs: solo prosa, sin lenses de documento ni de chunk', () => {
  assert.deepStrictEqual(computeLensSpecs('Título\n\nPárrafo sin código.'), []);
});

test('computeLensSpecs: bloque de código sin id de chunk no genera lenses', () => {
  assert.deepStrictEqual(computeLensSpecs('```python\nprint(1)\n```'), []);
});

// ===========================================================================
// Lenses de documento (una sola vez, en el offset 0)
// ===========================================================================

test('computeLensSpecs: con chunks, Ejecutar todo y Borrar todas las salidas aparecen una vez en el offset 0', () => {
  const text = [
    '```python {#a}',
    'print(1)',
    '```',
    '',
    '```python {#b}',
    'print(2)',
    '```',
  ].join('\n');

  const specs = computeLensSpecs(text);

  const runAll = byCommand(specs, 'mesh-run.runAll');
  assert.strictEqual(runAll.length, 1);
  assert.strictEqual(runAll[0].offset, 0);
  assert.strictEqual(runAll[0].title, '▶ Ejecutar todo');
  assert.strictEqual(runAll[0].arguments, undefined);

  const clearAll = byCommand(specs, 'mesh-run.clearOutputs');
  assert.strictEqual(clearAll.length, 1);
  assert.strictEqual(clearAll[0].offset, 0);
  assert.strictEqual(clearAll[0].title, '✕ Borrar todas las salidas');
  assert.strictEqual(clearAll[0].arguments, undefined);
});

// ===========================================================================
// Lenses por chunk
// ===========================================================================

test('computeLensSpecs: cada chunk tiene Ejecutar anclado a su startOffset con su id', () => {
  const text = [
    'Intro.',
    '',
    '```python {#a}',
    'print(1)',
    '```',
    '',
    '```python {#b}',
    'print(2)',
    '```',
  ].join('\n');

  const specs = computeLensSpecs(text);
  const run = byCommand(specs, 'mesh-run.runChunk');

  assert.strictEqual(run.length, 2);
  assert.deepStrictEqual(run[0].arguments, ['a']);
  assert.deepStrictEqual(run[1].arguments, ['b']);
  assert.strictEqual(run[0].title, '▶ Ejecutar');
  // El primer chunk empieza tras "Intro.\n\n" = 8 caracteres.
  assert.strictEqual(run[0].offset, 8);
  assert.strictEqual(run[1].offset, text.indexOf('```python {#b}'));
});

test('computeLensSpecs: Ejecutar hasta aquí aparece en todos los chunks menos el primero', () => {
  const text = [
    '```python {#a}',
    'print(1)',
    '```',
    '',
    '```python {#b}',
    'print(2)',
    '```',
    '',
    '```python {#c}',
    'print(3)',
    '```',
  ].join('\n');

  const specs = computeLensSpecs(text);
  const upTo = byCommand(specs, 'mesh-run.runUpTo');

  assert.strictEqual(upTo.length, 2);
  assert.deepStrictEqual(upTo[0].arguments, ['b']);
  assert.deepStrictEqual(upTo[1].arguments, ['c']);
  assert.strictEqual(upTo[0].title, '▶▶ Ejecutar hasta aquí');
  assert.strictEqual(upTo[0].offset, text.indexOf('```python {#b}'));
});

test('computeLensSpecs: Borrar salida solo aparece en chunks con bloque de salida', () => {
  const text = [
    '```python {#a}',
    'print(1)',
    '```',
    '',
    '```python {#b}',
    'print(2)',
    '```',
    '',
    '```output {#b hash=abc12345}',
    '2',
    '```',
  ].join('\n');

  const specs = computeLensSpecs(text);
  const clear = byCommand(specs, 'mesh-run.clearChunkOutput');

  assert.strictEqual(clear.length, 1);
  assert.deepStrictEqual(clear[0].arguments, ['b']);
  assert.strictEqual(clear[0].title, '✕ Borrar salida');
  // Anclado al chunk, no al bloque de salida.
  assert.strictEqual(clear[0].offset, text.indexOf('```python {#b}'));
});

// ===========================================================================
// Lens de reinicio de kernel (offset 0, solo con chunks)
// ===========================================================================

test('computeLensSpecs: con chunks, Reiniciar kernel aparece una vez en offset 0 sin argumentos', () => {
  const text = [
    '```python {#a}',
    'print(1)',
    '```',
  ].join('\n');

  const specs = computeLensSpecs(text);
  const restart = byCommand(specs, 'mesh-run.restartKernel');

  assert.strictEqual(restart.length, 1);
  assert.strictEqual(restart[0].offset, 0);
  assert.strictEqual(restart[0].title, '⟲ Reiniciar kernel');
  assert.strictEqual(restart[0].arguments, undefined);
});

test('computeLensSpecs: sin chunks, el lens de reinicio no aparece', () => {
  const specs = computeLensSpecs('Solo prosa, sin chunks.');
  assert.strictEqual(byCommand(specs, 'mesh-run.restartKernel').length, 0);
});

test('computeLensSpecs: un bloque de salida huérfano (sin chunk) no genera lenses', () => {
  const text = [
    '```python {#a}',
    'print(1)',
    '```',
    '',
    '```output {#fantasma hash=abc12345}',
    'residuo',
    '```',
  ].join('\n');

  const specs = computeLensSpecs(text);

  assert.strictEqual(byCommand(specs, 'mesh-run.clearChunkOutput').length, 0);
});

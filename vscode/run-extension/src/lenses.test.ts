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

test('computeLensSpecs: exactamente dos lenses de documento, sin lenses por chunk', () => {
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

  // Solo los dos lenses de documento
  assert.strictEqual(specs.length, 2);
  assert.ok(specs.every(s => s.offset === 0), 'todos los lenses deben estar en offset 0');

  // No hay lenses por chunk
  assert.strictEqual(byCommand(specs, 'mesh-run.runChunk').length, 0);
  assert.strictEqual(byCommand(specs, 'mesh-run.runUpTo').length, 0);
  assert.strictEqual(byCommand(specs, 'mesh-run.clearChunkOutput').length, 0);
});

test('computeLensSpecs: presencia de bloques de salida no genera lenses adicionales', () => {
  const text = [
    '```python {#a}',
    'print(1)',
    '```',
    '',
    '```output {#a hash=abc12345}',
    '1',
    '```',
  ].join('\n');

  const specs = computeLensSpecs(text);

  // Sigue siendo exactamente 2 lenses (el bloque de salida no suma)
  assert.strictEqual(specs.length, 2);
  assert.strictEqual(byCommand(specs, 'mesh-run.runAll').length, 1);
  assert.strictEqual(byCommand(specs, 'mesh-run.clearOutputs').length, 1);
});

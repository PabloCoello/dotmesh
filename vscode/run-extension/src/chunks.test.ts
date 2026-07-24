import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generateChunkId, resolveChunkInsertionOffset, resolveChunkLanguage } from './chunks.ts';

// ===========================================================================
// generateChunkId
// ===========================================================================

test('generateChunkId: sin IDs existentes devuelve chunk-1', () => {
  assert.strictEqual(generateChunkId([]), 'chunk-1');
});

test('generateChunkId: con chunk-1 devuelve chunk-2', () => {
  assert.strictEqual(generateChunkId(['chunk-1']), 'chunk-2');
});

test('generateChunkId: con chunk-1 y chunk-2 devuelve chunk-3', () => {
  assert.strictEqual(generateChunkId(['chunk-1', 'chunk-2']), 'chunk-3');
});

test('generateChunkId: rellena el hueco (chunk-1, chunk-3 → chunk-2)', () => {
  assert.strictEqual(generateChunkId(['chunk-1', 'chunk-3']), 'chunk-2');
});

test('generateChunkId: IDs sin patrón numérico no bloquean (devuelve chunk-1)', () => {
  assert.strictEqual(generateChunkId(['mi-chunk', 'otro']), 'chunk-1');
});

// ===========================================================================
// resolveChunkInsertionOffset
// ===========================================================================

// Texto de ayuda para los tests:
//   "primera línea\nsegunda línea\ntercera línea"
//    0123456789012 3 456789012345 6 789012345678
//    0            13              28

const TEXT = 'primera línea\nsegunda línea\ntercera línea';

test('resolveChunkInsertionOffset: cursor fuera de valla → posición del \\n que termina la línea del cursor', () => {
  // cursor en el medio de "primera línea" (offset 4)
  // el \n termina esa línea en offset 13
  const offset = resolveChunkInsertionOffset(TEXT, 4, []);
  assert.strictEqual(offset, TEXT.indexOf('\n'));
});

test('resolveChunkInsertionOffset: cursor fuera de valla en la última línea sin \\n → text.length', () => {
  const text = 'línea única';
  const offset = resolveChunkInsertionOffset(text, 3, []);
  assert.strictEqual(offset, text.length);
});

test('resolveChunkInsertionOffset: cursor dentro de valla → endOffset (el \\n tras el cierre)', () => {
  // Simula una valla de offset 5 a 20 (endOffset = posición del \n tras cierre)
  // cursorOffset = 10 (dentro de la valla)
  const text = '     ```python {#a}\ncode\n```\nresto';
  //            0     5                               28 29
  // fenceStart=5, fenceEnd apunta al \n tras ```=28
  const fenceEndOffset = text.indexOf('\n', text.indexOf('```\n', 10));
  const offset = resolveChunkInsertionOffset(text, 10, [
    { startOffset: 5, endOffset: fenceEndOffset },
  ]);
  // Insertar EN el \n (no después) conserva el salto tras la valla de cierre
  // del chunk nuevo; +1 la fusionaría con la línea siguiente («```resto»).
  assert.strictEqual(offset, fenceEndOffset);
});

test('resolveChunkInsertionOffset: cursor dentro de valla en EOF → text.length', () => {
  // endOffset === text.length (sin \n final tras el cierre de valla)
  const text = 'antes\n```python {#a}\ncode\n```';
  const endOffset = text.length; // sin \n al final
  const offset = resolveChunkInsertionOffset(text, 10, [
    { startOffset: 6, endOffset },
  ]);
  assert.strictEqual(offset, text.length);
});

test('resolveChunkInsertionOffset: cursor exactamente en startOffset → dentro de la valla', () => {
  // cursor sobre el primer backtick de la apertura
  const text = '```python {#a}\ncode\n```\nresto';
  const endOffset = text.indexOf('\nresto'); // \n tras la línea de cierre
  const offset = resolveChunkInsertionOffset(text, 0, [
    { startOffset: 0, endOffset },
  ]);
  assert.strictEqual(offset, endOffset);
});

// ===========================================================================
// resolveChunkLanguage
// ===========================================================================

test('resolveChunkLanguage: sin chunks devuelve null', () => {
  assert.strictEqual(resolveChunkLanguage([]), null);
});

test('resolveChunkLanguage: documento con un chunk python devuelve python', () => {
  assert.strictEqual(resolveChunkLanguage([{ language: 'python' }]), 'python');
});

test('resolveChunkLanguage: documento con un chunk r devuelve r', () => {
  assert.strictEqual(resolveChunkLanguage([{ language: 'r' }]), 'r');
});

test('resolveChunkLanguage: lenguaje se normaliza a minúsculas', () => {
  assert.strictEqual(resolveChunkLanguage([{ language: 'Python' }]), 'python');
  assert.strictEqual(resolveChunkLanguage([{ language: 'R' }]), 'r');
});

test('resolveChunkLanguage: varios chunks del mismo lenguaje devuelve ese lenguaje', () => {
  assert.strictEqual(
    resolveChunkLanguage([{ language: 'python' }, { language: 'python' }]),
    'python',
  );
});

test('resolveChunkLanguage: mezcla python/r devuelve el lenguaje del último chunk', () => {
  assert.strictEqual(
    resolveChunkLanguage([{ language: 'python' }, { language: 'r' }]),
    'r',
  );
  assert.strictEqual(
    resolveChunkLanguage([{ language: 'r' }, { language: 'python' }]),
    'python',
  );
});

test('resolveChunkLanguage: lenguaje fuera de whitelist (python3) devuelve null', () => {
  assert.strictEqual(resolveChunkLanguage([{ language: 'python3' }]), null);
});

test('resolveChunkLanguage: lenguaje fuera de whitelist (bash) devuelve null', () => {
  assert.strictEqual(resolveChunkLanguage([{ language: 'bash' }]), null);
});

test('resolveChunkLanguage: lenguaje vacío devuelve null', () => {
  assert.strictEqual(resolveChunkLanguage([{ language: '' }]), null);
});

test('resolveChunkLanguage: último chunk fuera de whitelist pero anterior en whitelist → null', () => {
  // El último chunk manda; si no está en la whitelist se pregunta.
  assert.strictEqual(
    resolveChunkLanguage([{ language: 'python' }, { language: 'bash' }]),
    null,
  );
});

test('resolveChunkInsertionOffset: cursor exactamente en endOffset → dentro de la valla', () => {
  // cursor sobre el \n que sigue a la línea de cierre (extremo incluido)
  const text = '```python {#a}\ncode\n```\nresto';
  const endOffset = text.indexOf('\nresto');
  const offset = resolveChunkInsertionOffset(text, endOffset, [
    { startOffset: 0, endOffset },
  ]);
  assert.strictEqual(offset, endOffset);
});

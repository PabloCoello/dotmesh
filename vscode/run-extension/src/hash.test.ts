import { test } from 'node:test';
import assert from 'node:assert/strict';

import { chunkHash } from './hash.ts';

// ===========================================================================
// Estabilidad del hash
// ===========================================================================

test('chunkHash: misma entrada produce siempre el mismo hash', () => {
  const code = 'x = 1\nprint(x)';
  assert.strictEqual(chunkHash(code), chunkHash(code));
});

test('chunkHash: resultado es exactamente 8 caracteres hex en minúsculas', () => {
  const hash = chunkHash('print("hello")');
  assert.match(hash, /^[0-9a-f]{8}$/);
});

test('chunkHash: código vacío tiene hash estable y longitud 8', () => {
  assert.strictEqual(chunkHash(''), chunkHash(''));
  assert.strictEqual(chunkHash('').length, 8);
});

// ===========================================================================
// Normalización — espacios y tabulaciones finales
// ===========================================================================

test('chunkHash: espacios finales en líneas no afectan al hash', () => {
  const clean = 'x = 1\ny = 2';
  const withTrailing = 'x = 1   \ny = 2\t';
  assert.strictEqual(chunkHash(clean), chunkHash(withTrailing));
});

test('chunkHash: líneas con solo espacios equivalen a líneas vacías', () => {
  const spaces = '   \n   \n';
  const empty = '\n\n';
  assert.strictEqual(chunkHash(spaces), chunkHash(empty));
});

test('chunkHash: tabs intercalados con código se conservan (solo se elimina al final)', () => {
  const withInternalTab = 'def f():\n\tpass';
  const withInternalTabTrailing = 'def f():\n\tpass\t';
  assert.strictEqual(chunkHash(withInternalTab), chunkHash(withInternalTabTrailing));
  // El tab interno distingue esta cadena de la versión sin él
  assert.notStrictEqual(chunkHash(withInternalTab), chunkHash('def f():\npass'));
});

// ===========================================================================
// Normalización — saltos de línea \r\n vs \n
// ===========================================================================

test('chunkHash: \\r\\n y \\n producen el mismo hash', () => {
  const crlf = 'line1\r\nline2\r\nline3';
  const lf = 'line1\nline2\nline3';
  assert.strictEqual(chunkHash(crlf), chunkHash(lf));
});

test('chunkHash: \\r\\n con espacios finales equivale a \\n limpio', () => {
  const crlfSpaces = 'a  \r\nb  \r\n';
  const lfClean = 'a\nb\n';
  assert.strictEqual(chunkHash(crlfSpaces), chunkHash(lfClean));
});

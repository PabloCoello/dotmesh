import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitOutputLines } from './lines.ts';

test('splitOutputLines: texto vacío devuelve []', () => {
  assert.deepStrictEqual(splitOutputLines(''), []);
});

test('splitOutputLines: línea única sin \\n final', () => {
  assert.deepStrictEqual(splitOutputLines('hello'), ['hello']);
});

test('splitOutputLines: \\n final único no genera línea vacía extra', () => {
  // print("hello") → "hello\n" debe dar ["hello"], no ["hello", ""]
  assert.deepStrictEqual(splitOutputLines('hello\n'), ['hello']);
});

test('splitOutputLines: \\n solo representa una línea vacía (print(""))', () => {
  // print("") produce "\n"; se elimina el terminador, queda una cadena vacía → [""]
  assert.deepStrictEqual(splitOutputLines('\n'), ['']);
});

test('splitOutputLines: múltiples líneas con \\n final', () => {
  assert.deepStrictEqual(splitOutputLines('a\nb\n'), ['a', 'b']);
});

test('splitOutputLines: múltiples líneas sin \\n final', () => {
  assert.deepStrictEqual(splitOutputLines('a\nb'), ['a', 'b']);
});

test('splitOutputLines: \\r\\n se normaliza igual que \\n', () => {
  assert.deepStrictEqual(splitOutputLines('hello\r\n'), ['hello']);
});

test('splitOutputLines: \\r\\n solo representa una línea vacía (normalizado)', () => {
  assert.deepStrictEqual(splitOutputLines('\r\n'), ['']);
});

test('splitOutputLines: mezcla de CRLF y LF', () => {
  assert.deepStrictEqual(splitOutputLines('a\r\nb\n'), ['a', 'b']);
});

test('splitOutputLines: saltos intermedios vacíos se preservan', () => {
  // "a\n\nb\n" → ["a", "", "b"]
  assert.deepStrictEqual(splitOutputLines('a\n\nb\n'), ['a', '', 'b']);
});

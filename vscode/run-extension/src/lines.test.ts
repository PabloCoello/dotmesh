import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitOutputLines, stripAnsi } from './lines.ts';

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

// ---------------------------------------------------------------------------
// stripAnsi
// ---------------------------------------------------------------------------

test('stripAnsi: texto sin secuencias queda intacto', () => {
  assert.strictEqual(stripAnsi('hello world'), 'hello world');
});

test('stripAnsi: texto vacío queda intacto', () => {
  assert.strictEqual(stripAnsi(''), '');
});

test('stripAnsi: secuencia CSI de color simple \\x1b[31m / \\x1b[39m', () => {
  assert.strictEqual(stripAnsi('\x1b[31mError\x1b[39m'), 'Error');
});

test('stripAnsi: parámetros múltiples separados por punto y coma (\\x1b[1;31m)', () => {
  assert.strictEqual(stripAnsi('\x1b[1;31mBold Red\x1b[0m'), 'Bold Red');
});

test('stripAnsi: reset sin parámetro (\\x1b[m)', () => {
  assert.strictEqual(stripAnsi('\x1b[mtext\x1b[m'), 'text');
});

test('stripAnsi: traceback real con \\x1b[36m / \\x1b[31m / \\x1b[39m', () => {
  const input =
    '\x1b[36mTraceback (most recent call last):\x1b[39m\n' +
    '  File "test.py", line 1, in <module>\n' +
    '\x1b[31mZeroDivisionError:\x1b[39m division by zero';
  const expected =
    'Traceback (most recent call last):\n' +
    '  File "test.py", line 1, in <module>\n' +
    'ZeroDivisionError: division by zero';
  assert.strictEqual(stripAnsi(input), expected);
});

test('stripAnsi: secuencias en líneas distintas (partidas entre línea y línea)', () => {
  // La secuencia de apertura (\x1b[31m) cae al final de la línea 1;
  // la de cierre (\x1b[39m) al principio de la línea 2.
  const input = 'antes\x1b[31m\nrojo\x1b[39m\ndespués';
  assert.strictEqual(stripAnsi(input), 'antes\nrojo\ndespués');
});

test('stripAnsi: múltiples secuencias consecutivas', () => {
  assert.strictEqual(stripAnsi('\x1b[1m\x1b[31mBold Red\x1b[0m\x1b[39m'), 'Bold Red');
});

test('stripAnsi: texto sin escapes no se modifica aunque haya newlines', () => {
  const text = 'línea 1\nlínea 2\nlínea 3';
  assert.strictEqual(stripAnsi(text), text);
});

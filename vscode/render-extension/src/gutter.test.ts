/**
 * Tests unitarios para gutterLines (gutter.ts).
 *
 * Módulo puro sin dependencias de vscode. Se ejecuta con:
 *   node --experimental-strip-types --test src/gutter.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gutterLines } from './gutter.ts';

// ---------------------------------------------------------------------------
// Documento sin contenido renderable
// ---------------------------------------------------------------------------

test('gutterLines: documento vacío devuelve []', () => {
  assert.deepStrictEqual(gutterLines([]), []);
});

test('gutterLines: documento sin fórmulas ni tablas devuelve []', () => {
  const lines = [
    'Texto normal.',
    'Otra línea sin contenido renderable.',
    'Y una tercera.',
  ];
  assert.deepStrictEqual(gutterLines(lines), []);
});

test('gutterLines: $ seguido de espacio (precio) no marca la línea', () => {
  const lines = ['El producto cuesta $ 10.'];
  assert.deepStrictEqual(gutterLines(lines), []);
});

// ---------------------------------------------------------------------------
// Fórmula inline $...$
// ---------------------------------------------------------------------------

test('gutterLines: línea con fórmula inline $...$ marca esa línea', () => {
  const lines = ['Texto con $\\pi r^2$ aquí.'];
  assert.deepStrictEqual(gutterLines(lines), [0]);
});

test('gutterLines: fórmula inline en línea 2 marca solo la línea 2', () => {
  const lines = [
    'Primera línea sin fórmula.',
    'Segunda también.',
    'Tercera con $E = mc^2$.',
  ];
  assert.deepStrictEqual(gutterLines(lines), [2]);
});

// ---------------------------------------------------------------------------
// Bloque $$...$$ single-line
// ---------------------------------------------------------------------------

test('gutterLines: bloque single-line $$ ... $$ marca solo esa línea', () => {
  const lines = ['Antes.', '$$E = mc^2$$', 'Después.'];
  assert.deepStrictEqual(gutterLines(lines), [1]);
});

// ---------------------------------------------------------------------------
// Bloque $$...$$ multilínea: solo la primera línea (valla de apertura)
// ---------------------------------------------------------------------------

test('gutterLines: bloque multilínea $$ ... $$ marca solo la valla de apertura', () => {
  const lines = [
    'Antes.',
    '$$',
    '\\int_0^1 f(x)\\,dx',
    '$$',
    'Después.',
  ];
  assert.deepStrictEqual(gutterLines(lines), [1]);
});

test('gutterLines: bloque multilínea con varias líneas de contenido marca solo la apertura', () => {
  const lines = [
    '$$',
    'a + b = c',
    'x^2 + y^2 = z^2',
    '$$',
  ];
  assert.deepStrictEqual(gutterLines(lines), [0]);
});

test('gutterLines: bloque multilínea — las líneas interiores y la valla de cierre no se marcan', () => {
  const lines = ['$$', 'f(x)', '$$'];
  const result = gutterLines(lines);
  assert.ok(!result.includes(1), 'La línea interior no debe marcarse');
  assert.ok(!result.includes(2), 'La valla de cierre no debe marcarse');
  assert.deepStrictEqual(result, [0]);
});

// ---------------------------------------------------------------------------
// Tabla GFM: solo la línea de cabecera
// ---------------------------------------------------------------------------

test('gutterLines: tabla GFM marca solo la línea de cabecera (índice 0)', () => {
  const lines = [
    '| A | B |',
    '| - | - |',
    '| 1 | 2 |',
    '| 3 | 4 |',
  ];
  assert.deepStrictEqual(gutterLines(lines), [0]);
});

test('gutterLines: tabla GFM — el separador y las filas de datos no se marcan', () => {
  const lines = [
    '| A | B |',
    '| - | - |',
    '| 1 | 2 |',
  ];
  const result = gutterLines(lines);
  assert.ok(!result.includes(1), 'El separador no debe marcarse');
  assert.ok(!result.includes(2), 'La fila de datos no debe marcarse');
  assert.deepStrictEqual(result, [0]);
});

test('gutterLines: tabla GFM mínima (cabecera + separador) marca la cabecera', () => {
  const lines = [
    '| Col A | Col B |',
    '| ----- | ----- |',
  ];
  assert.deepStrictEqual(gutterLines(lines), [0]);
});

test('gutterLines: tabla GFM embebida entre párrafos marca la cabecera en el índice correcto', () => {
  const lines = [
    'Párrafo anterior.',
    '| A | B |',
    '| - | - |',
    '| 1 | 2 |',
    'Párrafo posterior.',
  ];
  assert.deepStrictEqual(gutterLines(lines), [1]);
});

// ---------------------------------------------------------------------------
// Mezcla de contenido renderable
// ---------------------------------------------------------------------------

test('gutterLines: mezcla de inline, bloque multilínea y tabla devuelve los tres índices', () => {
  const lines = [
    'Sea $x^2$ la variable.',  // línea 0 — inline
    '| A | B |',               // línea 1 — tabla (cabecera)
    '| - | - |',
    '| 1 | 2 |',
    '$$',                      // línea 4 — bloque multilínea (apertura)
    'y = mx + b',
    '$$',
  ];
  assert.deepStrictEqual(gutterLines(lines), [0, 1, 4]);
});

test('gutterLines: dos tablas en el mismo documento marca las dos cabeceras', () => {
  const lines = [
    '| A | B |',  // línea 0 — primera tabla
    '| - | - |',
    '| 1 | 2 |',
    '',
    '| C | D |',  // línea 4 — segunda tabla
    '| - | - |',
    '| 3 | 4 |',
  ];
  assert.deepStrictEqual(gutterLines(lines), [0, 4]);
});

test('gutterLines: dos bloques $$ consecutivos marca las dos aperturas', () => {
  const lines = [
    '$$',        // línea 0 — primer bloque
    'a = b',
    '$$',
    'texto',
    '$$',        // línea 4 — segundo bloque
    'c = d',
    '$$',
  ];
  assert.deepStrictEqual(gutterLines(lines), [0, 4]);
});

/**
 * Tests unitarios para tableAtPosition (table.ts).
 *
 * Módulo puro sin dependencias de vscode. Se ejecuta con:
 *   node --experimental-strip-types --test src/table.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tableAtPosition } from './table.ts';

// ---------------------------------------------------------------------------
// Fixture: tabla GFM con cabecera, separador y dos filas de datos
// ---------------------------------------------------------------------------

const TABLE_LINES = [
  '| Columna A | Columna B |',
  '| --------- | --------- |',
  '| valor 1   | valor 2   |',
  '| valor 3   | valor 4   |',
];

// ---------------------------------------------------------------------------
// Cursor en la línea de cabecera
// ---------------------------------------------------------------------------

test('tableAtPosition: cursor en la cabecera devuelve el bloque completo', () => {
  const result = tableAtPosition(TABLE_LINES, 0, 0);
  assert.ok(result !== null, 'Debe devolver la tabla');
  assert.ok(result.includes('Columna A'), 'El resultado debe incluir la cabecera');
  assert.ok(result.includes('valor 3'), 'El resultado debe incluir todas las filas de datos');
});

// ---------------------------------------------------------------------------
// Cursor en la línea de separador
// ---------------------------------------------------------------------------

test('tableAtPosition: cursor en el separador devuelve el bloque completo', () => {
  const result = tableAtPosition(TABLE_LINES, 1, 0);
  assert.ok(result !== null, 'Debe devolver la tabla');
  assert.ok(result.includes('---------'), 'El resultado debe incluir el separador');
  assert.ok(result.includes('Columna A'), 'El resultado debe incluir la cabecera');
});

// ---------------------------------------------------------------------------
// Cursor en una línea de datos
// ---------------------------------------------------------------------------

test('tableAtPosition: cursor en la primera fila de datos devuelve el bloque', () => {
  const result = tableAtPosition(TABLE_LINES, 2, 5);
  assert.ok(result !== null, 'Debe devolver la tabla');
  assert.ok(result.includes('valor 1'), 'El resultado debe incluir la fila de datos');
});

test('tableAtPosition: cursor en la última fila de datos devuelve el bloque', () => {
  const result = tableAtPosition(TABLE_LINES, 3, 0);
  assert.ok(result !== null, 'Debe devolver la tabla');
  assert.ok(result.includes('valor 3'), 'El resultado debe incluir la última fila');
});

// ---------------------------------------------------------------------------
// Cursor fuera de tabla
// ---------------------------------------------------------------------------

test('tableAtPosition: cursor en línea sin pipe devuelve null', () => {
  const lines = ['Párrafo normal sin pipe.', ...TABLE_LINES, 'Otro párrafo.'];
  assert.strictEqual(tableAtPosition(lines, 0, 0), null);
  assert.strictEqual(tableAtPosition(lines, 5, 0), null);
});

test('tableAtPosition: línea única sin pipe devuelve null', () => {
  assert.strictEqual(tableAtPosition(['texto plano'], 0, 0), null);
});

// ---------------------------------------------------------------------------
// Tabla de una sola fila (cabecera + separador, sin filas de datos)
// ---------------------------------------------------------------------------

test('tableAtPosition: tabla mínima (cabecera + separador) devuelve bloque al posicionar en cabecera', () => {
  const minTable = [
    '| Col A | Col B |',
    '| ----- | ----- |',
  ];
  const result = tableAtPosition(minTable, 0, 0);
  assert.ok(result !== null, 'Debe devolver la tabla mínima');
  assert.ok(result.includes('Col A'));
});

test('tableAtPosition: tabla mínima devuelve bloque al posicionar en el separador', () => {
  const minTable = [
    '| Col A | Col B |',
    '| ----- | ----- |',
  ];
  const result = tableAtPosition(minTable, 1, 0);
  assert.ok(result !== null, 'Debe devolver la tabla al posicionarse en el separador');
  assert.ok(result.includes('Col A'));
});

// ---------------------------------------------------------------------------
// Líneas con pipe pero sin separador válido no se tratan como tabla
// ---------------------------------------------------------------------------

test('tableAtPosition: bloque con pipe pero sin separador GFM válido devuelve null', () => {
  const lines = [
    '| cabecera |',
    '| no es separador |',
  ];
  assert.strictEqual(tableAtPosition(lines, 0, 0), null);
  assert.strictEqual(tableAtPosition(lines, 1, 0), null);
});

// ---------------------------------------------------------------------------
// Separadores con alineación (colons)
// ---------------------------------------------------------------------------

test('tableAtPosition: separador con colons de alineación se reconoce como tabla', () => {
  const lines = [
    '| Izquierda | Centro | Derecha |',
    '| :-------- | :----: | ------: |',
    '| a         | b      | c       |',
  ];
  const result = tableAtPosition(lines, 0, 0);
  assert.ok(result !== null, 'Debe detectar tabla con separadores de alineación');
  assert.ok(result.includes('Izquierda'));
});

// ---------------------------------------------------------------------------
// Cursor fuera de rango
// ---------------------------------------------------------------------------

test('tableAtPosition: línea negativa devuelve null', () => {
  assert.strictEqual(tableAtPosition(TABLE_LINES, -1, 0), null);
});

test('tableAtPosition: línea mayor que el documento devuelve null', () => {
  assert.strictEqual(tableAtPosition(TABLE_LINES, 100, 0), null);
});

// ---------------------------------------------------------------------------
// Tabla embebida entre párrafos — caso positivo (BLOQUEANTE del review)
// El test anterior solo verifica que las líneas de párrafo devuelven null;
// estos tests comprueban que el cursor en cualquier línea DE la tabla
// devuelve el bloque completo aunque haya contenido alrededor.
// ---------------------------------------------------------------------------

test('tableAtPosition: tabla embebida — cursor en la cabecera devuelve el bloque', () => {
  const lines = ['Párrafo anterior.', ...TABLE_LINES, 'Párrafo posterior.'];
  // La tabla ocupa las líneas 1-4; la cabecera es la línea 1
  const result = tableAtPosition(lines, 1, 0);
  assert.ok(result !== null, 'Debe devolver la tabla, no null');
  assert.ok(result.includes('Columna A'), 'El bloque debe incluir la cabecera');
  assert.ok(result.includes('valor 3'), 'El bloque debe incluir todas las filas de datos');
});

test('tableAtPosition: tabla embebida — cursor en el separador devuelve el bloque', () => {
  const lines = ['Párrafo anterior.', ...TABLE_LINES, 'Párrafo posterior.'];
  // Separador es la línea 2
  const result = tableAtPosition(lines, 2, 0);
  assert.ok(result !== null, 'Debe devolver la tabla al posicionar en el separador');
  assert.ok(result.includes('Columna A'));
  assert.ok(result.includes('---------'));
});

test('tableAtPosition: tabla embebida — cursor en la primera fila de datos devuelve el bloque', () => {
  const lines = ['Párrafo anterior.', ...TABLE_LINES, 'Párrafo posterior.'];
  // Primera fila de datos es la línea 3
  const result = tableAtPosition(lines, 3, 0);
  assert.ok(result !== null, 'Debe devolver la tabla al posicionar en la primera fila de datos');
  assert.ok(result.includes('valor 1'));
});

test('tableAtPosition: tabla embebida — cursor en la última fila de datos devuelve el bloque', () => {
  const lines = ['Párrafo anterior.', ...TABLE_LINES, 'Párrafo posterior.'];
  // Última fila de datos es la línea 4
  const result = tableAtPosition(lines, 4, 0);
  assert.ok(result !== null, 'Debe devolver la tabla al posicionar en la última fila de datos');
  assert.ok(result.includes('valor 3'));
});

// ---------------------------------------------------------------------------
// Tabla al final del documento (sin línea posterior)
// Verifica que el escaneo del límite inferior no se pasa del final del array.
// ---------------------------------------------------------------------------

test('tableAtPosition: tabla al final del documento — cursor en la cabecera devuelve el bloque', () => {
  const lines = [
    'Párrafo inicial.',
    '| Col A | Col B |',
    '| ----- | ----- |',
    '| fila  | dato  |',
    // sin línea posterior
  ];
  const result = tableAtPosition(lines, 1, 0);
  assert.ok(result !== null, 'Debe devolver la tabla cuando está al final del documento');
  assert.ok(result.includes('Col A'));
  assert.ok(result.includes('fila'));
});

test('tableAtPosition: tabla al final del documento — cursor en el separador devuelve el bloque', () => {
  const lines = [
    'Párrafo inicial.',
    '| Col A | Col B |',
    '| ----- | ----- |',
    '| fila  | dato  |',
  ];
  const result = tableAtPosition(lines, 2, 0);
  assert.ok(result !== null);
  assert.ok(result.includes('Col A'));
});

test('tableAtPosition: tabla al final del documento — cursor en la fila de datos devuelve el bloque', () => {
  const lines = [
    'Párrafo inicial.',
    '| Col A | Col B |',
    '| ----- | ----- |',
    '| fila  | dato  |',
  ];
  const result = tableAtPosition(lines, 3, 0);
  assert.ok(result !== null, 'No debe desbordarse al escanear el límite inferior');
  assert.ok(result.includes('fila'));
});

// ---------------------------------------------------------------------------
// Separador sin espacios interiores
// |---|---| y |:--|:-:|--:| (alineación pegada, sin padding)
// ---------------------------------------------------------------------------

test('tableAtPosition: separador sin espacios |---|---| se reconoce como tabla', () => {
  const lines = [
    '| A | B |',
    '|---|---|',
    '| 1 | 2 |',
  ];
  const result = tableAtPosition(lines, 0, 0);
  assert.ok(result !== null, 'Debe reconocer |---|---| como separador válido');
  assert.ok(result.includes('A'));
  assert.ok(result.includes('1'));
});

test('tableAtPosition: cursor en separador sin espacios |---|---| devuelve bloque', () => {
  const lines = [
    '| A | B |',
    '|---|---|',
    '| 1 | 2 |',
  ];
  const result = tableAtPosition(lines, 1, 0);
  assert.ok(result !== null, 'Debe devolver la tabla al posicionarse en |---|---|');
});

test('tableAtPosition: separador de alineación pegado |:--|:-:|--:| se reconoce como tabla', () => {
  const lines = [
    '| Izquierda | Centro | Derecha |',
    '|:--|:-:|--:|',
    '| a | b | c |',
  ];
  const result = tableAtPosition(lines, 0, 0);
  assert.ok(result !== null, 'Debe reconocer |:--|:-:|--:| como separador de alineación válido');
  assert.ok(result.includes('Izquierda'));
});

test('tableAtPosition: cursor en separador de alineación pegado |:--|:-:|--:| devuelve bloque', () => {
  const lines = [
    '| Izquierda | Centro | Derecha |',
    '|:--|:-:|--:|',
    '| a | b | c |',
  ];
  const result = tableAtPosition(lines, 1, 0);
  assert.ok(result !== null, 'Debe devolver la tabla al posicionarse en |:--|:-:|--:|');
});

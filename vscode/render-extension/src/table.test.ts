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

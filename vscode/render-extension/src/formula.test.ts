/**
 * Tests unitarios para formulaAtPosition (formula.ts).
 *
 * Módulo puro sin dependencias de vscode. Se ejecuta con:
 *   node --experimental-strip-types --test src/formula.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formulaAtPosition } from './formula.ts';

// ---------------------------------------------------------------------------
// Inline válida
// ---------------------------------------------------------------------------

test('formulaAtPosition: inline válida devuelve { kind: inline, latex }', () => {
  const lines = ['El área $\\pi r^2$ del círculo.'];
  const result = formulaAtPosition(lines, 0, 10);
  assert.ok(result !== null, 'Debe detectar fórmula inline');
  assert.strictEqual(result.kind, 'inline');
  assert.strictEqual(result.latex, '\\pi r^2');
});

test('formulaAtPosition: cursor al inicio del delimitador $ inline devuelve resultado', () => {
  const lines = ['$a+b$'];
  const result = formulaAtPosition(lines, 0, 0);
  assert.ok(result !== null);
  assert.strictEqual(result.kind, 'inline');
  assert.strictEqual(result.latex, 'a+b');
});

// ---------------------------------------------------------------------------
// Falso positivo: $ seguido de espacio (precio)
// ---------------------------------------------------------------------------

test('formulaAtPosition: $ seguido de espacio devuelve null (precio)', () => {
  const lines = ['cuesta $ 10 por unidad'];
  assert.strictEqual(formulaAtPosition(lines, 0, 7), null);
});

test('formulaAtPosition: línea solo con $ devuelve null', () => {
  const lines = ['$'];
  assert.strictEqual(formulaAtPosition(lines, 0, 0), null);
});

// ---------------------------------------------------------------------------
// $$$$ → null (bloque con contenido vacío)
// ---------------------------------------------------------------------------

test('formulaAtPosition: $$$$ devuelve null (bloque sin contenido)', () => {
  const lines = ['$$$$'];
  assert.strictEqual(formulaAtPosition(lines, 0, 0), null);
});

test('formulaAtPosition: $$ $$ (con espacio) devuelve null (bloque vacío)', () => {
  const lines = ['$$  $$'];
  assert.strictEqual(formulaAtPosition(lines, 0, 0), null);
});

// ---------------------------------------------------------------------------
// Bloque de una sola línea
// ---------------------------------------------------------------------------

test('formulaAtPosition: bloque $$ ... $$ de una sola línea devuelve { kind: block }', () => {
  const lines = ['$$ E = mc^2 $$'];
  const result = formulaAtPosition(lines, 0, 5);
  assert.ok(result !== null, 'Debe detectar bloque single-line');
  assert.strictEqual(result.kind, 'block');
  assert.strictEqual(result.latex, 'E = mc^2');
});

// ---------------------------------------------------------------------------
// Bloque multilínea, cursor en línea intermedia
// ---------------------------------------------------------------------------

test('formulaAtPosition: bloque multilínea — cursor en línea de contenido', () => {
  const lines = ['$$', 'E = mc^2', '$$'];
  const result = formulaAtPosition(lines, 1, 0);
  assert.ok(result !== null, 'Debe detectar bloque multilínea');
  assert.strictEqual(result.kind, 'block');
  assert.ok(result.latex.includes('E = mc^2'));
});

test('formulaAtPosition: bloque multilínea de varias líneas — cursor en línea intermedia', () => {
  const lines = ['texto', '$$', 'a = b', 'c = d', '$$', 'más texto'];
  const result = formulaAtPosition(lines, 3, 0); // cursor en 'c = d'
  assert.ok(result !== null, 'Debe detectar bloque multilínea con cursor en interior');
  assert.strictEqual(result.kind, 'block');
  assert.ok(result.latex.includes('a = b'));
  assert.ok(result.latex.includes('c = d'));
});

// ---------------------------------------------------------------------------
// Cursor fuera de fórmula
// ---------------------------------------------------------------------------

test('formulaAtPosition: texto sin fórmula devuelve null', () => {
  const lines = ['Párrafo normal sin fórmulas'];
  assert.strictEqual(formulaAtPosition(lines, 0, 5), null);
});

test('formulaAtPosition: cursor antes de la fórmula devuelve null', () => {
  const lines = ['texto $a+b$ más texto'];
  // cursor at position 0 ('t') — before the formula
  assert.strictEqual(formulaAtPosition(lines, 0, 0), null);
});

test('formulaAtPosition: cursor después de la fórmula devuelve null', () => {
  const lines = ['$a+b$ más texto'];
  // cursor at position 10 — after the formula ($a+b$ ends at pos 5)
  assert.strictEqual(formulaAtPosition(lines, 0, 10), null);
});

// ---------------------------------------------------------------------------
// Inline sin cierre en la misma línea → null
// ---------------------------------------------------------------------------

test('formulaAtPosition: inline sin $ de cierre en la misma línea devuelve null', () => {
  const lines = ['$expresión sin cierre'];
  assert.strictEqual(formulaAtPosition(lines, 0, 0), null);
});

test('formulaAtPosition: inline abre en línea 0 y cursor en línea 1 devuelve null', () => {
  const lines = ['$expresión...', 'continuación'];
  // La fórmula no cierra en línea 0; cursor está en línea 1
  assert.strictEqual(formulaAtPosition(lines, 1, 0), null);
});

// ---------------------------------------------------------------------------
// Cursor en línea negativa o fuera de rango
// ---------------------------------------------------------------------------

test('formulaAtPosition: línea negativa devuelve null', () => {
  const lines = ['$a+b$'];
  assert.strictEqual(formulaAtPosition(lines, -1, 0), null);
});

test('formulaAtPosition: línea mayor que el documento devuelve null', () => {
  const lines = ['$a+b$'];
  assert.strictEqual(formulaAtPosition(lines, 100, 0), null);
});

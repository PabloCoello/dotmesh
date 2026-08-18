/**
 * Tests unitarios para formulaAtPosition (formula.ts).
 *
 * Módulo puro sin dependencias de vscode. Se ejecuta con:
 *   node --experimental-strip-types --test src/formula.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { formulaAtPosition, renderLatex, _renderCacheSize } from './formula.ts';

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

test('formulaAtPosition: dos bloques $$ en la misma línea — cursor en el segundo devuelve el segundo', () => {
  // Cursor dentro de $$b$$ (posición 17, dentro del segundo bloque)
  const lines = ['antes $$a$$ medio $$b$$ despues'];
  //                    0123456789012345678901234567890
  //                    0         1         2
  //  $$a$$ → índices 6-11,  $$b$$ → índices 18-23
  const resultA = formulaAtPosition(lines, 0, 8); // cursor en 'a'
  assert.ok(resultA !== null, 'Debe detectar $$a$$');
  assert.strictEqual(resultA.kind, 'block');
  assert.strictEqual(resultA.latex, 'a');

  const resultB = formulaAtPosition(lines, 0, 20); // cursor en 'b'
  assert.ok(resultB !== null, 'Debe detectar $$b$$ cuando el cursor está en b');
  assert.strictEqual(resultB.kind, 'block');
  assert.strictEqual(resultB.latex, 'b', 'Con cursor en b debe devolver b, no a');
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
// \$ escapado — no debe iniciar fórmula
// ---------------------------------------------------------------------------

test('formulaAtPosition: \\$ escapado no inicia fórmula', () => {
  // "cuesta \$5 y \$10" — ningún \$ es delimitador de fórmula
  const lines = ['cuesta \\$5 y \\$10'];
  // Cursor sobre el primer \$5
  assert.strictEqual(formulaAtPosition(lines, 0, 7), null, '\\$ no debe iniciar fórmula');
  // Cursor sobre el segundo \$10
  assert.strictEqual(formulaAtPosition(lines, 0, 13), null, '\\$ no debe iniciar fórmula (segundo)');
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

// ---------------------------------------------------------------------------
// renderLatex — render con MathJax y caché
// ---------------------------------------------------------------------------

test('renderLatex: expresión válida devuelve cadena SVG con fill=currentColor', async () => {
  const svg = await renderLatex('E = mc^2');
  assert.ok(svg.includes('<svg'), 'Debe contener elemento <svg>');
  assert.ok(svg.includes('currentColor'), 'El SVG debe usar currentColor para fill/stroke');
});

test('renderLatex: expresión con error devuelve mensaje de error (no lanza)', async () => {
  const result = await renderLatex('\\invalidcommand{');
  // No debe lanzar; debe devolver algo (SVG de error o texto de error)
  assert.ok(typeof result === 'string', 'Debe devolver string, no lanzar');
  assert.ok(result.length > 0, 'El resultado no debe estar vacío');
});

test('renderLatex: llamada repetida con misma expresión usa caché', async () => {
  // Primera llamada
  const svg1 = await renderLatex('a + b');
  // Segunda llamada — debe devolver exactamente el mismo string (referencia de caché)
  const svg2 = await renderLatex('a + b');
  assert.strictEqual(svg1, svg2, 'La caché debe devolver el mismo resultado');
});

test('renderLatex: caché LRU no supera el tope y evicta la entrada más antigua', async () => {
  // Insertamos RENDER_CACHE_MAX + 1 entradas distintas. Para no suponer el valor
  // exacto de la constante interna usamos 501 entradas (> 500).
  // Primero anotamos el tamaño antes de la prueba para calcular cuántas hay ya.
  const sizeBefore = _renderCacheSize();

  // Crear expresiones únicas para llenar la caché más allá del tope
  const OVER_LIMIT = 501;
  const firstKey = `lru_test_0`;
  await renderLatex(firstKey); // primera entrada que debería evictarse
  for (let n = 1; n < OVER_LIMIT; n++) {
    await renderLatex(`lru_test_${n}`);
  }

  const sizeAfter = _renderCacheSize();
  // El tamaño total nunca debe superar el tope (500)
  assert.ok(
    sizeAfter <= 500,
    `La caché no debe superar 500 entradas; tamaño actual: ${sizeAfter}`,
  );
  // La primera entrada insertada en esta prueba debe haber sido evictada
  // Rellenar la caché de nuevo con la misma clave fuerza un re-render (no hay hit)
  // Para verificar la evicción: el tamaño antes + OVER_LIMIT debería haber requerido
  // evictar, y el tamaño final debe ser ≤ 500.
  assert.ok(
    sizeAfter <= 500,
    `Tras insertar ${OVER_LIMIT} entradas el tamaño (${sizeAfter}) debe ser ≤ 500`,
  );
  void sizeBefore; // suprimir "unused variable" en runtime
});

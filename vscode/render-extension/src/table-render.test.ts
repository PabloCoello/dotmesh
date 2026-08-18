/**
 * Tests unitarios para renderTableMarkdown (table-render.ts).
 *
 * Se ejecuta con:
 *   node --experimental-strip-types --test src/table-render.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderTableMarkdown } from './table-render.ts';

// ---------------------------------------------------------------------------
// Helper: extrae el contenido de un data URI SVG o devuelve el string tal cual
// ---------------------------------------------------------------------------

function isDataUri(s: string): boolean {
  return s.startsWith('data:image/svg+xml;base64,');
}

function isImgMarkdown(s: string): boolean {
  return /!\[\]\(data:image\/svg\+xml;base64,/.test(s);
}

// ---------------------------------------------------------------------------
// Celda con una fórmula inline $...$
// ---------------------------------------------------------------------------

test('renderTableMarkdown: celda con una fórmula inline — la sustituye por imagen', async () => {
  const table = [
    '| Nombre | Fórmula      |',
    '| ------ | ------------ |',
    '| Área   | $\\pi r^2$   |',
  ].join('\n');

  const result = await renderTableMarkdown(table);
  // La fórmula debe haberse sustituido por una imagen data URI
  assert.ok(isImgMarkdown(result), 'Debe contener imagen data URI en la celda');
  // El resto de la tabla debe preservarse
  assert.ok(result.includes('Nombre'), 'Cabecera debe preservarse');
  assert.ok(result.includes('Área'), 'Contenido no-fórmula debe preservarse');
  // El LaTeX crudo ya no debe aparecer como texto
  assert.ok(!result.includes('$\\pi'), 'El LaTeX crudo no debe aparecer tras el render');
});

// ---------------------------------------------------------------------------
// Celda con varias fórmulas inline
// ---------------------------------------------------------------------------

test('renderTableMarkdown: celda con varias fórmulas — todas se sustituyen', async () => {
  const table = [
    '| Fórmulas               |',
    '| ---------------------- |',
    '| $a_i$ y $F^{\\text{ia}}$ |',
  ].join('\n');

  const result = await renderTableMarkdown(table);
  // Contar imágenes data URI en el resultado
  const matches = [...result.matchAll(/!\[\]\(data:image\/svg\+xml;base64,/g)];
  assert.ok(matches.length >= 2, `Debe haber al menos 2 imágenes, encontradas: ${matches.length}`);
});

// ---------------------------------------------------------------------------
// Celda sin fórmula — sin cambios
// ---------------------------------------------------------------------------

test('renderTableMarkdown: celda sin fórmula — la tabla no cambia', async () => {
  const table = [
    '| Columna A | Columna B |',
    '| --------- | --------- |',
    '| valor 1   | valor 2   |',
  ].join('\n');

  const result = await renderTableMarkdown(table);
  // Sin fórmulas, el resultado debe ser idéntico al original
  assert.strictEqual(result, table, 'Una tabla sin fórmulas no debe modificarse');
});

// ---------------------------------------------------------------------------
// Fórmula con error — incrusta el mensaje de error
// ---------------------------------------------------------------------------

test('renderTableMarkdown: fórmula con error — incrusta el mensaje de error', async () => {
  const table = [
    '| Expresión                |',
    '| ------------------------ |',
    '| $\\comandoInvalido{xyz}$ |',
  ].join('\n');

  const result = await renderTableMarkdown(table);
  // Debe contener el mensaje de error (no debe lanzar ni dejar la celda vacía)
  assert.ok(
    result.includes('LaTeX error:') || isImgMarkdown(result),
    'Debe incrustar el mensaje de error o una imagen de error de MathJax',
  );
});

// ---------------------------------------------------------------------------
// Tabla de ejemplo del usuario: $a_i$, $F^{\\text{ia}}$, $(1-f)$
// ---------------------------------------------------------------------------

test('renderTableMarkdown: tabla de ejemplo — $a_i$, $F^{text{ia}}$, $(1-f)$', async () => {
  const table = [
    '| Variable | Descripción           |',
    '| -------- | --------------------- |',
    '| $a_i$   | índice a sub i        |',
    '| $F^{\\text{ia}}$ | fuerza ia |',
    '| $(1-f)$  | fracción restante     |',
  ].join('\n');

  const result = await renderTableMarkdown(table);
  // Todas las celdas con fórmula deben tener imágenes
  const matches = [...result.matchAll(/!\[\]\(data:image\/svg\+xml;base64,/g)];
  assert.ok(
    matches.length >= 3,
    `Debe haber al menos 3 imágenes para las 3 fórmulas, encontradas: ${matches.length}`,
  );
  // El texto no-fórmula debe preservarse
  assert.ok(result.includes('Variable'), 'Cabecera debe preservarse');
  assert.ok(result.includes('índice a sub i'), 'Texto de celda sin fórmula debe preservarse');
});

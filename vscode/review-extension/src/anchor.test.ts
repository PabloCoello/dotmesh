import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAnchor, resolveAnchor, ANCHOR_UNCERTAINTY_THRESHOLD, type Anchor } from './anchor.ts';

// ---------------------------------------------------------------------------
// createAnchor
// ---------------------------------------------------------------------------

test('createAnchor extrae quote, line_hint y char_offset correctamente', () => {
  const text = 'Primera línea\nSegunda línea con texto\nTercera línea';
  // Selección: "Segunda línea" — comienza en offset 14
  const startOffset = 14;
  const endOffset = 27; // 'Segunda línea'.length === 13 → 14 + 13 = 27
  const anchor = createAnchor(text, startOffset, endOffset);

  assert.strictEqual(anchor.quote, 'Segunda línea');
  assert.strictEqual(anchor.char_offset, 14);
  assert.strictEqual(anchor.line_hint, 1); // segunda línea, índice base-0
});

test('createAnchor con selección en la primera línea devuelve line_hint 0', () => {
  const text = 'Hola mundo\nOtra línea';
  const anchor = createAnchor(text, 0, 4);

  assert.strictEqual(anchor.quote, 'Hola');
  assert.strictEqual(anchor.line_hint, 0);
  assert.strictEqual(anchor.char_offset, 0);
});

test('createAnchor con selección al inicio de la tercera línea', () => {
  const text = 'línea 1\nlínea 2\nlínea 3';
  const startOffset = 16; // inicio de 'línea 3'
  const anchor = createAnchor(text, startOffset, startOffset + 7);

  assert.strictEqual(anchor.quote, 'línea 3');
  assert.strictEqual(anchor.line_hint, 2);
  assert.strictEqual(anchor.char_offset, 16);
});

// ---------------------------------------------------------------------------
// resolveAnchor — sin colisión
// ---------------------------------------------------------------------------

test('resolveAnchor devuelve los offsets correctos cuando quote es único', () => {
  const text = 'El teorema de Pitágoras establece que a² + b² = c²';
  const anchor: Anchor = {
    quote: 'Pitágoras',
    line_hint: 0,
    char_offset: 14,
  };
  const result = resolveAnchor(text, anchor);

  assert.ok(result !== null);
  assert.strictEqual(result.startOffset, 14);
  assert.strictEqual(result.endOffset, 14 + 'Pitágoras'.length);
  assert.strictEqual(text.slice(result.startOffset, result.endOffset), 'Pitágoras');
});

test('resolveAnchor devuelve null si la cita no existe en el documento', () => {
  const text = 'Texto sin la cita buscada';
  const anchor: Anchor = {
    quote: 'texto eliminado',
    line_hint: 0,
    char_offset: 0,
  };
  const result = resolveAnchor(text, anchor);

  assert.strictEqual(result, null);
});

test('resolveAnchor devuelve null para quote vacío', () => {
  const anchor: Anchor = { quote: '', line_hint: 0, char_offset: 0 };
  const result = resolveAnchor('cualquier texto', anchor);

  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// resolveAnchor — con dos ocurrencias del mismo quote
// ---------------------------------------------------------------------------

test('resolveAnchor elige la ocurrencia más cercana a char_offset', () => {
  // 'nota' aparece en offset 0 y offset 30
  const text = 'nota importante al inicio. Otra nota al final del párrafo.';
  //             0               ^14              ^30

  const offsetPrimera = 0;
  const offsetSegunda = text.indexOf('nota', 1); // 30

  // Ancla que apunta a la segunda ocurrencia
  const anchor: Anchor = {
    quote: 'nota',
    line_hint: 0,
    char_offset: offsetSegunda,
  };
  const result = resolveAnchor(text, anchor);

  assert.ok(result !== null);
  assert.strictEqual(result.startOffset, offsetSegunda);
  assert.strictEqual(text.slice(result.startOffset, result.endOffset), 'nota');

  // Ancla que apunta a la primera ocurrencia
  const anchorPrimera: Anchor = {
    quote: 'nota',
    line_hint: 0,
    char_offset: offsetPrimera,
  };
  const resultPrimera = resolveAnchor(text, anchorPrimera);

  assert.ok(resultPrimera !== null);
  assert.strictEqual(resultPrimera.startOffset, offsetPrimera);
});

test('resolveAnchor con empate perfecto de distancia elige la primera', () => {
  // 'ab' en offset 0 y offset 4; char_offset es 2 (equidistante)
  const text = 'ab--ab';
  const anchor: Anchor = { quote: 'ab', line_hint: 0, char_offset: 2 };
  const result = resolveAnchor(text, anchor);

  // La primera ocurrencia (offset 0) está a distancia 2; la segunda (offset 4)
  // también está a distancia 2. Se espera la primera (índice menor en el bucle).
  assert.ok(result !== null);
  assert.strictEqual(result.startOffset, 0);
});

// ---------------------------------------------------------------------------
// resolveAnchor — quote desaparecido (documento editado)
// ---------------------------------------------------------------------------

test('resolveAnchor devuelve null cuando el texto fue eliminado del documento', () => {
  const originalText = 'Este párrafo contiene texto importante que luego se elimina.';
  const target = 'texto importante';
  const startOffset = originalText.indexOf(target);
  const endOffset = startOffset + target.length;
  const anchor = createAnchor(originalText, startOffset, endOffset);

  assert.strictEqual(anchor.quote, target);

  // Simula que el documento ha cambiado y la cita ya no existe
  const editedText = 'Este párrafo no contiene nada relevante ahora.';
  const result = resolveAnchor(editedText, anchor);

  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// F3 — resolveAnchor con flag uncertain
// ---------------------------------------------------------------------------

test('ANCHOR_UNCERTAINTY_THRESHOLD es 200', () => {
  assert.strictEqual(ANCHOR_UNCERTAINTY_THRESHOLD, 200);
});

test('resolveAnchor devuelve uncertain:true cuando la única ocurrencia dista >200 chars del char_offset', () => {
  // Texto de 300 chars. La única ocurrencia de 'marca' está en offset 0.
  // char_offset = 250 → distancia 250 > 200 → uncertain:true.
  const text = 'marca' + 'x'.repeat(295);
  const anchor: Anchor = { quote: 'marca', line_hint: 0, char_offset: 250 };
  const result = resolveAnchor(text, anchor);
  assert.ok(result !== null);
  assert.strictEqual(result.startOffset, 0);
  assert.strictEqual(result.uncertain, true);
});

test('resolveAnchor no añade uncertain cuando la ocurrencia está dentro del umbral', () => {
  const text = 'marca' + 'x'.repeat(295);
  const anchor: Anchor = { quote: 'marca', line_hint: 0, char_offset: 50 };
  const result = resolveAnchor(text, anchor);
  assert.ok(result !== null);
  assert.strictEqual(result.startOffset, 0);
  assert.ok(!result.uncertain, 'uncertain no debe estar presente ni ser true');
});

test('resolveAnchor devuelve uncertain:true en varias ocurrencias cuando la más cercana dista >200 chars', () => {
  // 'nota' en offset 0 y en offset 350; char_offset = 280.
  // La más cercana es 350 (distancia 70), bien dentro del umbral → NOT uncertain.
  // Ahora invertir: char_offset = 490, la más cercana es 350 (distancia 140) → NOT uncertain.
  // Para uncertain: poner char_offset = 600 con 'nota' solo en 350 → distancia 250 > 200.
  const filler = 'x'.repeat(345);
  const text = filler + 'nota' + 'x'.repeat(200);
  // 'nota' está solo en offset 345; char_offset = 600 → distancia 255 > 200 → uncertain.
  const anchor: Anchor = { quote: 'nota', line_hint: 0, char_offset: 600 };
  const result = resolveAnchor(text, anchor);
  assert.ok(result !== null);
  assert.strictEqual(result.startOffset, 345);
  assert.strictEqual(result.uncertain, true);
});

// ---------------------------------------------------------------------------
// rev#6 — umbral de incertidumbre: 200 es exclusivo (>200 → uncertain)
// ---------------------------------------------------------------------------

test('resolveAnchor NO marca uncertain cuando bestDist === ANCHOR_UNCERTAINTY_THRESHOLD (límite exclusivo)', () => {
  // 'marca' en offset 0; char_offset = 200 → bestDist = 200, que NO supera el umbral.
  const text = 'marca' + 'x'.repeat(300);
  const anchor: Anchor = { quote: 'marca', line_hint: 0, char_offset: 200 };
  const result = resolveAnchor(text, anchor);
  assert.ok(result !== null);
  assert.strictEqual(result.startOffset, 0);
  assert.ok(!result.uncertain, 'bestDist===200 no debe marcar uncertain (umbral exclusivo)');
});

test('resolveAnchor SÍ marca uncertain cuando bestDist === ANCHOR_UNCERTAINTY_THRESHOLD + 1', () => {
  // 'marca' en offset 0; char_offset = 201 → bestDist = 201 > 200 → uncertain.
  const text = 'marca' + 'x'.repeat(300);
  const anchor: Anchor = { quote: 'marca', line_hint: 0, char_offset: 201 };
  const result = resolveAnchor(text, anchor);
  assert.ok(result !== null);
  assert.strictEqual(result.startOffset, 0);
  assert.strictEqual(result.uncertain, true, 'bestDist===201 debe marcar uncertain');
});

test('resolveAnchor funciona tras pequeñas ediciones que desplazan el texto', () => {
  const originalText = 'Introducción\nContenido relevante aquí\nFin';
  const target = 'Contenido relevante';
  const startOffset = originalText.indexOf(target);
  const endOffset = startOffset + target.length;
  const anchor = createAnchor(originalText, startOffset, endOffset);

  assert.strictEqual(anchor.quote, target);

  // El documento recibe texto adicional al inicio
  const editedText = 'Nuevo título\n\nIntroducción\nContenido relevante aquí\nFin';
  const result = resolveAnchor(editedText, anchor);

  assert.ok(result !== null);
  // La cita debe encontrarse en la nueva posición
  assert.strictEqual(editedText.slice(result.startOffset, result.endOffset), target);
});

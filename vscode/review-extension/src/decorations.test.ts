/**
 * Tests unitarios para las funciones puras de decorations-utils.ts.
 *
 * Las funciones con API de VS Code (applyDecorations, getDecorationTypes,
 * disposeDecorationTypes) viven en decorations.ts y se verifican de forma
 * manual en el walkthrough final. Aquí se cubre la lógica pura:
 *   - buildLabelText:    formato de la etiqueta «● tipo» o «● tipo·agente»
 *   - typeColor:         mapeo tipo → hex dotmesh
 *   - formatTimestamp:   formato de fecha legible con Intl.DateTimeFormat
 *   - buildHoverMessage: estructura del mensaje de hover con HTML saneado
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLabelText,
  typeColor,
  formatTimestamp,
  buildHoverMessage,
  TYPE_COLORS,
} from './decorations-utils.ts';

// ---------------------------------------------------------------------------
// buildLabelText — sin agente
// ---------------------------------------------------------------------------

test('buildLabelText produce «● tipo» cuando no hay agente', () => {
  assert.strictEqual(
    buildLabelText({ type: 'pregunta' }),
    '● pregunta'
  );
});

test('buildLabelText produce «● tipo» para cada tipo reconocido sin agente', () => {
  const tipos = ['edita', 'sugerencia', 'pregunta', 'verifica', 'nota'] as const;
  for (const tipo of tipos) {
    const label = buildLabelText({ type: tipo });
    assert.strictEqual(label, `● ${tipo}`, `Fallo para tipo: ${tipo}`);
  }
});

test('buildLabelText empieza siempre con el bullet ●', () => {
  const label = buildLabelText({ type: 'edita' });
  assert.ok(label.startsWith('●'), `Debe empezar con ●, obtenido: ${label}`);
});

// ---------------------------------------------------------------------------
// buildLabelText — con agente
// ---------------------------------------------------------------------------

test('buildLabelText produce «● tipo·agente» cuando agent existe', () => {
  assert.strictEqual(
    buildLabelText({ type: 'verifica', agent: 'review' }),
    '● verifica·review'
  );
});

test('buildLabelText usa «·» como separador entre tipo y agente', () => {
  const label = buildLabelText({ type: 'edita', agent: 'build' });
  assert.ok(label.includes('·'), `Debe contener ·, obtenido: ${label}`);
});

test('buildLabelText incluye el nombre del agente exactamente', () => {
  const label = buildLabelText({ type: 'sugerencia', agent: 'maths' });
  assert.ok(label.includes('maths'), `Debe incluir el agente, obtenido: ${label}`);
});

test('buildLabelText con agent undefined equivale a sin agente', () => {
  assert.strictEqual(
    buildLabelText({ type: 'nota', agent: undefined }),
    '● nota'
  );
});

// ---------------------------------------------------------------------------
// typeColor
// ---------------------------------------------------------------------------

test('typeColor devuelve rose #E59A9A para edita', () => {
  assert.strictEqual(typeColor('edita'), '#E59A9A');
});

test('typeColor devuelve gold #E3C58A para sugerencia', () => {
  assert.strictEqual(typeColor('sugerencia'), '#E3C58A');
});

test('typeColor devuelve blue #8FB4E3 para pregunta', () => {
  assert.strictEqual(typeColor('pregunta'), '#8FB4E3');
});

test('typeColor devuelve peach #FFAA7A para verifica', () => {
  assert.strictEqual(typeColor('verifica'), '#FFAA7A');
});

test('typeColor devuelve teal #6CB6B0 para nota', () => {
  assert.strictEqual(typeColor('nota'), '#6CB6B0');
});

test('typeColor coincide con la constante TYPE_COLORS para cada valor', () => {
  for (const [k, v] of Object.entries(TYPE_COLORS)) {
    assert.strictEqual(typeColor(k), v, `Fallo para tipo: ${k}`);
  }
});

test('typeColor devuelve un hex de fallback para tipo desconocido', () => {
  const color = typeColor('desconocido');
  assert.ok(color.startsWith('#'), `Debe ser un hex, obtenido: ${color}`);
  assert.ok(color.length >= 4, `Hex demasiado corto: ${color}`);
});

test('typeColor no devuelve cadena vacía para ningún tipo conocido', () => {
  for (const tipo of ['edita', 'sugerencia', 'pregunta', 'verifica', 'nota']) {
    assert.ok(typeColor(tipo).length > 0, `Cadena vacía para tipo: ${tipo}`);
  }
});

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------

test('formatTimestamp produce formato legible en es-ES con timeZone UTC', () => {
  // '2026-07-09T10:00:00Z' en es-ES con UTC → '9 jul 2026, 10:00'
  const result = formatTimestamp('2026-07-09T10:00:00Z', 'es-ES', 'UTC');
  // Verifica que contiene el año y fragmento de la hora sin ISO cruda
  assert.ok(result.includes('2026'), `Debe incluir el año, obtenido: ${result}`);
  assert.ok(result.includes('10:00'), `Debe incluir la hora, obtenido: ${result}`);
  assert.ok(!result.includes('T'), `No debe contener la T de ISO, obtenido: ${result}`);
  assert.ok(!result.includes('Z'), `No debe contener la Z de ISO, obtenido: ${result}`);
});

test('formatTimestamp es determinista con la misma zona horaria', () => {
  const a = formatTimestamp('2026-07-09T10:00:00Z', 'es-ES', 'UTC');
  const b = formatTimestamp('2026-07-09T10:00:00Z', 'es-ES', 'UTC');
  assert.strictEqual(a, b);
});

test('formatTimestamp devuelve la cadena original para fecha inválida', () => {
  const invalid = 'no-es-una-fecha';
  assert.strictEqual(formatTimestamp(invalid), invalid);
});

test('formatTimestamp devuelve cadena diferente para fechas distintas', () => {
  const a = formatTimestamp('2026-07-09T10:00:00Z', 'es-ES', 'UTC');
  const b = formatTimestamp('2025-01-15T08:30:00Z', 'es-ES', 'UTC');
  assert.notStrictEqual(a, b);
});

test('formatTimestamp usa la zona horaria indicada para ajustar la hora', () => {
  // 2026-07-09T22:00:00Z en UTC es 00:00 del 2026-07-10 en Europe/Madrid (+2 en verano)
  const utc  = formatTimestamp('2026-07-09T22:00:00Z', 'es-ES', 'UTC');
  const mad  = formatTimestamp('2026-07-09T22:00:00Z', 'es-ES', 'Europe/Madrid');
  // El resultado debe diferir (una muestra el 9 jul 22:00, la otra el 10 jul 00:00)
  assert.notStrictEqual(utc, mad, 'Las zonas horarias distintas deben dar fechas diferentes');
});

// ---------------------------------------------------------------------------
// buildHoverMessage — sin agente
// ---------------------------------------------------------------------------

test('buildHoverMessage incluye el tipo en la salida', () => {
  const msg = buildHoverMessage({
    type: 'pregunta',
    body: 'Cuerpo del comentario',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(msg.includes('pregunta'), `El hover debe incluir el tipo, obtenido:\n${msg}`);
});

test('buildHoverMessage no incluye la prioridad', () => {
  const msg = buildHoverMessage({
    type: 'sugerencia',
    body: 'Texto',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(!msg.includes('Prioridad'), `El hover no debe incluir Prioridad, obtenido:\n${msg}`);
});

test('buildHoverMessage incluye el body completo', () => {
  const body = '¿Este teorema requiere que el espacio sea compacto?';
  const msg = buildHoverMessage({
    type: 'pregunta',
    body,
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(msg.includes(body), `El hover debe incluir el body, obtenido:\n${msg}`);
});

test('buildHoverMessage incluye el timestamp created_at', () => {
  const ts = '2026-07-09T14:30:00Z';
  const msg = buildHoverMessage({
    type: 'nota',
    body: 'Nota breve',
    created_at: ts,
  });
  assert.ok(msg.includes(ts), `El hover debe incluir el timestamp, obtenido:\n${msg}`);
});

test('buildHoverMessage devuelve una cadena no vacía', () => {
  const msg = buildHoverMessage({
    type: 'edita',
    body: 'Corrección de redacción.',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(msg.length > 0);
});

test('buildHoverMessage body aparece después del encabezado de metadatos', () => {
  const body = 'contenido único de prueba';
  const msg = buildHoverMessage({
    type: 'nota',
    body,
    created_at: '2026-07-09T10:00:00Z',
  });
  const bodyIndex = msg.indexOf(body);
  const tipoIndex = msg.indexOf('nota');
  assert.ok(bodyIndex > tipoIndex, 'El body debe aparecer tras los metadatos de tipo');
});

// ---------------------------------------------------------------------------
// buildHoverMessage — con agente
// ---------------------------------------------------------------------------

test('buildHoverMessage incluye la fila Agente cuando agent existe', () => {
  const msg = buildHoverMessage({
    type: 'verifica',
    agent: 'review',
    body: 'Comprueba la cifra',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(msg.includes('Agente'), `Debe incluir la fila Agente, obtenido:\n${msg}`);
  assert.ok(msg.includes('review'), `Debe incluir el nombre del agente, obtenido:\n${msg}`);
});

test('buildHoverMessage no incluye la fila Agente cuando agent es undefined', () => {
  const msg = buildHoverMessage({
    type: 'sugerencia',
    agent: undefined,
    body: 'Una sugerencia',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(!msg.includes('Agente'), `No debe incluir la fila Agente, obtenido:\n${msg}`);
});

test('buildHoverMessage agente aparece entre tipo y created_at', () => {
  const msg = buildHoverMessage({
    type: 'verifica',
    agent: 'security',
    body: 'texto',
    created_at: '2026-07-09T10:00:00Z',
  });
  const tipoIdx  = msg.indexOf('verifica');
  const agenteIdx = msg.indexOf('security');
  const fechaIdx  = msg.indexOf('2026-07-09');
  assert.ok(tipoIdx < agenteIdx, 'El agente debe aparecer después del tipo');
  assert.ok(agenteIdx < fechaIdx, 'El agente debe aparecer antes de la fecha');
});

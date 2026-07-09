/**
 * Tests unitarios para las funciones puras de decorations-utils.ts.
 *
 * Las funciones con API de VS Code (applyDecorations, getDecorationTypes,
 * disposeDecorationTypes) viven en decorations.ts y se verifican de forma
 * manual en el walkthrough final. Aquí se cubre la lógica pura:
 *   - buildLabelText:    formato de la etiqueta «● tipo·prioridad»
 *   - priorityColor:     mapeo prioridad → hex dotmesh
 *   - buildHoverMessage: estructura del mensaje de hover
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLabelText,
  priorityColor,
  buildHoverMessage,
  PRIORITY_COLORS,
} from './decorations-utils.ts';

// ---------------------------------------------------------------------------
// buildLabelText
// ---------------------------------------------------------------------------

test('buildLabelText produce «● tipo·prioridad» para pregunta alta', () => {
  assert.strictEqual(
    buildLabelText({ type: 'pregunta', priority: 'alta' }),
    '● pregunta·alta'
  );
});

test('buildLabelText produce «● tipo·prioridad» para sugerencia media', () => {
  assert.strictEqual(
    buildLabelText({ type: 'sugerencia', priority: 'media' }),
    '● sugerencia·media'
  );
});

test('buildLabelText produce «● tipo·prioridad» para edita baja', () => {
  assert.strictEqual(
    buildLabelText({ type: 'edita', priority: 'baja' }),
    '● edita·baja'
  );
});

test('buildLabelText funciona con tipo comentario', () => {
  assert.strictEqual(
    buildLabelText({ type: 'comentario', priority: 'media' }),
    '● comentario·media'
  );
});

test('buildLabelText empieza siempre con el bullet ●', () => {
  const label = buildLabelText({ type: 'pregunta', priority: 'alta' });
  assert.ok(label.startsWith('●'), `Debe empezar con ●, obtenido: ${label}`);
});

test('buildLabelText usa «·» como separador entre tipo y prioridad', () => {
  const label = buildLabelText({ type: 'edita', priority: 'media' });
  assert.ok(label.includes('·'), `Debe contener ·, obtenido: ${label}`);
});

// ---------------------------------------------------------------------------
// priorityColor
// ---------------------------------------------------------------------------

test('priorityColor devuelve rose #E59A9A para alta', () => {
  assert.strictEqual(priorityColor('alta'), '#E59A9A');
});

test('priorityColor devuelve gold #E3C58A para media', () => {
  assert.strictEqual(priorityColor('media'), '#E3C58A');
});

test('priorityColor devuelve teal #6CB6B0 para baja', () => {
  assert.strictEqual(priorityColor('baja'), '#6CB6B0');
});

test('priorityColor coincide con la constante PRIORITY_COLORS para cada valor', () => {
  for (const [k, v] of Object.entries(PRIORITY_COLORS)) {
    assert.strictEqual(priorityColor(k), v, `Fallo para prioridad: ${k}`);
  }
});

test('priorityColor devuelve un hex de fallback para prioridad desconocida', () => {
  const color = priorityColor('desconocida');
  assert.ok(color.startsWith('#'), `Debe ser un hex, obtenido: ${color}`);
  assert.ok(color.length >= 4, `Hex demasiado corto: ${color}`);
});

test('priorityColor no devuelve cadena vacía para ninguna prioridad conocida', () => {
  assert.ok(priorityColor('alta').length > 0);
  assert.ok(priorityColor('media').length > 0);
  assert.ok(priorityColor('baja').length > 0);
});

// ---------------------------------------------------------------------------
// buildHoverMessage
// ---------------------------------------------------------------------------

test('buildHoverMessage incluye el tipo en la salida', () => {
  const msg = buildHoverMessage({
    type: 'pregunta',
    priority: 'alta',
    body: 'Cuerpo del comentario',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(msg.includes('pregunta'), `El hover debe incluir el tipo, obtenido:\n${msg}`);
});

test('buildHoverMessage incluye la prioridad en la salida', () => {
  const msg = buildHoverMessage({
    type: 'sugerencia',
    priority: 'media',
    body: 'Texto',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(msg.includes('media'), `El hover debe incluir la prioridad, obtenido:\n${msg}`);
});

test('buildHoverMessage incluye el body completo', () => {
  const body = '¿Este teorema requiere que el espacio sea compacto?';
  const msg = buildHoverMessage({
    type: 'pregunta',
    priority: 'alta',
    body,
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(msg.includes(body), `El hover debe incluir el body, obtenido:\n${msg}`);
});

test('buildHoverMessage incluye el timestamp created_at', () => {
  const ts = '2026-07-09T14:30:00Z';
  const msg = buildHoverMessage({
    type: 'comentario',
    priority: 'baja',
    body: 'Nota breve',
    created_at: ts,
  });
  assert.ok(msg.includes(ts), `El hover debe incluir el timestamp, obtenido:\n${msg}`);
});

test('buildHoverMessage devuelve una cadena no vacía', () => {
  const msg = buildHoverMessage({
    type: 'edita',
    priority: 'media',
    body: 'Corrección de redacción.',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(msg.length > 0);
});

test('buildHoverMessage body aparece después del encabezado de metadatos', () => {
  const body = 'contenido único de prueba';
  const msg = buildHoverMessage({
    type: 'comentario',
    priority: 'alta',
    body,
    created_at: '2026-07-09T10:00:00Z',
  });
  const bodyIndex = msg.indexOf(body);
  const tipoIndex = msg.indexOf('comentario');
  assert.ok(bodyIndex > tipoIndex, 'El body debe aparecer tras los metadatos de tipo');
});

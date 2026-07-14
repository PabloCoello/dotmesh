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
  hexToRgba,
  formatTimestamp,
  escapeHtml,
  buildHoverMessage,
  TYPE_COLORS,
  FALLBACK_COLOR,
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
// buildHoverMessage — estructura de cabecera y separador
// ---------------------------------------------------------------------------

test('buildHoverMessage contiene span con el color del tipo en la cabecera', () => {
  const msg = buildHoverMessage({
    type: 'edita',
    body: 'texto',
    created_at: '2026-07-09T10:00:00Z',
  });
  // El span debe usar el color de 'edita' (rose #E59A9A) con ; obligatorio
  assert.ok(
    msg.includes('<span style="color:#E59A9A;">'),
    `Debe contener span con color de edita, obtenido:\n${msg}`
  );
});

test('buildHoverMessage contiene span con el color correcto para cada tipo', () => {
  const pares: Array<[string, string]> = [
    ['edita',      '#E59A9A'],
    ['sugerencia', '#E3C58A'],
    ['pregunta',   '#8FB4E3'],
    ['verifica',   '#FFAA7A'],
    ['nota',       '#6CB6B0'],
  ];
  for (const [tipo, color] of pares) {
    const msg = buildHoverMessage({ type: tipo as any, body: 'x', created_at: '2026-07-09T10:00:00Z' });
    assert.ok(
      msg.includes(`<span style="color:${color};">`),
      `Tipo ${tipo}: debe contener span con ${color}, obtenido:\n${msg}`
    );
  }
});

test('buildHoverMessage contiene el separador de 40 caracteres ─', () => {
  const msg = buildHoverMessage({
    type: 'sugerencia',
    body: 'texto',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(msg.includes('─'.repeat(40)), `Debe contener 40 guiones ─, obtenido:\n${msg}`);
});

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

test('buildHoverMessage muestra la fecha en formato legible sin ISO cruda', () => {
  const iso = '2026-07-09T14:30:00Z';
  const msg = buildHoverMessage({ type: 'nota', body: 'Nota breve', created_at: iso }, 'es-ES', 'UTC');
  const formatted = formatTimestamp(iso, 'es-ES', 'UTC');
  assert.ok(msg.includes(formatted), `El hover debe contener la fecha formateada «${formatted}», obtenido:\n${msg}`);
  assert.ok(!msg.includes(iso), `El hover no debe contener la ISO cruda, obtenido:\n${msg}`);
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

test('buildHoverMessage incluye el nombre del agente en la cabecera', () => {
  const msg = buildHoverMessage({
    type: 'verifica',
    agent: 'review',
    body: 'Comprueba la cifra',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(msg.includes('review'), `Debe incluir el nombre del agente, obtenido:\n${msg}`);
  assert.ok(msg.includes('·'), `Debe usar · como separador tipo-agente, obtenido:\n${msg}`);
});

test('buildHoverMessage no contiene separador · cuando agent es undefined', () => {
  const msg = buildHoverMessage({
    type: 'sugerencia',
    agent: undefined,
    body: 'Una sugerencia',
    created_at: '2026-07-09T10:00:00Z',
  });
  // El único · que podría aparecer es el del separador tipo-agente
  // El separador ─ no contiene ·, así que este check es válido
  assert.ok(!msg.includes(' · '), `No debe contener « · » sin agente, obtenido:\n${msg}`);
});

test('buildHoverMessage agente aparece en la cabecera, antes del separador y del body', () => {
  const iso = '2026-07-09T10:00:00Z';
  const msg = buildHoverMessage({ type: 'verifica', agent: 'security', body: 'texto', created_at: iso }, 'es-ES', 'UTC');
  const tipoIdx    = msg.indexOf('verifica');
  const agenteIdx  = msg.indexOf('security');
  const separIdx   = msg.indexOf('─'.repeat(40));
  assert.ok(tipoIdx < agenteIdx,  'El agente debe aparecer después del tipo');
  assert.ok(agenteIdx < separIdx, 'El agente debe aparecer antes del separador');
});

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

test('escapeHtml escapa < y > a &lt; y &gt;', () => {
  assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;');
});

test('escapeHtml escapa & a &amp;', () => {
  assert.strictEqual(escapeHtml('a & b'), 'a &amp; b');
});

test('escapeHtml escapa & antes de < para evitar doble escape', () => {
  // Si se escapara < primero, «a&b» → «a&b» luego «a&amp;b» ✓;
  // pero «<» → «&lt;» luego «&amp;lt;» ✗ — el orden correcto evita eso.
  const result = escapeHtml('a&b<c>');
  assert.strictEqual(result, 'a&amp;b&lt;c&gt;');
});

test('escapeHtml no modifica texto sin caracteres especiales', () => {
  const plain = 'texto normal sin especiales';
  assert.strictEqual(escapeHtml(plain), plain);
});

test('escapeHtml escapa comillas dobles a &quot; (seguro en atributos)', () => {
  // Sin esto, un valor interpolado en data-thread-id="…" podría romper el
  // atributo e inyectar atributos adicionales.
  assert.strictEqual(escapeHtml('x"y'), 'x&quot;y');
});

test('escapeHtml escapa comillas simples a &#39;', () => {
  assert.strictEqual(escapeHtml("x'y"), 'x&#39;y');
});

test('typeColor con clave contaminante (__proto__) cae al fallback', () => {
  // Con un objeto de prototipo normal, TYPE_COLORS['__proto__'] devolvería
  // Object.prototype (truthy) y se saltaría el guard ?? FALLBACK_COLOR.
  assert.strictEqual(typeColor('__proto__'), typeColor('tipo-inexistente-zzz'));
});

test('typeColor con clave "constructor" cae al fallback', () => {
  assert.strictEqual(typeColor('constructor'), typeColor('tipo-inexistente-zzz'));
});

// ---------------------------------------------------------------------------
// buildHoverMessage — escape de contenido de usuario
// ---------------------------------------------------------------------------

test('buildHoverMessage body con <script>: no contiene la etiqueta cruda', () => {
  const msg = buildHoverMessage({
    type: 'nota',
    body: '<script>alert(1)</script>',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(!msg.includes('<script>'), `No debe contener <script> crudo, obtenido:\n${msg}`);
  assert.ok(msg.includes('&lt;script&gt;'), `Debe contener &lt;script&gt; escapado, obtenido:\n${msg}`);
});

test('buildHoverMessage body «el tipo <T> no compila» conserva el texto escapado', () => {
  const msg = buildHoverMessage({
    type: 'pregunta',
    body: 'el tipo <T> no compila',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(msg.includes('&lt;T&gt;'), `El cuerpo debe contener &lt;T&gt;, obtenido:\n${msg}`);
  assert.ok(!msg.includes('<T>'), `No debe contener <T> crudo, obtenido:\n${msg}`);
});

test('buildHoverMessage agent con ángulos se escapa correctamente', () => {
  const msg = buildHoverMessage({
    type: 'verifica',
    agent: '<bot>',
    body: 'texto normal',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(msg.includes('&lt;bot&gt;'), `El agente debe aparecer escapado, obtenido:\n${msg}`);
  assert.ok(!msg.includes('<bot>'), `No debe contener <bot> crudo, obtenido:\n${msg}`);
});

test('buildHoverMessage body con & se escapa a &amp; sin doble escape', () => {
  const msg = buildHoverMessage({
    type: 'nota',
    body: 'a & b',
    created_at: '2026-07-09T10:00:00Z',
  });
  assert.ok(msg.includes('a &amp; b'), `Debe contener a &amp; b, obtenido:\n${msg}`);
  assert.ok(!msg.includes('&amp;amp;'), `No debe doble-escapar, obtenido:\n${msg}`);
});

// ---------------------------------------------------------------------------
// Defensivos — paleta y formato de spans
// ---------------------------------------------------------------------------

test('FALLBACK_COLOR cumple /^#[0-9a-fA-F]{6}$/ (requerimiento del sanitizador VS Code)', () => {
  assert.match(FALLBACK_COLOR, /^#[0-9a-fA-F]{6}$/);
});

test('todos los <span style="color:...;"> del hover terminan el color con punto y coma', () => {
  // Genera un hover para cada tipo y verifica que todos los spans de color
  // tienen el ; obligatorio que exige el sanitizador de VS Code.
  const tipos = ['edita', 'sugerencia', 'pregunta', 'verifica', 'nota'] as const;
  const spanStyleRe = /style="color:([^"]+)"/g;
  for (const tipo of tipos) {
    const msg = buildHoverMessage({ type: tipo, body: 'x', created_at: '2026-07-09T10:00:00Z' });
    for (const match of msg.matchAll(spanStyleRe)) {
      const value = match[1];
      assert.ok(
        value.endsWith(';'),
        `Span del tipo ${tipo} debe terminar en ;, obtenido: style="color:${value}"`
      );
    }
  }
});

// ---------------------------------------------------------------------------
// TYPE_COLORS — tipos V2 añadidos en F3a
// ---------------------------------------------------------------------------

test('typeColor devuelve sage #A8CBA0 para referencia', () => {
  assert.strictEqual(typeColor('referencia'), '#A8CBA0');
});

test('typeColor devuelve lilac #CBAACB para supuesto', () => {
  assert.strictEqual(typeColor('supuesto'), '#CBAACB');
});

test('TYPE_COLORS tiene exactamente 7 entradas', () => {
  assert.strictEqual(Object.keys(TYPE_COLORS).length, 7);
});

// ---------------------------------------------------------------------------
// hexToRgba
// ---------------------------------------------------------------------------

test('hexToRgba convierte «#rrggbb» a rgba con el alpha dado', () => {
  assert.strictEqual(hexToRgba('#E59A9A', 0.18), 'rgba(229, 154, 154, 0.18)');
});

test('hexToRgba maneja negro y blanco puros', () => {
  assert.strictEqual(hexToRgba('#000000', 1), 'rgba(0, 0, 0, 1)');
  assert.strictEqual(hexToRgba('#FFFFFF', 0.5), 'rgba(255, 255, 255, 0.5)');
});

test('hexToRgba acepta hex en minúsculas', () => {
  assert.strictEqual(hexToRgba('#6cb6b0', 0.18), 'rgba(108, 182, 176, 0.18)');
});

test('hexToRgba devuelve la entrada tal cual si no es «#rrggbb»', () => {
  // Malformado (3 dígitos, sin #, con alpha ya incluido): se aplica opaco en
  // vez de romper la decoración.
  assert.strictEqual(hexToRgba('#fff', 0.18), '#fff');
  assert.strictEqual(hexToRgba('rojo', 0.18), 'rojo');
});

test('hexToRgba compone con typeColor para cada tipo reconocido', () => {
  // El backgroundColor real sale de hexToRgba(typeColor(tipo), RANGE_ALPHA);
  // verifica que la cadena de composición produce rgba() válido, no el hex crudo.
  for (const tipo of Object.keys(TYPE_COLORS)) {
    const rgba = hexToRgba(typeColor(tipo), 0.18);
    assert.ok(rgba.startsWith('rgba('), `Esperado rgba() para ${tipo}, obtenido: ${rgba}`);
  }
});

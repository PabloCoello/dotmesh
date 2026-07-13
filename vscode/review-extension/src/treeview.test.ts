/**
 * Tests unitarios para treeview-utils.ts.
 *
 * Cubre la lógica pura de agrupación, ordenación y localización de comentarios.
 * Las clases del TreeView de VS Code (GroupItem, CommentItem, ReviewTreeDataProvider)
 * se verifican de forma manual en el walkthrough final.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  groupCommentsByType,
  findCommentAtOffset,
  mutateCommentById,
  TYPE_ORDER,
  TYPE_LABELS,
} from './treeview-utils.ts';
import type { Comment, Sidecar } from './sidecar';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeComment(overrides: { id: string } & Partial<Comment>): Comment {
  return {
    id: overrides.id,
    anchor: overrides.anchor ?? { quote: 'texto de prueba', line_hint: 0, char_offset: 0 },
    type: overrides.type ?? 'nota',
    agent: overrides.agent,
    body: overrides.body ?? 'Cuerpo del comentario',
    status: overrides.status ?? 'open',
    created_at: overrides.created_at ?? '2026-07-09T10:00:00Z',
    updated_at: overrides.updated_at ?? '2026-07-09T10:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// groupCommentsByType — estructura y orden de grupos
// ---------------------------------------------------------------------------

test('groupCommentsByType con lista vacía devuelve array vacío', () => {
  assert.deepStrictEqual(groupCommentsByType([]), []);
});

test('groupCommentsByType ordena grupos: edita → sugerencia → pregunta → verifica → nota', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', type: 'nota' }),
    makeComment({ id: '2', type: 'edita' }),
    makeComment({ id: '3', type: 'pregunta' }),
    makeComment({ id: '4', type: 'sugerencia' }),
    makeComment({ id: '5', type: 'verifica' }),
  ];
  const groups = groupCommentsByType(comments);
  const types = groups.map(g => g.type);
  assert.deepStrictEqual(types, ['edita', 'sugerencia', 'pregunta', 'verifica', 'nota']);
});

test('groupCommentsByType omite grupos con cero comentarios', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', type: 'edita' }),
  ];
  const groups = groupCommentsByType(comments);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].type, 'edita');
});

test('groupCommentsByType devuelve las etiquetas correctas para cada tipo', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', type: 'edita' }),
    makeComment({ id: '2', type: 'sugerencia' }),
    makeComment({ id: '3', type: 'pregunta' }),
    makeComment({ id: '4', type: 'verifica' }),
    makeComment({ id: '5', type: 'nota' }),
  ];
  const groups = groupCommentsByType(comments);
  assert.strictEqual(groups[0].label, 'Ediciones');
  assert.strictEqual(groups[1].label, 'Sugerencias');
  assert.strictEqual(groups[2].label, 'Preguntas');
  assert.strictEqual(groups[3].label, 'Verificaciones');
  assert.strictEqual(groups[4].label, 'Notas');
});

test('groupCommentsByType incluye todos los comentarios abiertos en los grupos', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', type: 'edita' }),
    makeComment({ id: '2', type: 'edita' }),
    makeComment({ id: '3', type: 'sugerencia' }),
  ];
  const groups = groupCommentsByType(comments);
  const total = groups.reduce((acc, g) => acc + g.comments.length, 0);
  assert.strictEqual(total, 3);
});

// ---------------------------------------------------------------------------
// groupCommentsByType — orden por line_hint dentro de cada grupo
// ---------------------------------------------------------------------------

test('groupCommentsByType ordena por line_hint ascendente dentro del grupo', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', type: 'verifica', anchor: { quote: 'a', line_hint: 10, char_offset: 0 } }),
    makeComment({ id: '2', type: 'verifica', anchor: { quote: 'b', line_hint: 3, char_offset: 0 } }),
    makeComment({ id: '3', type: 'verifica', anchor: { quote: 'c', line_hint: 7, char_offset: 0 } }),
  ];
  const groups = groupCommentsByType(comments);
  assert.strictEqual(groups.length, 1);
  const lineHints = groups[0].comments.map(c => c.anchor.line_hint);
  assert.deepStrictEqual(lineHints, [3, 7, 10]);
});

test('groupCommentsByType ordena correctamente con line_hint=0 presente', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', type: 'pregunta', anchor: { quote: 'z', line_hint: 5, char_offset: 0 } }),
    makeComment({ id: '2', type: 'pregunta', anchor: { quote: 'a', line_hint: 0, char_offset: 0 } }),
  ];
  const groups = groupCommentsByType(comments);
  assert.strictEqual(groups[0].comments[0].id, '2'); // line_hint 0 primero
  assert.strictEqual(groups[0].comments[1].id, '1');
});

// ---------------------------------------------------------------------------
// groupCommentsByType — resueltos
// ---------------------------------------------------------------------------

test('groupCommentsByType coloca los resueltos al final como grupo propio', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', type: 'edita', status: 'open' }),
    makeComment({ id: '2', type: 'nota', status: 'resolved' }),
    makeComment({ id: '3', type: 'sugerencia', status: 'open' }),
  ];
  const groups = groupCommentsByType(comments);
  const lastGroup = groups[groups.length - 1];
  assert.strictEqual(lastGroup.type, 'resolved');
  assert.strictEqual(lastGroup.label, 'Resueltos');
  assert.strictEqual(lastGroup.comments.length, 1);
  assert.strictEqual(lastGroup.comments[0].id, '2');
});

test('groupCommentsByType con solo resueltos devuelve un único grupo "resolved"', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', status: 'resolved' }),
    makeComment({ id: '2', status: 'resolved' }),
  ];
  const groups = groupCommentsByType(comments);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].type, 'resolved');
  assert.strictEqual(groups[0].comments.length, 2);
});

test('groupCommentsByType no incluye resueltos en los grupos de tipo', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', type: 'edita', status: 'resolved' }),
    makeComment({ id: '2', type: 'edita', status: 'open' }),
  ];
  const groups = groupCommentsByType(comments);
  const editaGroup = groups.find(g => g.type === 'edita');
  assert.ok(editaGroup, 'debe existir el grupo edita');
  assert.strictEqual(editaGroup.comments.length, 1);
  assert.strictEqual(editaGroup.comments[0].id, '2');
});

// ---------------------------------------------------------------------------
// groupCommentsByType — tipos nuevos (verifica, nota)
// ---------------------------------------------------------------------------

test('groupCommentsByType agrupa correctamente comentarios de tipo verifica', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', type: 'verifica' }),
    makeComment({ id: '2', type: 'verifica' }),
  ];
  const groups = groupCommentsByType(comments);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].type, 'verifica');
  assert.strictEqual(groups[0].label, 'Verificaciones');
  assert.strictEqual(groups[0].comments.length, 2);
});

test('groupCommentsByType agrupa correctamente comentarios de tipo nota', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', type: 'nota' }),
  ];
  const groups = groupCommentsByType(comments);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].type, 'nota');
  assert.strictEqual(groups[0].label, 'Notas');
});

// ---------------------------------------------------------------------------
// groupCommentsByType — inmutabilidad
// ---------------------------------------------------------------------------

test('groupCommentsByType no muta el array de entrada', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', type: 'nota',  anchor: { quote: 'x', line_hint: 5, char_offset: 0 } }),
    makeComment({ id: '2', type: 'edita', anchor: { quote: 'y', line_hint: 1, char_offset: 0 } }),
  ];
  const originalOrder = comments.map(c => c.id);
  groupCommentsByType(comments);
  assert.deepStrictEqual(comments.map(c => c.id), originalOrder);
});

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

test('TYPE_ORDER mantiene el orden edita → sugerencia → pregunta → verifica → nota', () => {
  assert.deepStrictEqual([...TYPE_ORDER], ['edita', 'sugerencia', 'pregunta', 'verifica', 'nota']);
});

test('TYPE_LABELS tiene etiqueta para cada tipo en TYPE_ORDER', () => {
  for (const t of TYPE_ORDER) {
    assert.ok(typeof TYPE_LABELS[t] === 'string' && TYPE_LABELS[t].length > 0,
      `TYPE_LABELS[${t}] debe ser una cadena no vacía`);
  }
});

// ---------------------------------------------------------------------------
// findCommentAtOffset
// ---------------------------------------------------------------------------

test('findCommentAtOffset devuelve null con lista vacía', () => {
  assert.strictEqual(findCommentAtOffset([], 5, 'cualquier texto'), null);
});

test('findCommentAtOffset encuentra el comentario cuando el cursor está dentro del rango', () => {
  const text = 'texto relevante para el test';
  // 'relevante' empieza en offset 6 (t-e-x-t-o-' ')
  const comments: Comment[] = [
    makeComment({ id: '1', anchor: { quote: 'relevante', line_hint: 0, char_offset: 6 } }),
  ];
  const result = findCommentAtOffset(comments, 8, text);
  assert.ok(result !== null);
  assert.strictEqual(result.id, '1');
});

test('findCommentAtOffset devuelve null cuando el cursor está fuera de todos los rangos', () => {
  const text = 'texto relevante para el test';
  const comments: Comment[] = [
    makeComment({ id: '1', anchor: { quote: 'relevante', line_hint: 0, char_offset: 6 } }),
  ];
  assert.strictEqual(findCommentAtOffset(comments, 0, text), null);
});

test('findCommentAtOffset ignora los comentarios resueltos', () => {
  const text = 'texto relevante para el test';
  const comments: Comment[] = [
    makeComment({ id: '1', anchor: { quote: 'relevante', line_hint: 0, char_offset: 6 }, status: 'resolved' }),
  ];
  assert.strictEqual(findCommentAtOffset(comments, 8, text), null);
});

test('findCommentAtOffset devuelve null si el quote ya no existe en el documento', () => {
  const text = 'texto diferente';
  const comments: Comment[] = [
    makeComment({ id: '1', anchor: { quote: 'quote que ya no existe', line_hint: 0, char_offset: 0 } }),
  ];
  assert.strictEqual(findCommentAtOffset(comments, 0, text), null);
});

test('findCommentAtOffset con solapamiento devuelve el de menor startOffset', () => {
  // 'hola' en posición 0 y 'hola mundo' también desde 0
  const text = 'hola mundo en el documento';
  const comments: Comment[] = [
    makeComment({ id: 'largo', anchor: { quote: 'hola mundo', line_hint: 0, char_offset: 0 } }),
    makeComment({ id: 'corto', anchor: { quote: 'hola', line_hint: 0, char_offset: 0 } }),
  ];
  // cursor en offset 2, dentro de ambos rangos ([0,10] y [0,4])
  const result = findCommentAtOffset(comments, 2, text);
  assert.ok(result !== null);
  // Ambos empiezan en 0; el orden en el array no cambia el resultado
  // Solo importa que devuelva uno de los que coinciden (startOffset=0)
  assert.ok(result.id === 'largo' || result.id === 'corto');
});

// ---------------------------------------------------------------------------
// mutateCommentById
// ---------------------------------------------------------------------------

function makeSidecar(comments: Comment[]): Sidecar {
  return { version: 1, file: 'docs/test.md', comments };
}

test('mutateCommentById con id existente aplica el mutador y devuelve found: true', () => {
  const c = makeComment({ id: 'abc', body: 'original' });
  const sidecar = makeSidecar([c]);
  const { sidecar: result, found } = mutateCommentById(sidecar, 'abc', (comment) => ({
    ...comment,
    body: 'modificado',
  }));
  assert.strictEqual(found, true);
  assert.strictEqual(result.comments[0].body, 'modificado');
});

test('mutateCommentById con id ausente devuelve found: false sin modificar nada', () => {
  const c = makeComment({ id: 'abc', body: 'original' });
  const sidecar = makeSidecar([c]);
  const { sidecar: result, found } = mutateCommentById(sidecar, 'no-existe', (comment) => ({
    ...comment,
    body: 'nunca',
  }));
  assert.strictEqual(found, false);
  assert.strictEqual(result.comments[0].body, 'original');
});

test('mutateCommentById con mutador que devuelve null elimina exactamente un comentario', () => {
  const c1 = makeComment({ id: 'a' });
  const c2 = makeComment({ id: 'b' });
  const sidecar = makeSidecar([c1, c2]);
  const { sidecar: result, found } = mutateCommentById(sidecar, 'a', () => null);
  assert.strictEqual(found, true);
  assert.strictEqual(result.comments.length, 1);
  assert.strictEqual(result.comments[0].id, 'b');
});

test('mutateCommentById no elimina el comentario incorrecto', () => {
  const c1 = makeComment({ id: 'a' });
  const c2 = makeComment({ id: 'b' });
  const c3 = makeComment({ id: 'c' });
  const sidecar = makeSidecar([c1, c2, c3]);
  const { sidecar: result } = mutateCommentById(sidecar, 'b', () => null);
  assert.deepStrictEqual(result.comments.map(c => c.id), ['a', 'c']);
});

test('mutateCommentById updated_at resultante sigue el formato del schema (YYYY-MM-DDTHH:MM:SSZ)', () => {
  const c = makeComment({ id: 'x', updated_at: '2026-01-01T00:00:00Z' });
  const sidecar = makeSidecar([c]);
  const { sidecar: result } = mutateCommentById(sidecar, 'x', (comment) => ({
    ...comment,
    updated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }));
  assert.match(result.comments[0].updated_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test('mutateCommentById no muta el sidecar original', () => {
  const c = makeComment({ id: 'z', body: 'intacto' });
  const sidecar = makeSidecar([c]);
  mutateCommentById(sidecar, 'z', (comment) => ({ ...comment, body: 'cambiado' }));
  assert.strictEqual(sidecar.comments[0].body, 'intacto');
});

test('mutateCommentById con id ausente preserva la referencia original del sidecar', () => {
  const c = makeComment({ id: 'q' });
  const sidecar = makeSidecar([c]);
  const { sidecar: result, found } = mutateCommentById(sidecar, 'no-existe', () => null);
  assert.strictEqual(found, false);
  // Sin id encontrado el sidecar devuelto es el mismo objeto (optimización)
  assert.strictEqual(result, sidecar);
});

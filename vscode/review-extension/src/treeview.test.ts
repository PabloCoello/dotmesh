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
  groupCommentsByPriority,
  findCommentAtOffset,
  PRIORITY_ORDER,
  PRIORITY_LABELS,
} from './treeview-utils.ts';
import type { Comment } from './sidecar';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

function makeComment(overrides: { id: string } & Partial<Comment>): Comment {
  return {
    id: overrides.id,
    anchor: overrides.anchor ?? { quote: 'texto de prueba', line_hint: 0, char_offset: 0 },
    type: overrides.type ?? 'comentario',
    priority: overrides.priority ?? 'media',
    body: overrides.body ?? 'Cuerpo del comentario',
    status: overrides.status ?? 'open',
    created_at: overrides.created_at ?? '2026-07-09T10:00:00Z',
    updated_at: overrides.updated_at ?? '2026-07-09T10:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// groupCommentsByPriority — estructura y orden de grupos
// ---------------------------------------------------------------------------

test('groupCommentsByPriority con lista vacía devuelve array vacío', () => {
  assert.deepStrictEqual(groupCommentsByPriority([]), []);
});

test('groupCommentsByPriority ordena grupos: alta → media → baja', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', priority: 'baja' }),
    makeComment({ id: '2', priority: 'alta' }),
    makeComment({ id: '3', priority: 'media' }),
  ];
  const groups = groupCommentsByPriority(comments);
  const priorities = groups.map(g => g.priority);
  assert.deepStrictEqual(priorities, ['alta', 'media', 'baja']);
});

test('groupCommentsByPriority omite grupos con cero comentarios', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', priority: 'alta' }),
  ];
  const groups = groupCommentsByPriority(comments);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].priority, 'alta');
});

test('groupCommentsByPriority devuelve las etiquetas correctas para cada prioridad', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', priority: 'alta' }),
    makeComment({ id: '2', priority: 'media' }),
    makeComment({ id: '3', priority: 'baja' }),
  ];
  const groups = groupCommentsByPriority(comments);
  assert.strictEqual(groups[0].label, 'Alta prioridad');
  assert.strictEqual(groups[1].label, 'Media prioridad');
  assert.strictEqual(groups[2].label, 'Baja prioridad');
});

test('groupCommentsByPriority incluye todos los comentarios abiertos en los grupos', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', priority: 'alta' }),
    makeComment({ id: '2', priority: 'alta' }),
    makeComment({ id: '3', priority: 'media' }),
  ];
  const groups = groupCommentsByPriority(comments);
  const total = groups.reduce((acc, g) => acc + g.comments.length, 0);
  assert.strictEqual(total, 3);
});

// ---------------------------------------------------------------------------
// groupCommentsByPriority — orden por line_hint dentro de cada grupo
// ---------------------------------------------------------------------------

test('groupCommentsByPriority ordena por line_hint ascendente dentro del grupo', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', priority: 'alta', anchor: { quote: 'a', line_hint: 10, char_offset: 0 } }),
    makeComment({ id: '2', priority: 'alta', anchor: { quote: 'b', line_hint: 3, char_offset: 0 } }),
    makeComment({ id: '3', priority: 'alta', anchor: { quote: 'c', line_hint: 7, char_offset: 0 } }),
  ];
  const groups = groupCommentsByPriority(comments);
  assert.strictEqual(groups.length, 1);
  const lineHints = groups[0].comments.map(c => c.anchor.line_hint);
  assert.deepStrictEqual(lineHints, [3, 7, 10]);
});

test('groupCommentsByPriority ordena correctamente con line_hint=0 presente', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', priority: 'media', anchor: { quote: 'z', line_hint: 5, char_offset: 0 } }),
    makeComment({ id: '2', priority: 'media', anchor: { quote: 'a', line_hint: 0, char_offset: 0 } }),
  ];
  const groups = groupCommentsByPriority(comments);
  assert.strictEqual(groups[0].comments[0].id, '2'); // line_hint 0 primero
  assert.strictEqual(groups[0].comments[1].id, '1');
});

// ---------------------------------------------------------------------------
// groupCommentsByPriority — resueltos
// ---------------------------------------------------------------------------

test('groupCommentsByPriority coloca los resueltos al final como grupo propio', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', priority: 'alta', status: 'open' }),
    makeComment({ id: '2', priority: 'baja', status: 'resolved' }),
    makeComment({ id: '3', priority: 'media', status: 'open' }),
  ];
  const groups = groupCommentsByPriority(comments);
  const lastGroup = groups[groups.length - 1];
  assert.strictEqual(lastGroup.priority, 'resolved');
  assert.strictEqual(lastGroup.label, 'Resueltos');
  assert.strictEqual(lastGroup.comments.length, 1);
  assert.strictEqual(lastGroup.comments[0].id, '2');
});

test('groupCommentsByPriority con solo resueltos devuelve un único grupo "resolved"', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', status: 'resolved' }),
    makeComment({ id: '2', status: 'resolved' }),
  ];
  const groups = groupCommentsByPriority(comments);
  assert.strictEqual(groups.length, 1);
  assert.strictEqual(groups[0].priority, 'resolved');
  assert.strictEqual(groups[0].comments.length, 2);
});

test('groupCommentsByPriority no incluye resueltos en los grupos de prioridad', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', priority: 'alta', status: 'resolved' }),
    makeComment({ id: '2', priority: 'alta', status: 'open' }),
  ];
  const groups = groupCommentsByPriority(comments);
  const altaGroup = groups.find(g => g.priority === 'alta');
  assert.ok(altaGroup, 'debe existir el grupo alta');
  assert.strictEqual(altaGroup.comments.length, 1);
  assert.strictEqual(altaGroup.comments[0].id, '2');
});

// ---------------------------------------------------------------------------
// groupCommentsByPriority — inmutabilidad
// ---------------------------------------------------------------------------

test('groupCommentsByPriority no muta el array de entrada', () => {
  const comments: Comment[] = [
    makeComment({ id: '1', priority: 'baja', anchor: { quote: 'x', line_hint: 5, char_offset: 0 } }),
    makeComment({ id: '2', priority: 'alta', anchor: { quote: 'y', line_hint: 1, char_offset: 0 } }),
  ];
  const originalOrder = comments.map(c => c.id);
  groupCommentsByPriority(comments);
  assert.deepStrictEqual(comments.map(c => c.id), originalOrder);
});

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

test('PRIORITY_ORDER mantiene el orden alta → media → baja', () => {
  assert.deepStrictEqual([...PRIORITY_ORDER], ['alta', 'media', 'baja']);
});

test('PRIORITY_LABELS tiene etiqueta para cada prioridad en PRIORITY_ORDER', () => {
  for (const p of PRIORITY_ORDER) {
    assert.ok(typeof PRIORITY_LABELS[p] === 'string' && PRIORITY_LABELS[p].length > 0,
      `PRIORITY_LABELS[${p}] debe ser una cadena no vacía`);
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

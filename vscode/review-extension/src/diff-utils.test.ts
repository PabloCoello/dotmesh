/**
 * Tests unitarios para diff-utils.ts.
 *
 * Sin importaciones de VS Code: testeable con node:test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDiffTitle } from './diff-utils.ts';

test('buildDiffTitle: ruta anidada, sha largo truncado a 7', () => {
  assert.equal(
    buildDiffTitle('docs/informe.md', 'edita', 'abc1234def'),
    'informe.md · edita · abc1234'
  );
});

test('buildDiffTitle: nombre en raíz, sha ya de 7 caracteres (sin truncar)', () => {
  assert.equal(
    buildDiffTitle('README.md', 'sugerencia', 'f00f00f'),
    'README.md · sugerencia · f00f00f'
  );
});

test('buildDiffTitle: ruta profunda, sha muy largo truncado a 7', () => {
  assert.equal(
    buildDiffTitle('deep/nested/doc.md', 'nota', '1234567890ab'),
    'doc.md · nota · 1234567'
  );
});

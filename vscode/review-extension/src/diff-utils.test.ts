/**
 * Tests unitarios para diff-utils.ts.
 *
 * Sin importaciones de VS Code: testeable con node:test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDiffTitle, isMeshReviewDiffTabLabel } from './diff-utils.ts';

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

// ---------------------------------------------------------------------------
// buildDiffTitle — casos defensivos
// ---------------------------------------------------------------------------

test('buildDiffTitle: docRelPath vacío produce título que empieza por " · "', () => {
  // path.basename('') === ''; el título resultante no tiene nombre antes del primer · .
  // isMeshReviewDiffTabLabel lo rechazará porque .+? exige al menos un carácter.
  assert.equal(
    buildDiffTitle('', 'nota', 'abc1234'),
    ' · nota · abc1234'
  );
});

test('buildDiffTitle: sha más corto de 7 no se rellena — se usa tal cual', () => {
  // slice(0, 7) de una cadena de 3 chars devuelve los 3 chars sin padding.
  assert.equal(
    buildDiffTitle('file.md', 'nota', 'abc'),
    'file.md · nota · abc'
  );
});

// ---------------------------------------------------------------------------
// isMeshReviewDiffTabLabel — casos verdaderos (generados por buildDiffTitle)
// ---------------------------------------------------------------------------

test('isMeshReviewDiffTabLabel: etiqueta generada por buildDiffTitle (ruta anidada)', () => {
  assert.equal(isMeshReviewDiffTabLabel('informe.md · edita · abc1234'), true);
});

test('isMeshReviewDiffTabLabel: etiqueta generada por buildDiffTitle (raíz, sha exacto de 7)', () => {
  assert.equal(isMeshReviewDiffTabLabel('README.md · sugerencia · f00f00f'), true);
});

test('isMeshReviewDiffTabLabel: etiqueta generada por buildDiffTitle (ruta profunda)', () => {
  assert.equal(isMeshReviewDiffTabLabel('doc.md · nota · 1234567'), true);
});

// ---------------------------------------------------------------------------
// isMeshReviewDiffTabLabel — títulos típicos del SCM (deben devolver false)
// ---------------------------------------------------------------------------

test('isMeshReviewDiffTabLabel: título SCM "Working Tree" → false', () => {
  assert.equal(isMeshReviewDiffTabLabel('archivo.md (Working Tree)'), false);
});

test('isMeshReviewDiffTabLabel: título SCM con flecha ↔ → false', () => {
  assert.equal(isMeshReviewDiffTabLabel('a.ts ↔ b.ts'), false);
});

test('isMeshReviewDiffTabLabel: título SCM "(HEAD)" → false', () => {
  assert.equal(isMeshReviewDiffTabLabel('index.js (HEAD)'), false);
});

// ---------------------------------------------------------------------------
// isMeshReviewDiffTabLabel — casos límite del sha
// ---------------------------------------------------------------------------

test('isMeshReviewDiffTabLabel: sha de 6 dígitos hex → false (necesita exactamente 7)', () => {
  assert.equal(isMeshReviewDiffTabLabel('file.md · nota · abc123'), false);
});

test('isMeshReviewDiffTabLabel: sha con letras mayúsculas → false (solo [0-9a-f])', () => {
  assert.equal(isMeshReviewDiffTabLabel('file.md · nota · ABC1234'), false);
});

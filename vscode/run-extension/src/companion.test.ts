import { test } from 'node:test';
import assert from 'node:assert/strict';

import { companionFileName } from './companion.ts';

test('companionFileName: sustituye la extensión .md por .ipynb', () => {
  assert.strictEqual(companionFileName('analisis.md', new Set()), 'analisis.ipynb');
});

test('companionFileName: basename sin extensión añade .ipynb', () => {
  assert.strictEqual(companionFileName('README', new Set()), 'README.ipynb');
});

test('companionFileName: solo elimina la última extensión', () => {
  assert.strictEqual(
    companionFileName('informe.final.md', new Set()),
    'informe.final.ipynb',
  );
});

test('companionFileName: nombre ocupado recibe sufijo -2', () => {
  const taken = new Set(['analisis.ipynb']);
  assert.strictEqual(companionFileName('analisis.md', taken), 'analisis-2.ipynb');
});

test('companionFileName: sufijos consecutivos hasta encontrar hueco', () => {
  const taken = new Set(['analisis.ipynb', 'analisis-2.ipynb', 'analisis-3.ipynb']);
  assert.strictEqual(companionFileName('analisis.md', taken), 'analisis-4.ipynb');
});

test('companionFileName: los nombres ocupados ajenos no afectan', () => {
  const taken = new Set(['otro.ipynb', 'Untitled-1.ipynb']);
  assert.strictEqual(companionFileName('analisis.md', taken), 'analisis.ipynb');
});

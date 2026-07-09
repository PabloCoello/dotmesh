import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, chmod, writeFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

import {
  sha256hex,
  sidecarPathForDoc,
  fallbackSidecarPath,
  utcTimestamp,
  getGitRoot,
  readSidecar,
  writeSidecar,
  addToGitExclude,
  ensureFallbackDir,
  type Sidecar,
} from './sidecar.ts';

// ---------------------------------------------------------------------------
// sha256hex
// ---------------------------------------------------------------------------

test('sha256hex devuelve el hash correcto para cadena vacía', () => {
  // sha256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  assert.strictEqual(
    sha256hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
});

test('sha256hex es determinista', () => {
  const input = '/Users/user/project/docs/informe.md';
  assert.strictEqual(sha256hex(input), sha256hex(input));
});

test('sha256hex produce hashes distintos para entradas distintas', () => {
  assert.notStrictEqual(sha256hex('/path/a'), sha256hex('/path/b'));
});

// ---------------------------------------------------------------------------
// sidecarPathForDoc
// ---------------------------------------------------------------------------

test('sidecarPathForDoc espeja la ruta relativa del documento', () => {
  const gitRoot = '/Users/user/project';
  const docPath = '/Users/user/project/docs/informe.md';
  const expected = '/Users/user/project/.ai/review/docs/informe.md.json';
  assert.strictEqual(sidecarPathForDoc(docPath, gitRoot), expected);
});

test('sidecarPathForDoc maneja directorios ocultos en la ruta', () => {
  const gitRoot = '/project';
  const docPath = '/project/.config/notas.md';
  const expected = '/project/.ai/review/.config/notas.md.json';
  assert.strictEqual(sidecarPathForDoc(docPath, gitRoot), expected);
});

test('sidecarPathForDoc maneja fichero en la raíz del repo', () => {
  const gitRoot = '/project';
  const docPath = '/project/README.md';
  const expected = '/project/.ai/review/README.md.json';
  assert.strictEqual(sidecarPathForDoc(docPath, gitRoot), expected);
});

// ---------------------------------------------------------------------------
// fallbackSidecarPath
// ---------------------------------------------------------------------------

test('fallbackSidecarPath incluye el sha256 de la ruta absoluta', () => {
  const docPath = '/Users/user/notas.md';
  const hash = sha256hex(docPath);
  const expected = join(homedir(), '.local', 'state', 'mesh-review', hash + '.json');
  assert.strictEqual(fallbackSidecarPath(docPath), expected);
});

test('fallbackSidecarPath rutas distintas producen rutas distintas', () => {
  assert.notStrictEqual(
    fallbackSidecarPath('/a/doc.md'),
    fallbackSidecarPath('/b/doc.md')
  );
});

// ---------------------------------------------------------------------------
// utcTimestamp
// ---------------------------------------------------------------------------

test('utcTimestamp produce formato YYYY-MM-DDTHH:MM:SSZ sin milisegundos', () => {
  const ts = utcTimestamp();
  assert.match(ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

// ---------------------------------------------------------------------------
// getGitRoot
// ---------------------------------------------------------------------------

test('getGitRoot devuelve un directorio válido dentro del worktree actual', async () => {
  const root = await getGitRoot(process.cwd());
  assert.ok(root !== null, 'Debe detectar un git root desde el cwd del test');
  assert.ok(root.length > 0);
});

test('getGitRoot devuelve null fuera de cualquier repo', async () => {
  const root = await getGitRoot(tmpdir());
  assert.strictEqual(root, null);
});

// ---------------------------------------------------------------------------
// readSidecar / writeSidecar (round-trip)
// ---------------------------------------------------------------------------

test('writeSidecar y readSidecar hacen round-trip íntegro', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-test-'));
  try {
    const filePath = join(dir, 'docs', 'test.md.json');
    const data: Sidecar = {
      version: 1,
      file: 'docs/test.md',
      comments: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          anchor: { quote: 'texto de prueba', line_hint: 3, char_offset: 42 },
          type: 'comentario',
          priority: 'media',
          body: 'Este es un comentario de prueba',
          status: 'open',
          created_at: '2026-07-09T10:00:00Z',
          updated_at: '2026-07-09T10:00:00Z',
        },
      ],
    };

    await writeSidecar(filePath, data);
    const read = await readSidecar(filePath);
    assert.deepEqual(read, data);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeSidecar crea el directorio intermedio si no existe', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-test-'));
  try {
    const filePath = join(dir, 'a', 'b', 'c', 'sidecar.json');
    const data: Sidecar = { version: 1, file: 'a/b/c/doc.md', comments: [] };
    await writeSidecar(filePath, data);
    const read = await readSidecar(filePath);
    assert.deepEqual(read, data);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readSidecar devuelve null para fichero inexistente', async () => {
  const result = await readSidecar('/tmp/no-existe-mesh-review-abc123.json');
  assert.strictEqual(result, null);
});

test('readSidecar devuelve null para JSON malformado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-test-'));
  try {
    const filePath = join(dir, 'bad.json');
    await writeFile(filePath, 'esto no es json', 'utf8');
    const result = await readSidecar(filePath);
    assert.strictEqual(result, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Issue 1: path traversal guard en sidecarPathForDoc
// ---------------------------------------------------------------------------

test('sidecarPathForDoc lanza si el documento queda fuera del git root', () => {
  const gitRoot = '/Users/user/project';
  const docPath = '/Users/user/other/doc.md';
  assert.throws(
    () => sidecarPathForDoc(docPath, gitRoot),
    /mesh-review: document path escapes git root/
  );
});

test('sidecarPathForDoc lanza para ruta fuera del root con prefijo común', () => {
  const gitRoot = '/project';
  const docPath = '/other/doc.md';
  assert.throws(
    () => sidecarPathForDoc(docPath, gitRoot),
    /mesh-review: document path escapes git root/
  );
});

test('sidecarPathForDoc no lanza para documento dentro del git root', () => {
  const gitRoot = '/Users/user/project';
  const docPath = '/Users/user/project/docs/doc.md';
  assert.doesNotThrow(() => sidecarPathForDoc(docPath, gitRoot));
});

test('resolución cae al fallback cuando sidecarPathForDoc lanza', () => {
  const gitRoot = '/Users/user/project';
  const docPath = '/Users/user/other/doc.md';
  let result: string;
  try {
    result = sidecarPathForDoc(docPath, gitRoot);
    assert.fail('Debería haber lanzado');
  } catch {
    result = fallbackSidecarPath(docPath);
  }
  assert.strictEqual(result, fallbackSidecarPath(docPath));
});

// ---------------------------------------------------------------------------
// Issue 2: chmod forzado en ensureFallbackDir
// ---------------------------------------------------------------------------

test('ensureFallbackDir fuerza 0o700 aunque el directorio preexista con 0o755', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-fallback-'));
  try {
    await chmod(dir, 0o755);
    await ensureFallbackDir(dir);
    const stats = await stat(dir);
    assert.strictEqual(stats.mode & 0o777, 0o700);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Issue 4: addToGitExclude idempotente
// ---------------------------------------------------------------------------

test('addToGitExclude es idempotente: dos llamadas dejan una sola entrada', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-git-'));
  try {
    const gitDir = join(dir, '.git', 'info');
    await mkdir(gitDir, { recursive: true });
    const excludePath = join(gitDir, 'exclude');
    await writeFile(excludePath, '', 'utf8');
    await addToGitExclude(dir);
    await addToGitExclude(dir);
    const content = await readFile(excludePath, 'utf8');
    const occurrences = (content.match(/\.ai\/review\//g) || []).length;
    assert.strictEqual(occurrences, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Issue 5: validación runtime en readSidecar
// ---------------------------------------------------------------------------

test('readSidecar devuelve null para sidecar con version distinta de 1', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-test-'));
  try {
    const filePath = join(dir, 'bad-version.json');
    await writeFile(filePath, JSON.stringify({ version: 2, file: 'doc.md', comments: [] }), 'utf8');
    const result = await readSidecar(filePath);
    assert.strictEqual(result, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readSidecar devuelve null cuando comments no es un array', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-test-'));
  try {
    const filePath = join(dir, 'bad-comments.json');
    await writeFile(filePath, JSON.stringify({ version: 1, file: 'doc.md', comments: 'no-array' }), 'utf8');
    const result = await readSidecar(filePath);
    assert.strictEqual(result, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

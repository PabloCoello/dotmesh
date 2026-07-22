import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, chmod, writeFile, mkdir, readFile, readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

import {
  sha256hex,
  sidecarPathForDoc,
  fallbackSidecarPath,
  fallbackEventDir,
  isUuid,
  utcTimestamp,
  utcTimestampMs,
  getGitRoot,
  readSidecar,
  writeSidecar,
  addToGitExclude,
  ensureFallbackDir,
  project,
  migrateV1,
  readEvents,
  writeEvent,
  detectLegacy,
  ensureBacklogDir,
  writeBacklogTask,
  buildV1FilePath,
  VALID_COMMENT_TYPES,
  anchorChanged,
  scanAllDocs,
  SCAN_ALL_DOCS_LIMIT,
  type Anchor,
  type Sidecar,
  type EventEnvelope,
  type BacklogTask,
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
          type: 'nota',
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

test('writeSidecar y readSidecar preservan el campo agent opcional', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-test-'));
  try {
    const filePath = join(dir, 'agent-test.json');
    const data: Sidecar = {
      version: 1,
      file: 'docs/test.md',
      comments: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          anchor: { quote: 'fragmento', line_hint: 0, char_offset: 0 },
          type: 'verifica',
          agent: 'review',
          body: 'Comprueba la afirmación contra la fuente',
          status: 'open',
          created_at: '2026-07-09T10:00:00Z',
          updated_at: '2026-07-09T10:00:00Z',
        },
      ],
    };

    await writeSidecar(filePath, data);
    const read = await readSidecar(filePath);
    assert.deepEqual(read, data);
    assert.strictEqual(read?.comments[0].agent, 'review');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeSidecar y readSidecar preservan comentario sin campo agent', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-test-'));
  try {
    const filePath = join(dir, 'no-agent-test.json');
    const data: Sidecar = {
      version: 1,
      file: 'docs/test.md',
      comments: [
        {
          id: '550e8400-e29b-41d4-a716-446655440002',
          anchor: { quote: 'otro fragmento', line_hint: 1, char_offset: 10 },
          type: 'sugerencia',
          body: 'Sugerencia sin agente asignado',
          status: 'open',
          created_at: '2026-07-09T10:00:00Z',
          updated_at: '2026-07-09T10:00:00Z',
        },
      ],
    };

    await writeSidecar(filePath, data);
    const read = await readSidecar(filePath);
    assert.deepEqual(read, data);
    assert.strictEqual(read?.comments[0].agent, undefined);
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

test('addToGitExclude es idempotente para .ai/backlog/: dos llamadas dejan una sola entrada', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-git-'));
  try {
    const gitDir = join(dir, '.git', 'info');
    await mkdir(gitDir, { recursive: true });
    const excludePath = join(gitDir, 'exclude');
    await writeFile(excludePath, '', 'utf8');
    await addToGitExclude(dir, '.ai/backlog/');
    await addToGitExclude(dir, '.ai/backlog/');
    const content = await readFile(excludePath, 'utf8');
    const occurrences = (content.match(/\.ai\/backlog\//g) || []).length;
    assert.strictEqual(occurrences, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('addToGitExclude entradas distintas son independientes: review y backlog coexisten', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-git-'));
  try {
    const gitDir = join(dir, '.git', 'info');
    await mkdir(gitDir, { recursive: true });
    const excludePath = join(gitDir, 'exclude');
    await writeFile(excludePath, '', 'utf8');
    await addToGitExclude(dir);                     // .ai/review/
    await addToGitExclude(dir, '.ai/backlog/');      // .ai/backlog/
    await addToGitExclude(dir);                     // idempotente
    await addToGitExclude(dir, '.ai/backlog/');      // idempotente
    const content = await readFile(excludePath, 'utf8');
    assert.strictEqual((content.match(/\.ai\/review\//g) || []).length, 1);
    assert.strictEqual((content.match(/\.ai\/backlog\//g) || []).length, 1);
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

// ---------------------------------------------------------------------------
// utcTimestampMs (F2)
// ---------------------------------------------------------------------------

test('utcTimestampMs produce formato ISO 8601 UTC con milisegundos', () => {
  const ts = utcTimestampMs();
  assert.match(ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

// ---------------------------------------------------------------------------
// project (F2) — funciones puras
// ---------------------------------------------------------------------------

/**
 * Helper: construye un EventEnvelope mínimo de tipo thread.opened.
 * Los overrides se fusionan sobre los valores por defecto.
 */
function makeOpened(overrides: Record<string, unknown> = {}): EventEnvelope {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    version: 2,
    type: 'thread.opened',
    thread_id: '11111111-1111-4111-8111-111111111111',
    author: { kind: 'human' },
    created_at: '2026-07-13T10:00:00.000Z',
    commit: null,
    dirty: false,
    anchor: { quote: 'texto', line_hint: 1, char_offset: 0 },
    commentType: 'nota',
    body: 'cuerpo del hilo',
    ...overrides,
  } as unknown as EventEnvelope;
}

test('project de lista vacía devuelve []', () => {
  assert.deepStrictEqual(project([]), []);
});

test('project de thread.opened devuelve un hilo con status open y messages[0].body correcto', () => {
  const ev = makeOpened();
  const result = project([ev]);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].status, 'open');
  assert.strictEqual(result[0].messages.length, 1);
  assert.strictEqual(result[0].messages[0].id, ev.id);
  assert.strictEqual(result[0].messages[0].body, 'cuerpo del hilo');
  assert.strictEqual(result[0].messages[0].retracted, false);
});

test('project aplica thread.status-changed y cambia status a resolved', () => {
  const tid = '22222222-2222-4222-8222-222222222222';
  const opened = makeOpened({ id: tid, thread_id: tid });
  const statusChanged: EventEnvelope = {
    id: '33333333-3333-4333-8333-333333333333',
    version: 2,
    type: 'thread.status-changed',
    thread_id: tid,
    author: { kind: 'human' },
    created_at: '2026-07-13T10:00:01.000Z',
    commit: null,
    dirty: false,
    to: 'resolved',
  };
  const result = project([opened, statusChanged]);
  assert.strictEqual(result[0].status, 'resolved');
});

test('project aplica thread.reanchored y actualiza el anchor', () => {
  const tid = '44444444-4444-4444-8444-444444444444';
  const opened = makeOpened({ id: tid, thread_id: tid });
  const newAnchor = { quote: 'nuevo texto', line_hint: 5, char_offset: 10 };
  const reanchored: EventEnvelope = {
    id: '55555555-5555-4555-8555-555555555555',
    version: 2,
    type: 'thread.reanchored',
    thread_id: tid,
    author: { kind: 'human' },
    created_at: '2026-07-13T10:00:01.000Z',
    commit: null,
    dirty: false,
    anchor: newAnchor,
  };
  const result = project([opened, reanchored]);
  assert.deepStrictEqual(result[0].anchor, newAnchor);
});

test('project aplica message.retracted: el mensaje queda en el array con retracted:true', () => {
  const tid = '66666666-6666-4666-8666-666666666666';
  const msgId = '77777777-7777-4777-8777-777777777777';
  const opened = makeOpened({ id: tid, thread_id: tid });
  const posted: EventEnvelope = {
    id: msgId,
    version: 2,
    type: 'message.posted',
    thread_id: tid,
    author: { kind: 'human' },
    created_at: '2026-07-13T10:00:01.000Z',
    commit: null,
    dirty: false,
    body: 'mensaje publicado',
  };
  const retracted: EventEnvelope = {
    id: '88888888-8888-4888-8888-888888888888',
    version: 2,
    type: 'message.retracted',
    thread_id: tid,
    author: { kind: 'human' },
    created_at: '2026-07-13T10:00:02.000Z',
    commit: null,
    dirty: false,
    target_message_id: msgId,
  };
  const result = project([opened, posted, retracted]);
  assert.strictEqual(result[0].messages.length, 2);
  const retractedMsg = result[0].messages.find(m => m.id === msgId);
  assert.ok(retractedMsg, 'el mensaje debe seguir presente en el array');
  assert.strictEqual(retractedMsg!.retracted, true);
});

test('project aplica message.posted: añade un mensaje al hilo', () => {
  const tid = '99999999-9999-4999-8999-999999999999';
  const opened = makeOpened({ id: tid, thread_id: tid });
  const posted: EventEnvelope = {
    id: 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
    version: 2, type: 'message.posted', thread_id: tid,
    author: { kind: 'human' }, created_at: '2026-07-13T10:00:01.000Z',
    commit: null, dirty: false, body: 'una respuesta',
  } as unknown as EventEnvelope;
  const result = project([opened, posted]);
  assert.strictEqual(result[0].messages.length, 2);
  assert.strictEqual(result[0].messages[1].body, 'una respuesta');
  assert.strictEqual(result[0].messages[1].retracted, false);
});

test('project aplica message.revised: reemplaza el body del mensaje objetivo', () => {
  const tid = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
  const msgId = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';
  const opened = makeOpened({ id: tid, thread_id: tid });
  const posted: EventEnvelope = {
    id: msgId, version: 2, type: 'message.posted', thread_id: tid,
    author: { kind: 'human' }, created_at: '2026-07-13T10:00:01.000Z',
    commit: null, dirty: false, body: 'texto original',
  } as unknown as EventEnvelope;
  const revised: EventEnvelope = {
    id: 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4', version: 2, type: 'message.revised',
    thread_id: tid, author: { kind: 'human' }, created_at: '2026-07-13T10:00:02.000Z',
    commit: null, dirty: false, target_message_id: msgId, body: 'texto revisado',
  } as unknown as EventEnvelope;
  const result = project([opened, posted, revised]);
  const msg = result[0].messages.find(m => m.id === msgId);
  assert.strictEqual(msg!.body, 'texto revisado');
});

test('project aplica thread.assigned: fija el assignee', () => {
  const tid = 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5';
  const opened = makeOpened({ id: tid, thread_id: tid });
  const assigned: EventEnvelope = {
    id: 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6', version: 2, type: 'thread.assigned',
    thread_id: tid, author: { kind: 'human' }, created_at: '2026-07-13T10:00:01.000Z',
    commit: null, dirty: false, agent: 'maths',
  } as unknown as EventEnvelope;
  const result = project([opened, assigned]);
  assert.strictEqual(result[0].assignee, 'maths');
});

test('project aplica thread.reanchored detached: ancla {detached:true} y status detached', () => {
  const tid = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
  const opened = makeOpened({ id: tid, thread_id: tid });
  const detached: EventEnvelope = {
    id: '1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b', version: 2, type: 'thread.reanchored',
    thread_id: tid, author: { kind: 'human' }, created_at: '2026-07-13T10:00:01.000Z',
    commit: null, dirty: false, detached: true,
  } as unknown as EventEnvelope;
  const result = project([opened, detached]);
  assert.deepStrictEqual(result[0].anchor, { detached: true });
  assert.strictEqual(result[0].status, 'detached');
});

test('project ordena thread.opened antes de una mutación en el mismo instante (aunque el id sea menor)', () => {
  const tid = '2c2c2c2c-2c2c-4c2c-8c2c-2c2c2c2c2c2c';
  const opened = makeOpened({ id: tid, thread_id: tid, created_at: '2026-07-13T10:00:00.000Z' });
  // status-changed con el MISMO created_at y un id lexicográficamente MENOR que el opened.
  // Con desempate solo por id se foldaría antes que el opened y se descartaría (skip
  // de hilo desconocido), dejando el hilo como 'open'. La prioridad de thread.opened
  // a igual instante garantiza que se aplique.
  const statusChanged: EventEnvelope = {
    id: '00000000-0000-4000-8000-000000000000', version: 2, type: 'thread.status-changed',
    thread_id: tid, author: { kind: 'human' }, created_at: '2026-07-13T10:00:00.000Z',
    commit: null, dirty: false, to: 'resolved',
  } as unknown as EventEnvelope;
  const result = project([statusChanged, opened]); // orden de entrada inverso a propósito
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].status, 'resolved');
});

// ---------------------------------------------------------------------------
// migrateV1 (F2)
// ---------------------------------------------------------------------------

const sidecarV1: Sidecar = {
  version: 1,
  file: 'docs/prueba.md',
  comments: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      anchor: { quote: 'párrafo uno', line_hint: 1, char_offset: 0 },
      type: 'nota',
      body: 'primera nota',
      status: 'open',
      created_at: '2026-07-13T09:00:00Z',
      updated_at: '2026-07-13T09:00:00Z',
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      anchor: { quote: 'párrafo dos', line_hint: 5, char_offset: 50 },
      type: 'sugerencia',
      body: 'sugerencia resuelta',
      status: 'resolved',
      created_at: '2026-07-13T09:01:00Z',
      updated_at: '2026-07-13T09:02:00Z',
    },
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      anchor: { quote: 'párrafo tres', line_hint: 10, char_offset: 100 },
      type: 'verifica',
      agent: 'security',
      body: 'verificar dato',
      status: 'open',
      created_at: '2026-07-13T09:03:00Z',
      updated_at: '2026-07-13T09:03:00Z',
    },
  ],
};

test('migrateV1 devuelve exactamente un thread.opened por comentario', () => {
  const events = migrateV1(sidecarV1);
  const opened = events.filter(e => e.type === 'thread.opened');
  assert.strictEqual(opened.length, sidecarV1.comments.length);
});

test('project(migrateV1) produce el mismo número de hilos que comments en el sidecar V1', () => {
  const threads = project(migrateV1(sidecarV1));
  assert.strictEqual(threads.length, sidecarV1.comments.length);
});

test('project(migrateV1) un comentario resuelto proyecta con status:resolved', () => {
  const threads = project(migrateV1(sidecarV1));
  const resolved = threads.find(t => t.thread_id === 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.ok(resolved, 'debe encontrarse el hilo');
  assert.strictEqual(resolved!.status, 'resolved');
});

test('project(migrateV1) un comentario con agent proyecta con assignee igual al agent', () => {
  const threads = project(migrateV1(sidecarV1));
  const assigned = threads.find(t => t.thread_id === 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  assert.ok(assigned, 'debe encontrarse el hilo');
  assert.strictEqual(assigned!.assignee, 'security');
});

// ---------------------------------------------------------------------------
// writeEvent / readEvents (F2 — IO)
// ---------------------------------------------------------------------------

test('readEvents en directorio inexistente devuelve []', async () => {
  const nonexistent = join(tmpdir(), 'mesh-review-nonexistent-' + Date.now());
  const result = await readEvents(nonexistent);
  assert.deepStrictEqual(result, []);
});

test('writeEvent escribe exactamente un fichero con nombre <id>.json', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-write-'));
  try {
    const ev = makeOpened({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      thread_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    });
    await writeEvent(dir, ev);
    const expectedPath = join(dir, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.json');
    const content = await readFile(expectedPath, 'utf8');
    const parsed = JSON.parse(content) as { id: string };
    assert.strictEqual(parsed.id, ev.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readEvents devuelve eventos ordenados por created_at asc, desempate por id', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-read-'));
  try {
    const ev1 = makeOpened({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
      thread_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
      created_at: '2026-07-13T10:00:01.000Z',
    });
    const ev2 = makeOpened({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002',
      thread_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002',
      created_at: '2026-07-13T10:00:02.000Z',
    });
    const ev3 = makeOpened({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0003',
      thread_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0003',
      created_at: '2026-07-13T10:00:00.000Z',
    });
    // Escribir en orden desordenado para forzar la ordenación
    await writeEvent(dir, ev2);
    await writeEvent(dir, ev1);
    await writeEvent(dir, ev3);
    const events = await readEvents(dir);
    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].id, ev3.id); // 10:00:00
    assert.strictEqual(events[1].id, ev1.id); // 10:00:01
    assert.strictEqual(events[2].id, ev2.id); // 10:00:02
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readEvents descarta un evento con line_hint no numérico', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-badhint-'));
  try {
    const bad = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0007',
      version: 2, type: 'thread.opened', thread_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0007',
      author: { kind: 'human' }, created_at: '2026-07-13T10:00:00.000Z',
      commit: null, dirty: false,
      anchor: { quote: 'x', line_hint: '42; rm -rf ~ #', char_offset: 0 },
      commentType: 'nota', body: 'x',
    };
    await writeFile(join(dir, `${bad.id}.json`), JSON.stringify(bad), 'utf8');
    const events = await readEvents(dir);
    assert.deepStrictEqual(events, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readEvents descarta un evento cuyo quote del ancla no es string', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-badquote-'));
  try {
    const bad = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0008',
      version: 2, type: 'thread.opened', thread_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0008',
      author: { kind: 'human' }, created_at: '2026-07-13T10:00:00.000Z',
      commit: null, dirty: false,
      anchor: { quote: 42, line_hint: 0, char_offset: 0 },
      commentType: 'nota', body: 'x',
    };
    await writeFile(join(dir, `${bad.id}.json`), JSON.stringify(bad), 'utf8');
    const events = await readEvents(dir);
    assert.deepStrictEqual(events, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readEvents descarta un evento con thread_id no-UUID', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-badtid-'));
  try {
    const bad = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0001',
      version: 2, type: 'thread.opened', thread_id: 'no-es-uuid',
      author: { kind: 'human' }, created_at: '2026-07-13T10:00:00.000Z',
      commit: null, dirty: false,
      anchor: { quote: 'x', line_hint: 0, char_offset: 0 },
      commentType: 'nota', body: 'x',
    };
    await writeFile(join(dir, `${bad.id}.json`), JSON.stringify(bad), 'utf8');
    const events = await readEvents(dir);
    assert.deepStrictEqual(events, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readEvents descarta un evento cuyo body no es string', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-badbody-'));
  try {
    const tid = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0002';
    const bad = {
      id: tid, version: 2, type: 'thread.opened', thread_id: tid,
      author: { kind: 'human' }, created_at: '2026-07-13T10:00:00.000Z',
      commit: null, dirty: false,
      anchor: { quote: 'x', line_hint: 0, char_offset: 0 },
      commentType: 'nota', body: { inyeccion: true },
    };
    await writeFile(join(dir, `${bad.id}.json`), JSON.stringify(bad), 'utf8');
    const events = await readEvents(dir);
    assert.deepStrictEqual(events, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readEvents conserva un evento V2 bien formado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-goodev-'));
  try {
    const tid = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0003';
    const good = makeOpened({ id: tid, thread_id: tid });
    await writeEvent(dir, good);
    const events = await readEvents(dir);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].thread_id, tid);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// detectLegacy (F2 — IO)
// ---------------------------------------------------------------------------

test('detectLegacy devuelve true cuando existe el fichero V1 y no el directorio V2', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesh-review-detect-'));
  try {
    const reviewDir = join(root, '.ai', 'review');
    await mkdir(reviewDir, { recursive: true });
    await writeFile(join(reviewDir, 'doc.md.json'), '{}', 'utf8');
    assert.strictEqual(await detectLegacy(root, 'doc.md'), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('detectLegacy devuelve false cuando existe el directorio V2', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesh-review-detect-'));
  try {
    await mkdir(join(root, '.ai', 'review', 'doc.md'), { recursive: true });
    assert.strictEqual(await detectLegacy(root, 'doc.md'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('detectLegacy devuelve false cuando no existe ni fichero V1 ni directorio V2', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesh-review-detect-'));
  try {
    assert.strictEqual(await detectLegacy(root, 'doc.md'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// ensureBacklogDir / writeBacklogTask (F2 — IO)
// ---------------------------------------------------------------------------

test('ensureBacklogDir crea el directorio .ai/backlog/ idempotentemente', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesh-review-backlog-'));
  try {
    await ensureBacklogDir(root);
    const s = await stat(join(root, '.ai', 'backlog'));
    assert.ok(s.isDirectory(), 'debe ser un directorio');
    await ensureBacklogDir(root); // segunda llamada no lanza
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('writeBacklogTask escribe el fichero de tarea en .ai/backlog/<id>.json', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesh-review-backlog-'));
  try {
    const task: BacklogTask = {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      doc: 'docs/prueba.md',
      session: '2026-07-13 docs/prueba.md',
      author: { kind: 'human' },
      commit: null,
      body: 'tarea pendiente de hacer',
    };
    await writeBacklogTask(root, task);
    const expectedPath = join(root, '.ai', 'backlog', 'ffffffff-ffff-4fff-8fff-ffffffffffff.json');
    const content = await readFile(expectedPath, 'utf8');
    const parsed = JSON.parse(content) as { id: string; body: string };
    assert.strictEqual(parsed.id, task.id);
    assert.strictEqual(parsed.body, task.body);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Gate F4 — guardas de path traversal (SEC#1/#2/#3) y cobertura (REV#4)
// ---------------------------------------------------------------------------

test('isUuid acepta un UUID canónico y rechaza traversal / cadena arbitraria', () => {
  assert.ok(isUuid('11111111-1111-4111-8111-111111111111'));
  assert.ok(!isUuid('../../.ssh/evil'));
  assert.ok(!isUuid('no-es-un-uuid'));
  assert.ok(!isUuid(''));
  assert.ok(!isUuid('11111111-1111-4111-8111-111111111111/../x'));
});

test('writeEvent rechaza un id que no es UUID sin escribir ningún fichero', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-guard-'));
  try {
    const evil = makeOpened({ id: '../../escape', thread_id: '../../escape' });
    await assert.rejects(() => writeEvent(dir, evil), /id de evento inválido/);
    // El directorio de eventos queda vacío: nada escapó ni se escribió dentro.
    const entries = await readdir(dir).catch(() => []);
    assert.deepStrictEqual(entries, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('writeBacklogTask rechaza un task.id que no es UUID', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesh-review-guard-'));
  try {
    const task = {
      id: '../../evil',
      session: '2026-07-13 docs/prueba.md',
      author: { kind: 'human' },
      commit: null,
      body: 'x',
    } as unknown as BacklogTask;
    await assert.rejects(() => writeBacklogTask(root, task), /id de tarea inválido/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('migrateV1 descarta comentarios con id no-UUID y conserva los válidos', () => {
  const hostile: Sidecar = {
    version: 1,
    file: 'docs/prueba.md',
    comments: [
      {
        id: '../../.ssh/authorized_keys',
        anchor: { quote: 'x', line_hint: 1, char_offset: 0 },
        type: 'nota',
        body: 'hostil',
        status: 'open',
        created_at: '2026-07-13T09:00:00Z',
        updated_at: '2026-07-13T09:00:00Z',
      },
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        anchor: { quote: 'y', line_hint: 2, char_offset: 0 },
        type: 'nota',
        body: 'válido',
        status: 'open',
        created_at: '2026-07-13T09:01:00Z',
        updated_at: '2026-07-13T09:01:00Z',
      },
    ],
  } as unknown as Sidecar;
  const events = migrateV1(hostile);
  const opened = events.filter((e) => e.type === 'thread.opened');
  assert.strictEqual(opened.length, 1);
  assert.strictEqual(opened[0].id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  // Ningún evento generado arrastra el id hostil (que sería nombre de fichero).
  assert.ok(events.every((e) => e.id !== '../../.ssh/authorized_keys'));
});

test('addToGitExclude compara por línea: una subcadena en un comentario no suprime la entrada', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-git-'));
  try {
    const excludeDir = join(dir, '.git', 'info');
    await mkdir(excludeDir, { recursive: true });
    // Línea que contiene '.ai/review/' como subcadena pero NO es la entrada real.
    await writeFile(
      join(excludeDir, 'exclude'),
      '# nota sobre .ai/review/ para el equipo\n',
      'utf8'
    );
    await addToGitExclude(dir); // .ai/review/
    const lines = (await readFile(join(excludeDir, 'exclude'), 'utf8'))
      .split('\n')
      .map((l) => l.trim());
    assert.ok(
      lines.includes('.ai/review/'),
      'la entrada real debe añadirse pese a la subcadena en el comentario'
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('fallbackEventDir incluye el sha256 de la ruta absoluta y es un directorio', () => {
  const docPath = '/home/user/docs/fuera-de-repo.md';
  const expected = join(homedir(), '.local', 'state', 'mesh-review', sha256hex(docPath));
  assert.strictEqual(fallbackEventDir(docPath), expected);
  assert.ok(!fallbackEventDir(docPath).endsWith('.json')); // directorio, no fichero plano
});

test('fallbackEventDir: rutas distintas producen directorios distintos', () => {
  assert.notStrictEqual(fallbackEventDir('/a/doc.md'), fallbackEventDir('/b/doc.md'));
});

// ---------------------------------------------------------------------------
// project — commit y openedCommit (Fase commit-por-comentario)
// ---------------------------------------------------------------------------

test('project rellena openedCommit desde ev.commit del thread.opened', () => {
  const tid = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
  const ev = makeOpened({ id: tid, thread_id: tid, commit: 'abc1234' });
  const result = project([ev]);
  assert.strictEqual(result[0].openedCommit, 'abc1234');
});

test('project rellena openedCommit como null cuando ev.commit es null', () => {
  const tid = 'b3b3b3b3-b3b3-4b3b-8b3b-b3b3b3b3b3b3';
  const ev = makeOpened({ id: tid, thread_id: tid, commit: null });
  const result = project([ev]);
  assert.strictEqual(result[0].openedCommit, null);
});

test('project rellena commit en messages[0] desde el thread.opened', () => {
  const tid = 'c4c4c4c4-c4c4-4c4c-8c4c-c4c4c4c4c4c4';
  const ev = makeOpened({ id: tid, thread_id: tid, commit: 'def5678' });
  const result = project([ev]);
  assert.strictEqual(result[0].messages[0].commit, 'def5678');
});

test('project rellena commit null en messages[0] cuando thread.opened tiene commit null', () => {
  const tid = 'd5d5d5d5-d5d5-4d5d-8d5d-d5d5d5d5d5d5';
  const ev = makeOpened({ id: tid, thread_id: tid, commit: null });
  const result = project([ev]);
  assert.strictEqual(result[0].messages[0].commit, null);
});

test('project rellena commit en message.posted con el SHA del evento', () => {
  const tid = 'e6e6e6e6-e6e6-4e6e-8e6e-e6e6e6e6e6e6';
  const opened = makeOpened({ id: tid, thread_id: tid });
  const posted: EventEnvelope = {
    id: 'f7f7f7f7-f7f7-4f7f-8f7f-f7f7f7f7f7f7',
    version: 2, type: 'message.posted', thread_id: tid,
    author: { kind: 'ai', model: 'claude-sonnet' },
    created_at: '2026-07-13T10:00:01.000Z',
    commit: 'abc9999', dirty: false, body: 'fix aplicado',
  } as unknown as EventEnvelope;
  const result = project([opened, posted]);
  assert.strictEqual(result[0].messages[1].commit, 'abc9999');
});

test('project rellena commit null en message.posted sin SHA', () => {
  const tid = '07070707-0707-4707-8707-070707070707';
  const opened = makeOpened({ id: tid, thread_id: tid });
  const posted: EventEnvelope = {
    id: '18181818-1818-4181-8181-181818181818',
    version: 2, type: 'message.posted', thread_id: tid,
    author: { kind: 'human' }, created_at: '2026-07-13T10:00:01.000Z',
    commit: null, dirty: false, body: 'respuesta humana',
  } as unknown as EventEnvelope;
  const result = project([opened, posted]);
  assert.strictEqual(result[0].messages[1].commit, null);
});

// ---------------------------------------------------------------------------
// F5-a — VALID_COMMENT_TYPES y guarda de commentType en project()
// ---------------------------------------------------------------------------

test('VALID_COMMENT_TYPES contiene los 7 tipos del schema y no contiene desconocido', () => {
  const expected = ['edita', 'sugerencia', 'pregunta', 'verifica', 'nota', 'referencia', 'supuesto'];
  for (const t of expected) {
    assert.ok(VALID_COMMENT_TYPES.has(t), `${t} debe estar en VALID_COMMENT_TYPES`);
  }
  assert.ok(!VALID_COMMENT_TYPES.has('desconocido'), 'desconocido no debe estar en VALID_COMMENT_TYPES');
  assert.strictEqual(VALID_COMMENT_TYPES.size, 7, 'debe haber exactamente 7 tipos');
});

test('project() con commentType desconocido no lanza y devuelve el hilo con ese valor', () => {
  const tid = 'f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0';
  const ev = makeOpened({ id: tid, thread_id: tid, commentType: 'desconocido' });
  // No debe lanzar aunque el tipo no sea válido
  const result = project([ev]);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].thread_id, tid);
  assert.strictEqual(result[0].commentType as string, 'desconocido');
});

// ---------------------------------------------------------------------------
// F2 — buildV1FilePath: helper centralizado con validación de contención
// ---------------------------------------------------------------------------

test('buildV1FilePath devuelve la ruta correcta para un docRelPath normal', () => {
  assert.strictEqual(
    buildV1FilePath('/Users/user/project', 'docs/informe.md'),
    '/Users/user/project/.ai/review/docs/informe.md.json'
  );
});

test('buildV1FilePath lanza si docRelPath empieza por ..', () => {
  assert.throws(
    () => buildV1FilePath('/project', '../evil/doc.md'),
    /mesh-review: document path escapes/
  );
});

test('buildV1FilePath lanza si docRelPath es absoluto', () => {
  assert.throws(
    () => buildV1FilePath('/project', '/absolute/path.md'),
    /mesh-review: document path escapes/
  );
});

test('buildV1FilePath lanza si docRelPath usa .. embebido (foo/../../bar) para escapar de .ai/review/', () => {
  // 'foo/../../bar' no empieza por '..' pero path.resolve lo normaliza a
  // <gitRoot>/.ai/bar.json, que queda fuera de <gitRoot>/.ai/review/.
  assert.throws(
    () => buildV1FilePath('/project', 'foo/../../bar'),
    /mesh-review: document path escapes/
  );
});

// ---------------------------------------------------------------------------
// F1 — readEvents con onError: distingue ENOENT de errores reales
// ---------------------------------------------------------------------------

test('readEvents sin onError no lanza cuando un fichero no puede parsearse (compatibilidad)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-compat-'));
  try {
    await writeFile(join(dir, 'malformed.json'), 'esto no es json válido', 'utf8');
    // Sin onError debe devolver [] sin lanzar
    const result = await readEvents(dir);
    assert.deepStrictEqual(result, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readEvents con onError llama al callback cuando el fichero es ilegible por permisos (no ENOENT)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-perms-'));
  const filePath = join(dir, 'locked.json');
  try {
    const tid = 'eeeeeeee-eeee-4eee-8eee-eeeeeeee0099';
    const ev = makeOpened({ id: tid, thread_id: tid });
    await writeFile(filePath, JSON.stringify(ev), 'utf8');
    await chmod(filePath, 0o000); // quita todos los permisos → EACCES

    const errors: Array<{ file: string; err: unknown }> = [];
    const result = await readEvents(dir, (file, err) => errors.push({ file, err }));

    assert.deepStrictEqual(result, []);
    assert.strictEqual(errors.length, 1, 'debe haber exactamente un error reportado');
    assert.ok(errors[0].file.endsWith('locked.json'), 'el fichero reportado debe ser locked.json');

    await chmod(filePath, 0o644); // restaurar para que rm funcione
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readEvents con onError no llama al callback cuando el fichero no existe (ENOENT)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-review-enoent-'));
  try {
    // Symlink apuntando a un fichero inexistente: readdir lo ve (.json),
    // readFile falla con ENOENT porque el destino no existe.
    await symlink(join(dir, 'nonexistent-target.json'), join(dir, 'dangling.json'));

    const errors: Array<{ file: string; err: unknown }> = [];
    const result = await readEvents(dir, (file, err) => errors.push({ file, err }));

    assert.deepStrictEqual(result, []);
    assert.strictEqual(errors.length, 0, 'ENOENT no debe llamar a onError');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// anchorChanged
// ---------------------------------------------------------------------------

test('anchorChanged devuelve false si quote, line_hint y char_offset son iguales', () => {
  const a: Anchor = { quote: 'texto de prueba', line_hint: 5, char_offset: 100 };
  const b: Anchor = { quote: 'texto de prueba', line_hint: 5, char_offset: 100 };
  assert.strictEqual(anchorChanged(a, b), false);
});

test('anchorChanged devuelve true si char_offset cambia', () => {
  const a: Anchor = { quote: 'texto', line_hint: 3, char_offset: 100 };
  const b: Anchor = { quote: 'texto', line_hint: 3, char_offset: 108 };
  assert.strictEqual(anchorChanged(a, b), true);
});

test('anchorChanged devuelve true si line_hint cambia', () => {
  const a: Anchor = { quote: 'texto', line_hint: 3, char_offset: 100 };
  const b: Anchor = { quote: 'texto', line_hint: 4, char_offset: 100 };
  assert.strictEqual(anchorChanged(a, b), true);
});

test('anchorChanged devuelve true si quote cambia', () => {
  const a: Anchor = { quote: 'texto original', line_hint: 3, char_offset: 100 };
  const b: Anchor = { quote: 'texto distinto', line_hint: 3, char_offset: 100 };
  assert.strictEqual(anchorChanged(a, b), true);
});

test('anchorChanged devuelve true si el primer argumento es detached y el segundo no', () => {
  const anclado: Anchor = { quote: 'texto', line_hint: 2, char_offset: 50 };
  const desanclado = { detached: true as const };
  assert.strictEqual(anchorChanged(desanclado, anclado), true);
});

test('anchorChanged devuelve true si el segundo argumento es detached y el primero no', () => {
  const anclado: Anchor = { quote: 'texto', line_hint: 2, char_offset: 50 };
  const desanclado = { detached: true as const };
  assert.strictEqual(anchorChanged(anclado, desanclado), true);
});

test('anchorChanged devuelve false si ambos son detached', () => {
  const a = { detached: true as const };
  const b = { detached: true as const };
  assert.strictEqual(anchorChanged(a, b), false);
});

// ---------------------------------------------------------------------------
// Ciclo de ida y vuelta de thread.reanchored (contrato extensión → skill)
// Fija que writeEvent + readEvents + project reproduzca correctamente ambas
// variantes del evento: con anchor nuevo y con detached:true.
// ---------------------------------------------------------------------------

test('thread.reanchored variante anchor: writeEvent→readEvents→project refleja el ancla nueva', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-reanchor-anchor-'));
  try {
    const threadId = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
    const openedId  = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
    const reanchorId = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3';

    const opened: EventEnvelope = {
      id: openedId, version: 2, type: 'thread.opened', thread_id: threadId,
      author: { kind: 'human' },
      created_at: '2026-07-16T10:00:00.000Z',
      commit: null, dirty: false,
      anchor: { quote: 'texto original', line_hint: 0, char_offset: 5 },
      commentType: 'nota', body: 'comentario de prueba',
    };

    const reanchored: EventEnvelope = {
      id: reanchorId, version: 2, type: 'thread.reanchored', thread_id: threadId,
      author: { kind: 'human', name: 'test-user' },
      created_at: '2026-07-16T10:01:00.000Z',
      commit: null, dirty: false,
      anchor: { quote: 'texto original', line_hint: 3, char_offset: 120 },
    };

    await writeEvent(dir, opened);
    await writeEvent(dir, reanchored);

    const events = await readEvents(dir);
    const projections = project(events);

    assert.strictEqual(projections.length, 1);
    const proj = projections[0];

    // La proyección debe reflejar el ancla nueva del thread.reanchored
    assert.ok(!('detached' in proj.anchor), 'el ancla no debe ser detached');
    const anchor = proj.anchor as Anchor;
    assert.strictEqual(anchor.char_offset, 120, 'char_offset actualizado');
    assert.strictEqual(anchor.line_hint, 3, 'line_hint actualizado');
    assert.strictEqual(anchor.quote, 'texto original', 'quote preservada');
    assert.strictEqual(proj.status, 'open', 'el hilo sigue abierto tras reanclado');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('thread.reanchored variante detached: writeEvent→readEvents→project refleja estado desanclado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-reanchor-detached-'));
  try {
    const threadId  = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4';
    const openedId  = 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5';
    const reanchorId = 'f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6';

    const opened: EventEnvelope = {
      id: openedId, version: 2, type: 'thread.opened', thread_id: threadId,
      author: { kind: 'human' },
      created_at: '2026-07-16T10:00:00.000Z',
      commit: null, dirty: false,
      anchor: { quote: 'texto a desanclar', line_hint: 1, char_offset: 20 },
      commentType: 'edita', body: 'hilo que perderá su ancla',
    };

    const reanchored: EventEnvelope = {
      id: reanchorId, version: 2, type: 'thread.reanchored', thread_id: threadId,
      author: { kind: 'human', name: 'test-user' },
      created_at: '2026-07-16T10:01:00.000Z',
      commit: null, dirty: false,
      detached: true,
    };

    await writeEvent(dir, opened);
    await writeEvent(dir, reanchored);

    const events = await readEvents(dir);
    const projections = project(events);

    assert.strictEqual(projections.length, 1);
    const proj = projections[0];

    assert.ok('detached' in proj.anchor, 'el ancla debe ser { detached: true }');
    assert.strictEqual(proj.status, 'detached', 'el estado del hilo debe ser detached');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// P5 — ciclos de ida y vuelta: thread.opened con confidence + thread.assigned
// Fija que writeEvent + readEvents + project reproduzca los campos opcionales
// confidence (thread.opened) y agent (thread.assigned) correctamente.
// ---------------------------------------------------------------------------

test('thread.opened con confidence: writeEvent→readEvents→project refleja la confianza', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-confidence-'));
  try {
    const tid = 'e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1';
    const opened: EventEnvelope = {
      id: tid, version: 2, type: 'thread.opened', thread_id: tid,
      author: { kind: 'human' },
      created_at: '2026-07-16T11:00:00.000Z',
      commit: null, dirty: false,
      anchor: { quote: 'texto de prueba', line_hint: 5, char_offset: 50 },
      commentType: 'verifica', body: 'comprueba la afirmación',
      confidence: 'alta',
    };

    await writeEvent(dir, opened);
    const events = await readEvents(dir);
    const projections = project(events);

    assert.strictEqual(projections.length, 1);
    assert.strictEqual(projections[0].confidence, 'alta', 'confidence debe propagarse tras el ciclo completo');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('thread.assigned: writeEvent→readEvents→project refleja el agente asignado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mesh-assigned-'));
  try {
    const tid = 'f2f2f2f2-f2f2-4f2f-8f2f-f2f2f2f2f2f2';
    const eid = 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3';

    const opened: EventEnvelope = {
      id: tid, version: 2, type: 'thread.opened', thread_id: tid,
      author: { kind: 'human' },
      created_at: '2026-07-16T11:00:00.000Z',
      commit: null, dirty: false,
      anchor: { quote: 'texto asignado', line_hint: 2, char_offset: 10 },
      commentType: 'edita', body: 'tarea para el revisor',
    };

    const assigned: EventEnvelope = {
      id: eid, version: 2, type: 'thread.assigned', thread_id: tid,
      author: { kind: 'human' },
      created_at: '2026-07-16T11:01:00.000Z',
      commit: null, dirty: false,
      agent: 'security',
    };

    await writeEvent(dir, opened);
    await writeEvent(dir, assigned);

    const events = await readEvents(dir);
    const projections = project(events);

    assert.strictEqual(projections.length, 1);
    assert.strictEqual(projections[0].assignee, 'security', 'assignee debe propagarse tras el ciclo completo');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// P6 — scanAllDocs: escaneo multi-fichero del workspace
// ---------------------------------------------------------------------------

/** Escribe un evento thread.opened mínimo en el directorio de eventos dado. */
async function writeMinimalEvent(eventDir: string, threadId: string): Promise<void> {
  await mkdir(eventDir, { recursive: true });
  const ev: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'thread.opened',
    thread_id: threadId,
    author: { kind: 'human' },
    created_at: '2026-07-16T10:00:00.000Z',
    commit: null,
    dirty: false,
    commentType: 'nota',
    anchor: { quote: 'texto', line_hint: 0, char_offset: 0 },
    body: 'comentario',
  };
  await writeFile(join(eventDir, `${ev.id}.json`), JSON.stringify(ev, null, 2) + '\n', 'utf8');
}

import { randomUUID } from 'node:crypto';

test('scanAllDocs con directorio .ai/review/ inexistente devuelve mapa vacío', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesh-scan-'));
  try {
    const result = await scanAllDocs(root);
    assert.strictEqual(result.docs.size, 0, 'docs debe estar vacío');
    assert.strictEqual(result.overflow, 0, 'overflow debe ser 0');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scanAllDocs con dos subdirectorios devuelve Map con dos entradas', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesh-scan-'));
  try {
    const tid1 = randomUUID();
    const tid2 = randomUUID();
    // Doc: README.md → eventDir: .ai/review/README.md/
    await writeMinimalEvent(join(root, '.ai', 'review', 'README.md'), tid1);
    // Doc: src/foo.ts → eventDir: .ai/review/src/foo.ts/
    await writeMinimalEvent(join(root, '.ai', 'review', 'src', 'foo.ts'), tid2);

    const result = await scanAllDocs(root);

    assert.strictEqual(result.docs.size, 2, 'debe devolver 2 entradas');
    assert.strictEqual(result.overflow, 0, 'no debe haber overflow');
    assert.ok(result.docs.has('README.md'),  'debe incluir README.md');
    assert.ok(result.docs.has('src/foo.ts'), 'debe incluir src/foo.ts');

    // Las proyecciones del primer doc deben tener un hilo
    const readmeProj = result.docs.get('README.md');
    assert.ok(Array.isArray(readmeProj), 'las proyecciones de README.md deben ser array');
    assert.strictEqual(readmeProj!.length, 1, 'README.md debe tener 1 hilo');
    assert.strictEqual(readmeProj![0].thread_id, tid1, 'el thread_id debe coincidir');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scanAllDocs respeta el tope de SCAN_ALL_DOCS_LIMIT documentos', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesh-scan-'));
  try {
    // Crea SCAN_ALL_DOCS_LIMIT + 5 documentos
    const total = SCAN_ALL_DOCS_LIMIT + 5;
    for (let i = 0; i < total; i++) {
      const docName = `doc${String(i).padStart(3, '0')}.md`;
      await writeMinimalEvent(join(root, '.ai', 'review', docName), randomUUID());
    }

    const result = await scanAllDocs(root);

    assert.strictEqual(result.docs.size, SCAN_ALL_DOCS_LIMIT, `docs no debe superar el tope (${SCAN_ALL_DOCS_LIMIT})`);
    assert.strictEqual(result.overflow, 5, 'overflow debe ser 5');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scanAllDocs solo incluye hilos abiertos del documento escaneado', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mesh-scan-'));
  try {
    const openId    = randomUUID();
    const resolvedId = randomUUID();
    const eventDir  = join(root, '.ai', 'review', 'doc.md');
    await mkdir(eventDir, { recursive: true });

    // Hilo abierto
    const evOpen: EventEnvelope = {
      id: randomUUID(), version: 2, type: 'thread.opened',
      thread_id: openId, author: { kind: 'human' },
      created_at: '2026-07-16T10:00:00.000Z', commit: null, dirty: false,
      commentType: 'nota', anchor: { quote: 'a', line_hint: 0, char_offset: 0 }, body: 'ok',
    };
    // Hilo que se resuelve
    const evResOpen: EventEnvelope = {
      id: randomUUID(), version: 2, type: 'thread.opened',
      thread_id: resolvedId, author: { kind: 'human' },
      created_at: '2026-07-16T10:01:00.000Z', commit: null, dirty: false,
      commentType: 'nota', anchor: { quote: 'b', line_hint: 1, char_offset: 5 }, body: 'ok',
    };
    const evResolve: EventEnvelope = {
      id: randomUUID(), version: 2, type: 'thread.status-changed',
      thread_id: resolvedId, author: { kind: 'human' },
      created_at: '2026-07-16T10:02:00.000Z', commit: null, dirty: false,
      to: 'resolved',
    };
    await writeFile(join(eventDir, `${evOpen.id}.json`),    JSON.stringify(evOpen, null, 2) + '\n', 'utf8');
    await writeFile(join(eventDir, `${evResOpen.id}.json`), JSON.stringify(evResOpen, null, 2) + '\n', 'utf8');
    await writeFile(join(eventDir, `${evResolve.id}.json`), JSON.stringify(evResolve, null, 2) + '\n', 'utf8');

    const result = await scanAllDocs(root);

    assert.strictEqual(result.docs.size, 1, 'debe haber 1 doc');
    const projections = result.docs.get('doc.md');
    assert.ok(projections, 'debe tener proyecciones para doc.md');
    assert.strictEqual(projections!.length, 2, 'debe tener 2 hilos (abierto y resuelto)');
    // project() devuelve todos los hilos, la sección multi-fichero filtra los abiertos
    const open = projections!.filter(p => p.status === 'open');
    assert.strictEqual(open.length, 1, 'solo 1 hilo abierto');
    assert.strictEqual(open[0].thread_id, openId, 'el hilo abierto es el correcto');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scanAllDocs no recursa más allá de 20 niveles de profundidad (fix 2)', async () => {
  // collectEventDirs para cuando maxDepth <= 0: una jerarquía de 22 niveles
  // no debe encontrar el directorio de eventos que está en el nivel 21.
  const root = await mkdtemp(join(tmpdir(), 'mesh-depth-'));
  try {
    // Construye: .ai/review/a/b/c/.../doc.md/ (21 componentes bajo .ai/review/)
    // Con maxDepth=20 el walker se detiene y NO alcanza el directorio de eventos.
    let deepDir = join(root, '.ai', 'review');
    for (let i = 0; i < 21; i++) {
      deepDir = join(deepDir, `lvl${i}`);
    }
    await mkdir(deepDir, { recursive: true });
    await writeFile(join(deepDir, `${randomUUID()}.json`), '{}', 'utf8');

    const result = await scanAllDocs(root);

    assert.strictEqual(result.docs.size, 0, 'no debe encontrar docs más allá de 20 niveles');
    assert.strictEqual(result.overflow, 0, 'no debe haber overflow');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scanAllDocs salta en silencio el evento corrupto y procesa los demás documentos (fix 7)', async () => {
  // Documenta el comportamiento actual de readEvents: un fichero .json inválido en el
  // directorio de eventos de un documento se descarta silenciosamente (parse error
  // capturado internamente); el documento puede aparecer en el mapa con 0 proyecciones
  // si todos sus eventos eran inválidos. El resto de documentos se procesan con normalidad.
  const root = await mkdtemp(join(tmpdir(), 'mesh-scan-'));
  try {
    const validId = randomUUID();

    // Doc válido: un evento bien formado
    await writeMinimalEvent(join(root, '.ai', 'review', 'valid.md'), validId);

    // Doc corrupto: fichero JSON inválido en su directorio de eventos
    const corruptEventDir = join(root, '.ai', 'review', 'corrupt.md');
    await mkdir(corruptEventDir, { recursive: true });
    await writeFile(join(corruptEventDir, `${randomUUID()}.json`), 'esto no es json', 'utf8');

    const errors: Array<{ file: string; err: unknown }> = [];
    const result = await scanAllDocs(root, (file, err) => errors.push({ file, err }));

    // El documento válido se proyecta correctamente
    assert.ok(result.docs.has('valid.md'), 'el documento válido debe aparecer en el mapa');
    const proj = result.docs.get('valid.md');
    assert.ok(Array.isArray(proj) && proj.length === 1, 'valid.md debe tener 1 proyección');
    assert.strictEqual(proj![0].thread_id, validId, 'el thread_id debe coincidir');

    // El doc corrupto puede estar en el mapa (readEvents retorna []) pero con 0 proyecciones:
    // el evento inválido fue descartado silenciosamente por readEvents.
    if (result.docs.has('corrupt.md')) {
      const corruptProj = result.docs.get('corrupt.md');
      assert.ok(Array.isArray(corruptProj) && corruptProj.length === 0,
        'el documento corrupto debe tener 0 proyecciones (el evento inválido se descartó)');
    }
    // scanAllDocs no lanza incluso con JSON inválido en disco
    assert.strictEqual(result.overflow, 0, 'no debe haber overflow');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Fase 9.1 — confidence del reviser en MessageProjection
// ---------------------------------------------------------------------------

test('project propaga confidence de message.posted al MessageProjection', () => {
  const tid = '29292929-2929-4292-8929-292929292929';
  const opened = makeOpened({ id: tid, thread_id: tid });
  const posted: EventEnvelope = {
    id: '3a3a3a3a-3a3a-4a3a-8a3a-3a3a3a3a3a3a',
    version: 2, type: 'message.posted', thread_id: tid,
    author: { kind: 'ai', model: 'claude-sonnet', subagent: 'reviser' },
    created_at: '2026-07-16T10:00:01.000Z',
    commit: null, dirty: false, body: 'análisis completado',
    confidence: 'alta',
  } as unknown as EventEnvelope;
  const result = project([opened, posted]);
  assert.strictEqual(result[0].messages[1].confidence, 'alta');
});

test('project no fija confidence en MessageProjection cuando el evento no la trae', () => {
  const tid = '4b4b4b4b-4b4b-4b4b-8b4b-4b4b4b4b4b4b';
  const opened = makeOpened({ id: tid, thread_id: tid });
  const posted: EventEnvelope = {
    id: '5c5c5c5c-5c5c-4c5c-8c5c-5c5c5c5c5c5c',
    version: 2, type: 'message.posted', thread_id: tid,
    author: { kind: 'ai', model: 'claude-sonnet' },
    created_at: '2026-07-16T10:00:01.000Z',
    commit: null, dirty: false, body: 'sin confianza',
  } as unknown as EventEnvelope;
  const result = project([opened, posted]);
  assert.strictEqual(result[0].messages[1].confidence, undefined);
});

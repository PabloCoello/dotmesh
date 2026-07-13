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

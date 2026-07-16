/**
 * cli.test.ts — tests del CLI mesh-review con node:test.
 *
 * Cubre:
 *   - Proyección sobre fixture V2 (project + readEvents).
 *   - isPending: los tres casos accionables y el caso de exclusión.
 *   - emit message.posted produce un fichero que readEvents no descarta.
 *   - Roundtrip emit → project: el evento emitido reaparece en la proyección.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { readEvents, project, utcTimestampMs, type EventEnvelope, type ThreadProjection } from '../sidecar.ts';
import { isPending } from './commands/project.ts';
import { emitEvent, parseKvPairs } from './commands/emit.ts';

// ---------------------------------------------------------------------------
// Helpers de fixtures
// ---------------------------------------------------------------------------

function makeOpened(threadId: string, offset = 0): EventEnvelope {
  return {
    id: randomUUID(),
    version: 2,
    type: 'thread.opened',
    thread_id: threadId,
    author: { kind: 'human' },
    created_at: new Date(Date.now() + offset).toISOString(),
    commit: null,
    dirty: false,
    anchor: { quote: 'texto de prueba', line_hint: 0, char_offset: 0 },
    commentType: 'edita',
    body: 'Comentario de prueba',
  };
}

function makeAiFix(threadId: string, sha: string, offset = 1000): EventEnvelope {
  return {
    id: randomUUID(),
    version: 2,
    type: 'message.posted',
    thread_id: threadId,
    author: { kind: 'ai', model: 'claude-sonnet-4-6' },
    created_at: new Date(Date.now() + offset).toISOString(),
    commit: sha,
    dirty: false,
    body: 'Corrección aplicada.',
  };
}

function makeHumanReply(threadId: string, offset = 2000): EventEnvelope {
  return {
    id: randomUUID(),
    version: 2,
    type: 'message.posted',
    thread_id: threadId,
    author: { kind: 'human' },
    created_at: new Date(Date.now() + offset).toISOString(),
    commit: null,
    dirty: false,
    body: 'Por favor revisa también esto.',
  };
}

function makeAssigned(threadId: string, agent: string, offset = 3000): EventEnvelope {
  return {
    id: randomUUID(),
    version: 2,
    type: 'thread.assigned',
    thread_id: threadId,
    author: { kind: 'human' },
    created_at: new Date(Date.now() + offset).toISOString(),
    commit: null,
    dirty: false,
    agent,
  };
}

// ---------------------------------------------------------------------------
// project sobre fixture V2
// ---------------------------------------------------------------------------

test('project devuelve la proyección correcta de un fixture V2', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-cli-proj-'));
  try {
    const tid = randomUUID();
    const openedEv = makeOpened(tid);
    await emitEvent(dir, openedEv);

    const events = await readEvents(dir);
    assert.strictEqual(events.length, 1, 'readEvents devuelve 1 evento');

    const threads = project(events);
    assert.strictEqual(threads.length, 1, 'project devuelve 1 hilo');
    assert.strictEqual(threads[0].thread_id, tid);
    assert.strictEqual(threads[0].status, 'open');
    assert.strictEqual(threads[0].commentType, 'edita');
    assert.strictEqual(threads[0].messages[0].body, 'Comentario de prueba');
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// isPending — caso (a): sin fix IA previo
// ---------------------------------------------------------------------------

test('isPending (a): hilo abierto sin fix IA → accionable', () => {
  const tid = randomUUID();
  const openedEv = makeOpened(tid);
  const [thread] = project([openedEv]);
  assert.ok(thread, 'hilo proyectado existe');
  assert.strictEqual(isPending(thread), true, 'sin fix IA → pending');
});

test('isPending (a): hilo abierto con mensaje IA sin commit (no es fix) → accionable', () => {
  const tid = randomUUID();
  const openedEv = makeOpened(tid, 0);
  // Mensaje IA pero sin commit → no es un "fix IA"
  const aiNoFix: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'message.posted',
    thread_id: tid,
    author: { kind: 'ai', model: 'test-model' },
    created_at: new Date(Date.now() + 1000).toISOString(),
    commit: null,  // no commit → no es fix
    dirty: false,
    body: 'Pregunta de aclaración.',
  };
  const [thread] = project([openedEv, aiNoFix]);
  assert.strictEqual(isPending(thread), true, 'sin fix IA (commit=null) → pending');
});

// ---------------------------------------------------------------------------
// isPending — caso (b): iteración §7
// ---------------------------------------------------------------------------

test('isPending (b): humano respondió después del fix IA → accionable', () => {
  const tid = randomUUID();
  const openedEv = makeOpened(tid, 0);
  const aiFixEv = makeAiFix(tid, 'abc1234', 1000);
  const humanReplyEv = makeHumanReply(tid, 2000);
  const [thread] = project([openedEv, aiFixEv, humanReplyEv]);
  assert.strictEqual(isPending(thread), true, 'humano tras fix IA → pending');
});

// ---------------------------------------------------------------------------
// isPending — caso (c): asignación tras último mensaje IA
// ---------------------------------------------------------------------------

test('isPending (c): asignado y último mensaje es IA → accionable', () => {
  const tid = randomUUID();
  const openedEv = makeOpened(tid, 0);
  const aiFixEv = makeAiFix(tid, 'abc1234', 1000);
  // Asignación tras el fix IA
  const assignedEv = makeAssigned(tid, 'reviser', 2000);
  const [thread] = project([openedEv, aiFixEv, assignedEv]);
  // Último mensaje no retractado sigue siendo el fix IA
  const lastNonRetracted = thread.messages.filter(m => !m.retracted).at(-1);
  assert.strictEqual(lastNonRetracted?.author.kind, 'ai', 'último mensaje es IA');
  assert.ok(thread.assignee, 'hilo tiene assignee');
  assert.strictEqual(isPending(thread), true, 'asignado + último IA → pending');
});

// ---------------------------------------------------------------------------
// isPending — caso de exclusión: último mensaje no retractado es IA, sin assignee
// ---------------------------------------------------------------------------

test('isPending exclusión: último no retractado es IA (sin asignación) → no accionable', () => {
  const tid = randomUUID();
  const openedEv = makeOpened(tid, 0);
  const aiFixEv = makeAiFix(tid, 'abc1234', 1000);
  // Sin human reply, sin assignee → el último mensaje es el fix IA
  const [thread] = project([openedEv, aiFixEv]);
  assert.strictEqual(thread.assignee, undefined, 'sin assignee');
  const lastNonRetracted = thread.messages.filter(m => !m.retracted).at(-1);
  assert.strictEqual(lastNonRetracted?.author.kind, 'ai', 'último mensaje es IA');
  assert.strictEqual(isPending(thread), false, 'último IA sin asignación → NOT pending');
});

test('isPending exclusión: hilo resuelto → no accionable', () => {
  const tid = randomUUID();
  const openedEv = makeOpened(tid, 0);
  const resolved: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'thread.status-changed',
    thread_id: tid,
    author: { kind: 'human' },
    created_at: new Date(Date.now() + 1000).toISOString(),
    commit: null,
    dirty: false,
    to: 'resolved',
  };
  const [thread] = project([openedEv, resolved]);
  assert.strictEqual(thread.status, 'resolved');
  assert.strictEqual(isPending(thread), false, 'resuelto → NOT pending');
});

// ---------------------------------------------------------------------------
// emit message.posted → readEvents no descarta
// ---------------------------------------------------------------------------

test('emit produce un fichero que readEvents no descarta', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-cli-emit-'));
  try {
    const tid = randomUUID();
    const id = randomUUID();
    const event: EventEnvelope = {
      id,
      version: 2,
      type: 'message.posted',
      thread_id: tid,
      author: { kind: 'ai', model: 'test-model' },
      created_at: utcTimestampMs(),
      commit: 'abc1234',
      dirty: false,
      body: 'Corrección de prueba.',
    };
    await emitEvent(dir, event);

    const events = await readEvents(dir);
    assert.strictEqual(events.length, 1, 'readEvents devuelve 1 evento');
    assert.strictEqual(events[0].id, id, 'el id coincide');
    assert.strictEqual(events[0].type, 'message.posted');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('emit con commit=null mantiene null (no cadena "null")', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-cli-emit-null-'));
  try {
    const id = randomUUID();
    const event: EventEnvelope = {
      id,
      version: 2,
      type: 'message.posted',
      thread_id: randomUUID(),
      author: { kind: 'human' },
      created_at: utcTimestampMs(),
      commit: null,
      dirty: false,
      body: 'Mensaje sin commit.',
    };
    await emitEvent(dir, event);
    const events = await readEvents(dir);
    assert.strictEqual(events[0].commit, null, 'commit es null (no cadena)');
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// parseKvPairs
// ---------------------------------------------------------------------------

test('parseKvPairs: null literal', () => {
  const result = parseKvPairs(['commit=null']);
  assert.strictEqual(result.commit, null);
});

test('parseKvPairs: boolean literals', () => {
  const result = parseKvPairs(['dirty=false', 'flag=true']);
  assert.strictEqual(result.dirty, false);
  assert.strictEqual(result.flag, true);
});

test('parseKvPairs: dot notation para objetos anidados', () => {
  const result = parseKvPairs(['author.kind=ai', 'author.model=claude-test']);
  const author = result.author as Record<string, unknown>;
  assert.strictEqual(author.kind, 'ai');
  assert.strictEqual(author.model, 'claude-test');
});

test('parseKvPairs: string ordinario', () => {
  const result = parseKvPairs(['body=Texto de prueba']);
  assert.strictEqual(result.body, 'Texto de prueba');
});

// ---------------------------------------------------------------------------
// Roundtrip: emit → project
// ---------------------------------------------------------------------------

test('roundtrip: evento emitido reaparece en la proyección de project', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-cli-rt-'));
  try {
    const tid = randomUUID();

    // 1. Emitir thread.opened
    const openedId = randomUUID();
    const openedEv: EventEnvelope = {
      id: openedId,
      version: 2,
      type: 'thread.opened',
      thread_id: tid,
      author: { kind: 'human' },
      created_at: utcTimestampMs(),
      commit: null,
      dirty: false,
      anchor: { quote: 'párrafo de ejemplo', line_hint: 5, char_offset: 120 },
      commentType: 'sugerencia',
      body: 'Sería mejor reformular este párrafo.',
    };
    await emitEvent(dir, openedEv);

    // 2. Emitir message.posted (fix IA)
    const fixId = randomUUID();
    // Pequeña pausa para que el timestamp sea posterior
    await new Promise(r => setTimeout(r, 5));
    const fixEv: EventEnvelope = {
      id: fixId,
      version: 2,
      type: 'message.posted',
      thread_id: tid,
      author: { kind: 'ai', model: 'test-model' },
      created_at: utcTimestampMs(),
      commit: 'deadbeef',
      dirty: false,
      body: 'Párrafo reformulado.',
    };
    await emitEvent(dir, fixEv);

    // 3. Proyectar
    const events = await readEvents(dir);
    const threads = project(events);

    assert.strictEqual(threads.length, 1, '1 hilo en la proyección');
    assert.strictEqual(threads[0].thread_id, tid, 'thread_id correcto');
    assert.strictEqual(threads[0].messages.length, 2, '2 mensajes (opened + fix)');
    assert.strictEqual(threads[0].messages[1].commit, 'deadbeef', 'commit del fix');

    // El hilo no es pending: último mensaje es IA con commit
    assert.strictEqual(isPending(threads[0]), false, 'no pending tras fix IA');

    // 4. Emitir respuesta humana → ahora sí es pending (iteración §7)
    await new Promise(r => setTimeout(r, 5));
    const replyEv: EventEnvelope = {
      id: randomUUID(),
      version: 2,
      type: 'message.posted',
      thread_id: tid,
      author: { kind: 'human' },
      created_at: utcTimestampMs(),
      commit: null,
      dirty: false,
      body: 'Gracias, por favor revisa también la conclusión.',
    };
    await emitEvent(dir, replyEv);

    const events2 = await readEvents(dir);
    const threads2 = project(events2);
    assert.strictEqual(isPending(threads2[0]), true, 'pending tras respuesta humana');
  } finally {
    await rm(dir, { recursive: true });
  }
});

/**
 * cli.test.ts — tests del CLI mesh-review con node:test.
 *
 * Cubre:
 *   - Proyección sobre fixture V2 (project + readEvents).
 *   - isPending: exclusión por último mensaje IA (con o sin commit), iteración
 *     humana y reactivación por asignación posterior.
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
import { reanchorThreads } from './commands/reanchor.ts';
import { writeFile } from 'node:fs/promises';

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

function makeAiReply(threadId: string, offset = 1000): EventEnvelope {
  return {
    id: randomUUID(),
    version: 2,
    type: 'message.posted',
    thread_id: threadId,
    author: { kind: 'ai', model: 'claude-sonnet-4-6' },
    created_at: new Date(Date.now() + offset).toISOString(),
    commit: null,
    dirty: false,
    body: 'Respuesta en el hilo, sin edición del documento.',
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
// isPending — regla base: accionable salvo que el último no retractado sea IA
// ---------------------------------------------------------------------------

test('isPending: hilo abierto solo con el comentario humano → accionable', () => {
  const tid = randomUUID();
  const openedEv = makeOpened(tid);
  const [thread] = project([openedEv]);
  assert.ok(thread, 'hilo proyectado existe');
  assert.strictEqual(isPending(thread), true, 'último no retractado es humano → pending');
});

test('isPending: respuesta IA sin commit descarga el hilo → no accionable', () => {
  const tid = randomUUID();
  const openedEv = makeOpened(tid, 0);
  const aiReplyEv = makeAiReply(tid, 1000);
  const [thread] = project([openedEv, aiReplyEv]);
  assert.strictEqual(isPending(thread), false, 'último no retractado es IA (commit=null) → NOT pending');
});

// ---------------------------------------------------------------------------
// isPending — iteración §7: el humano reactiva respondiendo
// ---------------------------------------------------------------------------

test('isPending (iteración): humano respondió después del fix IA → accionable', () => {
  const tid = randomUUID();
  const openedEv = makeOpened(tid, 0);
  const aiFixEv = makeAiFix(tid, 'abc1234', 1000);
  const humanReplyEv = makeHumanReply(tid, 2000);
  const [thread] = project([openedEv, aiFixEv, humanReplyEv]);
  assert.strictEqual(isPending(thread), true, 'humano tras fix IA → pending');
});

test('isPending (iteración): humano respondió después de una respuesta IA sin commit → accionable', () => {
  const tid = randomUUID();
  const openedEv = makeOpened(tid, 0);
  const aiReplyEv = makeAiReply(tid, 1000);
  const humanReplyEv = makeHumanReply(tid, 2000);
  const [thread] = project([openedEv, aiReplyEv, humanReplyEv]);
  assert.strictEqual(isPending(thread), true, 'humano tras respuesta IA → pending');
});

// ---------------------------------------------------------------------------
// isPending — asignación: reactiva solo si es posterior al último mensaje IA
// ---------------------------------------------------------------------------

test('isPending (asignación): thread.assigned posterior al último mensaje IA → accionable', () => {
  const tid = randomUUID();
  const openedEv = makeOpened(tid, 0);
  const aiFixEv = makeAiFix(tid, 'abc1234', 1000);
  const assignedEv = makeAssigned(tid, 'reviser', 2000);
  const [thread] = project([openedEv, aiFixEv, assignedEv]);
  const lastNonRetracted = thread.messages.filter(m => !m.retracted).at(-1);
  assert.strictEqual(lastNonRetracted?.author.kind, 'ai', 'último mensaje es IA');
  assert.ok(thread.assignedAt, 'la proyección guarda assignedAt');
  assert.strictEqual(isPending(thread), true, 'asignación posterior al mensaje IA → pending');
});

test('isPending (asignación): respuesta IA posterior a la asignación → no accionable', () => {
  const tid = randomUUID();
  const openedEv = makeOpened(tid, 0);
  const aiFixEv = makeAiFix(tid, 'abc1234', 1000);
  const assignedEv = makeAssigned(tid, 'reviser', 2000);
  const aiReplyEv = makeAiReply(tid, 3000);
  const [thread] = project([openedEv, aiFixEv, assignedEv, aiReplyEv]);
  assert.strictEqual(isPending(thread), false, 'el asignado ya respondió → NOT pending');
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

test('isPending exclusión: todos los mensajes retractados → no accionable', () => {
  const tid = randomUUID();
  const openedEv = makeOpened(tid, 0);
  const retractEv: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'message.retracted',
    thread_id: tid,
    author: { kind: 'human' },
    created_at: new Date(Date.now() + 1000).toISOString(),
    commit: null,
    dirty: false,
    target_message_id: openedEv.id,
  };
  const [thread] = project([openedEv, retractEv]);
  assert.strictEqual(isPending(thread), false, 'sin mensajes vivos → NOT pending');
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
// readEvents ignora ficheros .json.tmp (escritura atómica en curso)
// ---------------------------------------------------------------------------

test('readEvents ignora ficheros <uuid>.json.tmp con contenido de evento válido', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-cli-tmp-'));
  try {
    const id = randomUUID();
    const tid = randomUUID();
    const event: EventEnvelope = {
      id,
      version: 2,
      type: 'message.posted',
      thread_id: tid,
      author: { kind: 'ai', model: 'test-model' },
      created_at: utcTimestampMs(),
      commit: 'abc1234',
      dirty: false,
      body: 'Contenido válido, pero en fichero .json.tmp',
    };
    // Escribir directamente como .json.tmp (como hace emit durante la escritura atómica)
    await writeFile(join(dir, `${id}.json.tmp`), JSON.stringify(event, null, 2) + '\n', 'utf8');

    const events = await readEvents(dir);
    assert.strictEqual(events.length, 0, 'readEvents no procesa ficheros .json.tmp');
  } finally {
    await rm(dir, { recursive: true });
  }
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

// ---------------------------------------------------------------------------
// reanchor
// ---------------------------------------------------------------------------

/**
 * Crea un evento thread.opened con el ancla dada y lo emite en `dir`.
 * Devuelve el thread_id.
 */
async function makeOpenedWithAnchor(
  dir: string,
  quote: string,
  charOffset: number,
  lineHint = 0
): Promise<string> {
  const tid = randomUUID();
  const ev: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'thread.opened',
    thread_id: tid,
    author: { kind: 'human' },
    created_at: utcTimestampMs(),
    commit: null,
    dirty: false,
    anchor: { quote, line_hint: lineHint, char_offset: charOffset },
    commentType: 'edita',
    body: 'Comentario de prueba',
  };
  await emitEvent(dir, ev);
  return tid;
}

test('reanchor: ancla desplazada → emite thread.reanchored con nueva ancla', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-reanchor-disp-'));
  try {
    // Ancla original apunta al inicio del documento
    await makeOpenedWithAnchor(dir, 'texto ancla', 0, 0);

    // Texto actual: la cita se ha desplazado (hay un prefijo de 14 chars)
    const prefijo = 'prefijo nuevo\n'; // 14 chars: 7 (prefijo) + 1 (espacio) + 5 (nuevo) + 1 (\n)
    const text = `${prefijo}texto ancla\nfin`;

    const events = await readEvents(dir);
    const threads = project(events);
    assert.strictEqual(threads.length, 1, '1 hilo');

    const count = await reanchorThreads(text, threads, dir);
    assert.strictEqual(count, 1, 'emite 1 evento');

    // La proyección posterior refleja el nuevo char_offset
    const events2 = await readEvents(dir);
    const threads2 = project(events2);
    const anchor = threads2[0].anchor;
    assert.ok(!('detached' in anchor), 'ancla no está detached');
    assert.strictEqual((anchor as { char_offset: number }).char_offset, prefijo.length,
      `char_offset actualizado a ${prefijo.length}`);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('reanchor: texto eliminado → emite thread.reanchored con detached:true', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-reanchor-del-'));
  try {
    await makeOpenedWithAnchor(dir, 'texto que ya no existe', 0, 0);

    const text = 'contenido completamente diferente sin la cita';

    const events = await readEvents(dir);
    const threads = project(events);

    const count = await reanchorThreads(text, threads, dir);
    assert.strictEqual(count, 1, 'emite 1 evento');

    // La proyección posterior refleja el estado detached
    const events2 = await readEvents(dir);
    const threads2 = project(events2);
    assert.ok('detached' in threads2[0].anchor, 'ancla marcada como detached');
    assert.strictEqual(threads2[0].status, 'detached', 'status es detached');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('reanchor: hilo resolved → no emite nada', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-reanchor-res-'));
  try {
    const tid = await makeOpenedWithAnchor(dir, 'texto ancla', 0, 0);

    // Resolver el hilo
    const resolvedEv: EventEnvelope = {
      id: randomUUID(),
      version: 2,
      type: 'thread.status-changed',
      thread_id: tid,
      author: { kind: 'human' },
      created_at: utcTimestampMs(),
      commit: null,
      dirty: false,
      to: 'resolved',
    };
    await emitEvent(dir, resolvedEv);

    const events = await readEvents(dir);
    const threads = project(events);
    assert.strictEqual(threads[0].status, 'resolved', 'hilo está resolved');

    // El texto ha cambiado, pero como el hilo está resolved no se emite nada
    const text = 'texto ancla ha sido desplazado a otra posición';
    const count = await reanchorThreads(text, threads, dir);
    assert.strictEqual(count, 0, 'no emite eventos para hilos resolved');

    // El número de eventos en el dir sigue siendo 2 (opened + status-changed)
    const eventsPost = await readEvents(dir);
    assert.strictEqual(eventsPost.length, 2, 'no se añadieron eventos nuevos');
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('reanchor: ancla sin desplazar → no emite nada', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-reanchor-nodis-'));
  try {
    // Ancla al inicio; el texto la contiene exactamente en offset 0
    await makeOpenedWithAnchor(dir, 'texto ancla', 0, 0);

    const text = 'texto ancla seguido de más contenido';

    const events = await readEvents(dir);
    const threads = project(events);

    const count = await reanchorThreads(text, threads, dir);
    assert.strictEqual(count, 0, 'no emite eventos cuando el ancla no ha cambiado');
  } finally {
    await rm(dir, { recursive: true });
  }
});

/**
 * cli.test.ts — tests del CLI mesh-review con node:test.
 *
 * Cubre:
 *   - Proyección sobre fixture V2 (project + readEvents).
 *   - isPending: exclusión por último mensaje IA (con o sin commit), iteración
 *     humana y reactivación por asignación posterior.
 *   - emit message.posted produce un fichero que readEvents no descarta.
 *   - Roundtrip emit → project: el evento emitido reaparece en la proyección.
 *   - fix: caso nominal, documento sin cambios, --already-done, --reanchor, --confidence.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { readEvents, project, utcTimestampMs, type EventEnvelope, type ThreadProjection } from '../sidecar.ts';
import { isPending } from './commands/project.ts';
import { emitEvent, parseKvPairs } from './commands/emit.ts';
import { reanchorThreads } from './commands/reanchor.ts';
import { runFix } from './commands/fix.ts';
import { runOpen } from './commands/open.ts';
import { runReply } from './commands/reply.ts';
import { writeFile } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

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

test('parseKvPairs: integer coercion — anchor.line_hint=20 → number 20', () => {
  const result = parseKvPairs(['anchor.line_hint=20']);
  const anchor = result.anchor as Record<string, unknown>;
  assert.strictEqual(anchor.line_hint, 20);
  assert.strictEqual(typeof anchor.line_hint, 'number');
});

test('parseKvPairs: integer coercion — anchor.char_offset=100 → number 100', () => {
  const result = parseKvPairs(['anchor.char_offset=100']);
  const anchor = result.anchor as Record<string, unknown>;
  assert.strictEqual(anchor.char_offset, 100);
  assert.strictEqual(typeof anchor.char_offset, 'number');
});

test('parseKvPairs: float en clave numérica lanza error — anchor.char_offset=3.5', () => {
  assert.throws(
    () => parseKvPairs(['anchor.char_offset=3.5']),
    /anchor\.char_offset/,
    'debe lanzar error para valor float en clave numérica'
  );
});

test('parseKvPairs: cadena arbitraria no se coerciona a número', () => {
  const result = parseKvPairs(['body=texto']);
  assert.strictEqual(result.body, 'texto');
  assert.strictEqual(typeof result.body, 'string');
});

test('parseKvPairs: entero negativo en clave numérica lanza error — anchor.line_hint=-1', () => {
  assert.throws(
    () => parseKvPairs(['anchor.line_hint=-1']),
    /anchor\.line_hint/,
    'debe lanzar error para valor negativo en clave numérica'
  );
});

test('parseKvPairs: body=42 se mantiene como string "42"', () => {
  const result = parseKvPairs(['body=42']);
  assert.strictEqual(result.body, '42');
  assert.strictEqual(typeof result.body, 'string');
});

test('parseKvPairs: agent=123 se mantiene como string "123"', () => {
  const result = parseKvPairs(['agent=123']);
  assert.strictEqual(result.agent, '123');
  assert.strictEqual(typeof result.agent, 'string');
});

test('parseKvPairs: anchor.line_hint=3.5 lanza error con exit 1', () => {
  assert.throws(
    () => parseKvPairs(['anchor.line_hint=3.5']),
    /anchor\.line_hint/,
    'debe lanzar error para float en anchor.line_hint'
  );
});

test('parseKvPairs: anchor.char_offset=-1 lanza error con exit 1', () => {
  assert.throws(
    () => parseKvPairs(['anchor.char_offset=-1']),
    /anchor\.char_offset/,
    'debe lanzar error para negativo en anchor.char_offset'
  );
});

// ---------------------------------------------------------------------------
// readEvents: aviso cuando anchor tiene campos con tipo incorrecto
// ---------------------------------------------------------------------------

test('readEvents: evento con anchor.line_hint string emite console.warn y lo descarta', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-cli-warn-'));
  try {
    const id = randomUUID();
    const tid = randomUUID();
    // Event with line_hint as string (simulates old broken emit output)
    const badEvent = {
      id,
      version: 2,
      type: 'thread.opened',
      thread_id: tid,
      author: { kind: 'human' },
      created_at: new Date().toISOString(),
      commit: null,
      dirty: false,
      anchor: { quote: 'texto', line_hint: '20', char_offset: 0 },
      commentType: 'nota',
      body: 'Evento con ancla mal tipada.',
    };
    await writeFile(join(dir, `${id}.json`), JSON.stringify(badEvent, null, 2) + '\n', 'utf8');

    const warnMessages: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnMessages.push(args.join(' ')); };
    try {
      const events = await readEvents(dir);
      assert.strictEqual(events.length, 0, 'evento con ancla mal tipada es descartado');
      assert.strictEqual(warnMessages.length, 1, 'se emite exactamente un console.warn agregado por llamada');
      assert.ok(warnMessages[0].includes('1'), 'el aviso indica el número de eventos descartados');
    } finally {
      console.warn = origWarn;
    }
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// readEvents: aviso agregado — varios eventos malformados → un solo warn
// ---------------------------------------------------------------------------

test('readEvents: varios eventos con ancla mal tipada emiten un único console.warn agregado', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-cli-multiwarn-'));
  try {
    // Write three events each with a bad anchor field (line_hint as string)
    for (let i = 0; i < 3; i++) {
      const id = randomUUID();
      const tid = randomUUID();
      const bad = {
        id,
        version: 2,
        type: 'thread.opened',
        thread_id: tid,
        author: { kind: 'human' },
        created_at: new Date().toISOString(),
        commit: null,
        dirty: false,
        anchor: { quote: 'texto', line_hint: String(i), char_offset: 0 },
        commentType: 'nota',
        body: 'Evento malformado.',
      };
      await writeFile(join(dir, `${id}.json`), JSON.stringify(bad, null, 2) + '\n', 'utf8');
    }
    const warnMessages: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnMessages.push(args.join(' ')); };
    try {
      const events = await readEvents(dir);
      assert.strictEqual(events.length, 0, 'todos los eventos malformados son descartados');
      assert.strictEqual(warnMessages.length, 1, 'exactamente un console.warn por llamada a readEvents');
      assert.ok(warnMessages[0].includes('3'), 'el aviso indica el recuento de 3 eventos descartados');
    } finally {
      console.warn = origWarn;
    }
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('readEvents: directorio limpio no emite ningún console.warn', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-cli-nowarn-'));
  try {
    const id = randomUUID();
    const tid = randomUUID();
    const good: EventEnvelope = {
      id,
      version: 2,
      type: 'thread.opened',
      thread_id: tid,
      author: { kind: 'human' },
      created_at: new Date().toISOString(),
      commit: null,
      dirty: false,
      anchor: { quote: 'texto', line_hint: 0, char_offset: 0 },
      commentType: 'nota',
      body: 'Evento bien formado.',
    };
    await writeFile(join(dir, `${id}.json`), JSON.stringify(good, null, 2) + '\n', 'utf8');
    const warnMessages: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warnMessages.push(args.join(' ')); };
    try {
      const events = await readEvents(dir);
      assert.strictEqual(events.length, 1, 'el evento bien formado es aceptado');
      assert.strictEqual(warnMessages.length, 0, 'no se emite ningún console.warn para directorio limpio');
    } finally {
      console.warn = origWarn;
    }
  } finally {
    await rm(dir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// Integración: emit con anchor numérico → readEvents no descarta
// ---------------------------------------------------------------------------

test('integración: emit con anchor.line_hint=20 escribe número; readEvents no lo descarta', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mr-cli-num-'));
  try {
    const tid = randomUUID();
    const event: EventEnvelope = {
      id: randomUUID(),
      version: 2,
      type: 'thread.opened',
      thread_id: tid,
      author: { kind: 'human' },
      created_at: utcTimestampMs(),
      commit: null,
      dirty: false,
      anchor: { quote: 'hola', line_hint: 20, char_offset: 100 },
      commentType: 'nota',
      body: 'Prueba de coerción numérica.',
    };
    await emitEvent(dir, event);

    const events = await readEvents(dir);
    assert.strictEqual(events.length, 1, 'readEvents no descarta el evento con ancla numérica');
    const anchor = (events[0] as unknown as Record<string, unknown>).anchor as Record<string, unknown>;
    assert.strictEqual(typeof anchor.line_hint, 'number', 'line_hint es number en el evento leído');
    assert.strictEqual(anchor.line_hint, 20);
  } finally {
    await rm(dir, { recursive: true });
  }
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

// ---------------------------------------------------------------------------
// fix
// ---------------------------------------------------------------------------

/**
 * Creates a minimal git repo in a temp directory suitable for fix tests.
 * Returns gitRoot and a cleanup function.
 */
async function makeGitRepo(): Promise<{ gitRoot: string; cleanup: () => Promise<void> }> {
  const gitRoot = await mkdtemp(join(tmpdir(), 'mr-fix-repo-'));
  await execFileAsync('git', ['init'], { cwd: gitRoot });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: gitRoot });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: gitRoot });
  // Initial commit so HEAD exists
  await writeFile(join(gitRoot, '.gitkeep'), '', 'utf8');
  await execFileAsync('git', ['add', '.gitkeep'], { cwd: gitRoot });
  await execFileAsync('git', ['commit', '-m', 'init'], { cwd: gitRoot });
  return { gitRoot, cleanup: () => rm(gitRoot, { recursive: true }) };
}

test('fix: caso nominal → crea commit y emite message.posted con SHA', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'contenido para revisar\n', 'utf8');
    // Stage the file so it appears in git status --porcelain and can be committed
    await execFileAsync('git', ['add', docAbs], { cwd: gitRoot });

    const tid = randomUUID();
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    await runFix([docAbs, tid, '-m', 'fix(doc): corrige contenido', '--body', 'Corrección aplicada']);

    // Event was emitted
    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 1, '1 evento emitido');
    const ev = events[0];
    assert.strictEqual(ev.type, 'message.posted');
    assert.strictEqual(ev.thread_id, tid);
    assert.strictEqual(ev.body as string, 'Corrección aplicada');
    assert.strictEqual((ev.author as { kind: string }).kind, 'ai');
    assert.ok(ev.commit, 'el evento tiene commit');
    assert.strictEqual(typeof ev.commit, 'string', 'commit es string');
    assert.strictEqual(ev.dirty, false);

    // A new commit was created
    const { stdout: logOut } = await execFileAsync('git', ['log', '--oneline'], { cwd: gitRoot });
    assert.ok(logOut.includes('fix(doc): corrige contenido'), 'commit creado con el mensaje correcto');
  } finally {
    await cleanup();
  }
});

test('fix: documento sin cambios → exit 1, sin evento emitido', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    // Commit the doc so it is clean in the worktree
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'contenido sin cambios\n', 'utf8');
    await execFileAsync('git', ['add', docAbs], { cwd: gitRoot });
    await execFileAsync('git', ['commit', '-m', 'add doc'], { cwd: gitRoot });

    const tid = randomUUID();
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    // Intercept process.exit so the test process does not actually exit
    let capturedExitCode: number | undefined;
    const origExit = process.exit;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process as any).exit = (code?: number) => {
      capturedExitCode = code ?? 0;
      throw new Error(`process.exit:${capturedExitCode}`);
    };
    try {
      await runFix([docAbs, tid, '-m', 'fix(doc): sin cambios', '--body', 'Sin cambios']);
    } catch (e) {
      if (!(e instanceof Error && e.message.startsWith('process.exit:'))) throw e;
    } finally {
      process.exit = origExit;
    }

    assert.strictEqual(capturedExitCode, 1, 'sale con código 1');
    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 0, 'ningún evento emitido');
  } finally {
    await cleanup();
  }
});

test('fix: --already-done <sha> → sin commit nuevo, evento con ese SHA', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'contenido\n', 'utf8');
    // File is NOT staged: --already-done should not require pending changes

    const tid = randomUUID();
    const alreadyDoneSha = 'abc1234';
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    const { stdout: logBefore } = await execFileAsync(
      'git', ['rev-list', '--count', 'HEAD'], { cwd: gitRoot }
    );
    const commitsBefore = parseInt(logBefore.trim(), 10);

    await runFix([docAbs, tid, '--already-done', alreadyDoneSha, '--body', 'Resuelto anteriormente']);

    // No new commit should have been created
    const { stdout: logAfter } = await execFileAsync(
      'git', ['rev-list', '--count', 'HEAD'], { cwd: gitRoot }
    );
    assert.strictEqual(parseInt(logAfter.trim(), 10), commitsBefore, 'sin commit nuevo');

    // Event emitted with the supplied SHA
    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 1, '1 evento emitido');
    assert.strictEqual(events[0].commit, alreadyDoneSha, 'commit es el SHA de --already-done');
  } finally {
    await cleanup();
  }
});

test('fix: --reanchor → emite thread.reanchored cuando el ancla se desplaza', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    const initialContent = 'texto ancla\nfin del documento\n';
    await writeFile(docAbs, initialContent, 'utf8');
    await execFileAsync('git', ['add', docAbs], { cwd: gitRoot });
    await execFileAsync('git', ['commit', '-m', 'add doc'], { cwd: gitRoot });

    // Open a review thread with anchor at the start of the doc (offset 0)
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');
    const tid = await makeOpenedWithAnchor(eventDir, 'texto ancla', 0, 0);

    // Modify the doc: prefix shifts the anchor
    const newContent = 'prefijo nuevo\ntexto ancla\nfin del documento\n';
    await writeFile(docAbs, newContent, 'utf8');
    await execFileAsync('git', ['add', docAbs], { cwd: gitRoot });

    await runFix([docAbs, tid, '-m', 'fix(doc): añade prefijo', '--body', 'Corrección aplicada', '--reanchor']);

    // Should have the message.posted plus at least one thread.reanchored
    const events = await readEvents(eventDir);
    const reanchored = events.filter(e => e.type === 'thread.reanchored');
    assert.ok(reanchored.length >= 1, 'se emite thread.reanchored tras --reanchor');
  } finally {
    await cleanup();
  }
});

test('fix: --confidence alta → el campo aparece en el evento emitido', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'contenido a revisar\n', 'utf8');
    await execFileAsync('git', ['add', docAbs], { cwd: gitRoot });

    const tid = randomUUID();
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    await runFix([
      docAbs, tid,
      '-m', 'fix(doc): con confianza',
      '--body', 'Corrección aplicada',
      '--confidence', 'alta',
    ]);

    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 1, '1 evento emitido');
    assert.strictEqual(events[0].confidence, 'alta', 'campo confidence presente y correcto');
  } finally {
    await cleanup();
  }
});

test('fix: --model <id> → aparece como author.model en el evento emitido', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'contenido\n', 'utf8');
    const tid = randomUUID();
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    await runFix([
      docAbs, tid,
      '--already-done', 'abc1234',
      '--body', 'Corrección aplicada',
      '--model', 'claude-opus-4',
    ]);

    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 1, '1 evento emitido');
    const author = events[0].author as { kind: string; model?: string };
    assert.strictEqual(author.model, 'claude-opus-4', 'author.model coincide con --model');
  } finally {
    await cleanup();
  }
});

// Helper: intercepts process.exit so the test process does not actually exit.
// Returns the captured exit code (undefined if runFix resolved normally).
async function captureExit(fn: () => Promise<void>): Promise<number | undefined> {
  let capturedExitCode: number | undefined;
  const origExit = process.exit;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process as any).exit = (code?: number) => {
    capturedExitCode = code ?? 0;
    throw new Error(`process.exit:${capturedExitCode}`);
  };
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof Error && e.message.startsWith('process.exit:'))) throw e;
  } finally {
    process.exit = origExit;
  }
  return capturedExitCode;
}

test('fix: --already-done con SHA malformado → exit 1, sin evento emitido', async () => {
  // Uses a real git repo so the git-root check succeeds; the failure must come
  // from the SHA format validation, not from the repo lookup.
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'contenido\n', 'utf8');
    const tid = randomUUID();
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    const code = await captureExit(() =>
      runFix([docAbs, tid, '--already-done', 'no-es-sha!!', '--body', 'Resuelto'])
    );

    assert.strictEqual(code, 1, 'sale con código 1');
    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 0, 'ningún evento emitido');
  } finally {
    await cleanup();
  }
});

test('fix: -m y --already-done juntos → exit 1, sin evento emitido', async () => {
  // Uses a real git repo so the git-root check succeeds; the failure must come
  // from the mutual-exclusion guard, not from the repo lookup.
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'contenido\n', 'utf8');
    const tid = randomUUID();
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    const code = await captureExit(() =>
      runFix([docAbs, tid, '-m', 'fix: msg', '--already-done', 'abc1234', '--body', 'Resuelto'])
    );

    assert.strictEqual(code, 1, 'sale con código 1');
    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 0, 'ningún evento emitido');
  } finally {
    await cleanup();
  }
});

test('fix: --confidence con valor inválido → exit 1, sin evento emitido', async () => {
  // Uses a real git repo with a staged file so the confidence validation is the
  // only thing that can cause an early exit.
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'contenido\n', 'utf8');
    await execFileAsync('git', ['add', docAbs], { cwd: gitRoot });
    const tid = randomUUID();
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    const code = await captureExit(() =>
      runFix([docAbs, tid, '-m', 'fix: msg', '--body', 'Corrección', '--confidence', 'high'])
    );

    assert.strictEqual(code, 1, 'sale con código 1');
    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 0, 'ningún evento emitido');
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// open
// ---------------------------------------------------------------------------

test('open: happy path ASCII → crea thread.opened con cita y status open', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Hello world\n', 'utf8');

    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    let tid: string | undefined;
    const origWrite = process.stdout.write.bind(process.stdout);
    const written: string[] = [];
    process.stdout.write = (chunk: unknown) => { written.push(String(chunk)); return true; };
    try {
      await runOpen([docAbs, '--offset', '0', '--end-offset', '5', '--type', 'nota', '--body', 'Revisar']);
    } finally {
      process.stdout.write = origWrite;
    }
    tid = written.join('').trim();
    assert.ok(tid && tid.length > 0, 'imprime thread_id');

    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 1, '1 evento emitido');
    const ev = events[0];
    assert.strictEqual(ev.type, 'thread.opened', 'tipo correcto');
    assert.strictEqual(ev.id, tid, 'id === thread_id (mismo UUID)');
    assert.strictEqual(ev.thread_id, tid, 'thread_id igual al stdout');
    assert.strictEqual(ev.commentType, 'nota', 'commentType correcto');
    assert.strictEqual(ev.body, 'Revisar', 'body correcto');
    const anchor = ev.anchor as { quote: string; line_hint: number; char_offset: number };
    assert.strictEqual(anchor.quote, 'Hello', 'cita correcta');
    assert.strictEqual(anchor.char_offset, 0, 'char_offset correcto');

    const threads = project(events);
    assert.strictEqual(threads.length, 1, '1 hilo en project');
    assert.strictEqual(threads[0].status, 'open', 'status open');
    assert.strictEqual(threads[0].thread_id, tid, 'thread_id coincide');
  } finally {
    await cleanup();
  }
});

test('open: --author ai --model m1 → author.kind ai en el evento', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Contenido para revisar\n', 'utf8');

    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    await runOpen([
      docAbs,
      '--offset', '0', '--end-offset', '9',
      '--type', 'sugerencia',
      '--body', 'Sugiero cambiar',
      '--author', 'ai',
      '--model', 'claude-sonnet-4-6',
    ]);

    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 1, '1 evento emitido');
    const author = events[0].author as { kind: string; model?: string };
    assert.strictEqual(author.kind, 'ai', 'author.kind es ai');
    assert.strictEqual(author.model, 'claude-sonnet-4-6', 'author.model correcto');
  } finally {
    await cleanup();
  }
});

test('open: --type verifica --confidence alta → confidence en el evento', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Verificar este punto\n', 'utf8');

    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    await runOpen([
      docAbs,
      '--offset', '0', '--end-offset', '8',
      '--type', 'verifica',
      '--body', 'Revisar con detalle',
      '--confidence', 'alta',
    ]);

    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 1, '1 evento emitido');
    assert.strictEqual(events[0].confidence, 'alta', 'confidence correcto');
    assert.strictEqual(events[0].commentType, 'verifica', 'commentType correcto');
  } finally {
    await cleanup();
  }
});

test('open: evento pasa readEvents sin descartarse (round-trip)', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Texto del documento para test\n', 'utf8');

    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    await runOpen([
      docAbs,
      '--offset', '0', '--end-offset', '5',
      '--type', 'nota',
      '--body', 'Nota de prueba',
    ]);

    const events = await readEvents(eventDir);
    // If the event were malformed it would be silently dropped
    assert.strictEqual(events.length, 1, 'el evento sobrevive a readEvents');
    // Verify anchor fields have correct types (not discarded for bad types)
    const anchor = events[0].anchor as { quote: string; line_hint: number; char_offset: number };
    assert.strictEqual(typeof anchor.line_hint, 'number', 'line_hint es número');
    assert.strictEqual(typeof anchor.char_offset, 'number', 'char_offset es número');
    assert.strictEqual(typeof anchor.quote, 'string', 'quote es cadena');

    const threads = project(events);
    assert.strictEqual(threads.length, 1, '1 hilo en project tras round-trip');
  } finally {
    await cleanup();
  }
});

test('open: fichero con emoji — offsets para texto ASCII a su derecha', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    // '😀' ocupa 2 unidades de código UTF-16 (indices 0 y 1 en JS)
    // El texto ASCII 'hola' empieza en offset 2
    const content = '😀hola\n';
    await writeFile(docAbs, content, 'utf8');

    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    // offset 2 → inicio de 'hola', end-offset 6 → fin de 'hola' (4 chars)
    await runOpen([
      docAbs,
      '--offset', '2', '--end-offset', '6',
      '--type', 'nota',
      '--body', 'Texto tras emoji',
    ]);

    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 1, '1 evento emitido');
    const anchor = events[0].anchor as { quote: string; line_hint: number; char_offset: number };
    assert.strictEqual(anchor.quote, 'hola', 'cita correcta tras emoji');
    assert.strictEqual(anchor.char_offset, 2, 'char_offset es la unidad UTF-16 correcta');
  } finally {
    await cleanup();
  }
});

test('open: --end-offset < --offset → exit 1', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Contenido\n', 'utf8');

    const code = await captureExit(() =>
      runOpen([docAbs, '--offset', '5', '--end-offset', '3', '--type', 'nota', '--body', 'x'])
    );
    assert.strictEqual(code, 1, 'sale con código 1');
  } finally {
    await cleanup();
  }
});

test('open: --offset fuera del fichero → exit 1', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'abc\n', 'utf8');  // length 4

    const code = await captureExit(() =>
      runOpen([docAbs, '--offset', '10', '--end-offset', '15', '--type', 'nota', '--body', 'x'])
    );
    assert.strictEqual(code, 1, 'sale con código 1');
  } finally {
    await cleanup();
  }
});

test('open: --type inválido → exit 1', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Contenido largo de prueba\n', 'utf8');

    const code = await captureExit(() =>
      runOpen([docAbs, '--offset', '0', '--end-offset', '5', '--type', 'invalido', '--body', 'x'])
    );
    assert.strictEqual(code, 1, 'sale con código 1');
  } finally {
    await cleanup();
  }
});

test('open: --type verifica sin --confidence → exit 1', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Contenido largo de prueba\n', 'utf8');

    const code = await captureExit(() =>
      runOpen([docAbs, '--offset', '0', '--end-offset', '5', '--type', 'verifica', '--body', 'x'])
    );
    assert.strictEqual(code, 1, 'sale con código 1');
  } finally {
    await cleanup();
  }
});

test('open: --author ai sin --model → exit 1', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Contenido de prueba\n', 'utf8');

    const code = await captureExit(() =>
      runOpen([docAbs, '--offset', '0', '--end-offset', '5', '--type', 'nota', '--body', 'x', '--author', 'ai'])
    );
    assert.strictEqual(code, 1, 'sale con código 1');
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// Slice A — shared parser: unknown-flag rejection
// ---------------------------------------------------------------------------

test('open: flag desconocida → exit 1 (parseCliArgs rechaza flags desconocidas)', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Contenido de prueba\n', 'utf8');

    const code = await captureExit(() =>
      runOpen([docAbs, '--offset', '0', '--end-offset', '5', '--type', 'nota', '--body', 'x', '--unknown-flag', 'val'])
    );
    assert.strictEqual(code, 1, 'flag desconocida → sale con código 1');
  } finally {
    await cleanup();
  }
});

test('open: flag sin valor al final de argv → exit 1', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Contenido de prueba\n', 'utf8');

    // --body is the last token with no value following
    const code = await captureExit(() =>
      runOpen([docAbs, '--offset', '0', '--end-offset', '5', '--type', 'nota', '--body'])
    );
    assert.strictEqual(code, 1, 'flag sin valor → sale con código 1');
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// reply (Fase 3)
// ---------------------------------------------------------------------------

test('reply: happy path → message.posted sin commit nuevo en el repo', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Contenido para revisar\n', 'utf8');

    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');
    const tid = randomUUID();

    const { stdout: commitsBefore } = await execFileAsync(
      'git', ['rev-list', '--count', 'HEAD'], { cwd: gitRoot }
    );

    let msgId: string | undefined;
    const origWrite = process.stdout.write.bind(process.stdout);
    const written: string[] = [];
    process.stdout.write = (chunk: unknown) => { written.push(String(chunk)); return true; };
    try {
      await runReply([docAbs, tid, '--body', 'Respuesta de prueba']);
    } finally {
      process.stdout.write = origWrite;
    }
    msgId = written.join('').trim();
    assert.ok(msgId && msgId.length > 0, 'imprime event id');

    // No new commit
    const { stdout: commitsAfter } = await execFileAsync(
      'git', ['rev-list', '--count', 'HEAD'], { cwd: gitRoot }
    );
    assert.strictEqual(commitsAfter.trim(), commitsBefore.trim(), 'sin commit nuevo');

    // Event written and readable
    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 1, '1 evento emitido');
    const ev = events[0];
    assert.strictEqual(ev.type, 'message.posted', 'tipo correcto');
    assert.strictEqual(ev.id, msgId, 'id coincide con stdout');
    assert.strictEqual(ev.thread_id, tid, 'thread_id correcto');
    assert.strictEqual(ev.body as string, 'Respuesta de prueba', 'body correcto');
    assert.strictEqual(ev.dirty, false, 'dirty false');
  } finally {
    await cleanup();
  }
});

test('reply: --author ai --model m1 --confidence media → campos correctos', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Contenido\n', 'utf8');

    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');
    const tid = randomUUID();

    await runReply([
      docAbs, tid,
      '--body', 'Respuesta IA',
      '--author', 'ai',
      '--model', 'claude-sonnet-4-6',
      '--confidence', 'media',
    ]);

    const events = await readEvents(eventDir);
    assert.strictEqual(events.length, 1, '1 evento emitido');
    const author = events[0].author as { kind: string; model?: string };
    assert.strictEqual(author.kind, 'ai', 'author.kind ai');
    assert.strictEqual(author.model, 'claude-sonnet-4-6', 'author.model correcto');
    assert.strictEqual(events[0].confidence, 'media', 'confidence correcto');
  } finally {
    await cleanup();
  }
});

test('reply: round-trip → el evento pasa readEvents sin descartarse', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Contenido\n', 'utf8');

    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');
    const tid = randomUUID();

    await runReply([docAbs, tid, '--body', 'Nota de prueba']);

    const events = await readEvents(eventDir);
    // If the event were malformed it would be silently dropped
    assert.strictEqual(events.length, 1, 'el evento sobrevive a readEvents');
    assert.strictEqual(events[0].type, 'message.posted');
    assert.strictEqual(events[0].thread_id, tid);
  } finally {
    await cleanup();
  }
});

test('reply: --body vacío → exit 1', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Contenido\n', 'utf8');

    const code = await captureExit(() =>
      runReply([docAbs, randomUUID(), '--body', ''])
    );
    assert.strictEqual(code, 1, 'body vacío → sale con código 1');
  } finally {
    await cleanup();
  }
});

test('reply: thread_id no UUID → exit 1', async () => {
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Contenido\n', 'utf8');

    const code = await captureExit(() =>
      runReply([docAbs, 'no-es-uuid', '--body', 'Respuesta'])
    );
    assert.strictEqual(code, 1, 'thread_id inválido → sale con código 1');
  } finally {
    await cleanup();
  }
});

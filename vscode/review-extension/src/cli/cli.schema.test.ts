/**
 * cli.schema.test.ts — conformidad ajv de los eventos producidos por el CLI
 * contra schema.json (T4.2 / E2).
 *
 * Para cada subcomando que escribe eventos (open, reply, resolve, retract,
 * fix, emit, assign, reanchor), ejecuta el subcomando con datos mínimos
 * válidos, captura los eventos escritos en disco y los valida con ajv contra
 * el schema.json canónico.
 *
 * Depende de ajv (devDependency, pinned a 8.20.0).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import Ajv from 'ajv';

import { runOpen } from './commands/open.ts';
import { runReply } from './commands/reply.ts';
import { runResolve } from './commands/resolve.ts';
import { runRetract } from './commands/retract.ts';
import { runFix } from './commands/fix.ts';
import { runEmit, emitEvent } from './commands/emit.ts';
import { runAssign } from './commands/assign.ts';
import { reanchorThreads } from './commands/reanchor.ts';
import { readEvents, project, utcTimestampMs, type EventEnvelope } from '../sidecar.ts';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Rutas
// ---------------------------------------------------------------------------

const __thisDir = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__thisDir, '../../../../agents/.agents/skills/doc-review/schema.json');

// ---------------------------------------------------------------------------
// AJV: carga de esquema y compilación
// ---------------------------------------------------------------------------

async function buildValidate() {
  const content = await readFile(SCHEMA_PATH, 'utf8');
  const schema = JSON.parse(content) as Record<string, unknown>;
  // strict:false para tolerar meta-$schema draft-07 y $defs (2019-09 syntax).
  // El oneOf con additionalProperties:false sí se aplica correctamente.
  const ajv = new Ajv({ strict: false, allErrors: true });
  return ajv.compile(schema);
}

// ---------------------------------------------------------------------------
// Helpers de fixtures
// ---------------------------------------------------------------------------

async function makeGitRepo(): Promise<{ gitRoot: string; cleanup: () => Promise<void> }> {
  const gitRoot = await mkdtemp(join(tmpdir(), 'mr-schema-'));
  await execFileAsync('git', ['init', '-q'], { cwd: gitRoot });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: gitRoot });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: gitRoot });
  await writeFile(join(gitRoot, '.gitkeep'), '', 'utf8');
  await execFileAsync('git', ['add', '.gitkeep'], { cwd: gitRoot });
  await execFileAsync('git', ['commit', '-q', '-m', 'init'], { cwd: gitRoot });
  return { gitRoot, cleanup: () => rm(gitRoot, { recursive: true }) };
}

/** Crea un evento thread.opened directamente (sin pasar por runOpen). */
async function seedThread(eventDir: string, quote: string): Promise<string> {
  await mkdir(eventDir, { recursive: true });
  const tid = randomUUID();
  const ev: EventEnvelope = {
    id: tid,
    version: 2,
    type: 'thread.opened',
    thread_id: tid,
    author: { kind: 'human' },
    created_at: utcTimestampMs(),
    commit: null,
    dirty: false,
    anchor: { quote, line_hint: 0, char_offset: 0 },
    commentType: 'edita',
    body: 'Comentario de prueba',
  };
  await emitEvent(eventDir, ev);
  return tid;
}

/** Lee todos los eventos JSON en bruto del directorio (sin readEvents). */
async function rawEvents(eventDir: string): Promise<Record<string, unknown>[]> {
  let files: string[];
  try {
    files = await readdir(eventDir);
  } catch {
    return [];
  }
  const out: Record<string, unknown>[] = [];
  for (const f of files) {
    if (!f.endsWith('.json') || f.endsWith('.json.tmp')) continue;
    out.push(JSON.parse(await readFile(join(eventDir, f), 'utf8')) as Record<string, unknown>);
  }
  return out;
}

/** Silencia stdout durante fn para evitar UUIDs en la salida del test. */
async function noStdout<T>(fn: () => Promise<T>): Promise<T> {
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return await fn();
  } finally {
    process.stdout.write = orig;
  }
}

// ---------------------------------------------------------------------------
// Función de aserción: valida cada evento del directorio contra el schema
// ---------------------------------------------------------------------------

async function assertAllEventsConform(
  eventDir: string,
  validate: ReturnType<Ajv['compile']>,
  filter?: (ev: Record<string, unknown>) => boolean
) {
  const events = await rawEvents(eventDir);
  const toCheck = filter ? events.filter(filter) : events;
  assert.ok(toCheck.length > 0, 'se espera al menos un evento en el directorio');
  for (const ev of toCheck) {
    const valid = validate(ev);
    if (!valid) {
      assert.fail(
        `Evento ${String(ev['type'])} (id=${String(ev['id'])}) no válido según schema.json:\n` +
        JSON.stringify(validate.errors, null, 2)
      );
    }
  }
}

// ---------------------------------------------------------------------------
// T4.2 — open → thread.opened
// ---------------------------------------------------------------------------

test('schema ajv: open produce thread.opened conforme al schema', async () => {
  const validate = await buildValidate();
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Texto de prueba para revisión.\n', 'utf8');
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    await noStdout(() =>
      runOpen([docAbs, '--offset', '0', '--end-offset', '5', '--type', 'nota', '--body', 'Nota de prueba'])
    );

    await assertAllEventsConform(eventDir, validate);
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// T4.2 — reply → message.posted
// ---------------------------------------------------------------------------

test('schema ajv: reply produce message.posted conforme al schema', async () => {
  const validate = await buildValidate();
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Texto a revisar.\n', 'utf8');
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');
    const tid = await seedThread(eventDir, 'Texto');

    await noStdout(() =>
      runReply([docAbs, tid, '--body', 'Respuesta al hilo'])
    );

    // Valida solo el message.posted (el thread.opened ya existía)
    await assertAllEventsConform(eventDir, validate, ev => ev['type'] === 'message.posted');
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// T4.2 — resolve → thread.status-changed
// ---------------------------------------------------------------------------

test('schema ajv: resolve produce thread.status-changed conforme al schema', async () => {
  const validate = await buildValidate();
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Texto.\n', 'utf8');
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');
    const tid = await seedThread(eventDir, 'Texto');

    await noStdout(() => runResolve([docAbs, tid]));

    await assertAllEventsConform(eventDir, validate, ev => ev['type'] === 'thread.status-changed');
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// T4.2 — retract → message.retracted
// ---------------------------------------------------------------------------

test('schema ajv: retract produce message.retracted conforme al schema', async () => {
  const validate = await buildValidate();
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Texto.\n', 'utf8');
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');
    const tid = await seedThread(eventDir, 'Texto');

    // Emitir un mensaje para poder retractarlo
    const replyId = randomUUID();
    const replyEv: EventEnvelope = {
      id: replyId,
      version: 2,
      type: 'message.posted',
      thread_id: tid,
      author: { kind: 'human' },
      created_at: utcTimestampMs(),
      commit: null,
      dirty: false,
      body: 'Respuesta previa',
    };
    await emitEvent(eventDir, replyEv);

    await noStdout(() =>
      runRetract([docAbs, tid, replyId, '--reason', 'Error en la respuesta'])
    );

    await assertAllEventsConform(eventDir, validate, ev => ev['type'] === 'message.retracted');
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// T4.2 — fix → message.posted con commit real
// ---------------------------------------------------------------------------

test('schema ajv: fix produce message.posted (con SHA) conforme al schema', async () => {
  const validate = await buildValidate();
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Contenido revisado\n', 'utf8');
    await execFileAsync('git', ['add', docAbs], { cwd: gitRoot });

    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');
    const tid = await seedThread(eventDir, 'Conten');

    await runFix([docAbs, tid, '-m', 'fix(doc): aplica corrección', '--body', 'Corrección aplicada']);

    await assertAllEventsConform(eventDir, validate, ev => ev['type'] === 'message.posted');
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// T4.2 — emit → message.posted
// ---------------------------------------------------------------------------

test('schema ajv: emit produce message.posted conforme al schema', async () => {
  const validate = await buildValidate();
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Texto.\n', 'utf8');
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');
    const tid = randomUUID();

    await noStdout(() =>
      runEmit([
        docAbs, 'message.posted',
        `thread_id=${tid}`,
        'author.kind=ai', 'author.model=mesh-review-cli',
        'commit=null',
        'body=Corrección emitida directamente',
      ])
    );

    await assertAllEventsConform(eventDir, validate, ev => ev['type'] === 'message.posted');
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// T4.2 — assign → thread.assigned (con enum restringido en schema)
// ---------------------------------------------------------------------------

test('schema ajv: assign produce thread.assigned conforme al schema (enum agent)', async () => {
  const validate = await buildValidate();
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'Texto.\n', 'utf8');
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');
    const tid = await seedThread(eventDir, 'Texto');

    await noStdout(() =>
      runAssign([docAbs, tid, '--agent', 'reviser'])
    );

    await assertAllEventsConform(eventDir, validate, ev => ev['type'] === 'thread.assigned');
  } finally {
    await cleanup();
  }
});

// Verifica que assign emite con cada agente válido del enum
for (const agent of ['security', 'maths', 'reviser', 'editor'] as const) {
  test(`schema ajv: assign con agent="${agent}" produce thread.assigned conforme al schema`, async () => {
    const validate = await buildValidate();
    const { gitRoot, cleanup } = await makeGitRepo();
    try {
      const docAbs = join(gitRoot, 'doc.md');
      await writeFile(docAbs, 'Texto.\n', 'utf8');
      const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');
      const tid = await seedThread(eventDir, 'Texto');

      await noStdout(() =>
        runAssign([docAbs, tid, '--agent', agent])
      );

      const events = await rawEvents(eventDir);
      const assignEvs = events.filter(ev => ev['type'] === 'thread.assigned');
      assert.strictEqual(assignEvs.length, 1, `assign con "${agent}" emite exactamente 1 evento`);
      assert.strictEqual(assignEvs[0]['agent'], agent, `campo agent = "${agent}"`);

      const valid = validate(assignEvs[0]);
      if (!valid) {
        assert.fail(
          `thread.assigned con agent="${agent}" no válido según schema:\n` +
          JSON.stringify(validate.errors, null, 2)
        );
      }
    } finally {
      await cleanup();
    }
  });
}

// ---------------------------------------------------------------------------
// T4.2 — reanchor → thread.reanchored (ancla desplazada)
// ---------------------------------------------------------------------------

test('schema ajv: reanchor produce thread.reanchored conforme al schema', async () => {
  const validate = await buildValidate();
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'texto ancla\nfin\n', 'utf8');
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    // Ancla en offset 0; en el nuevo texto hay un prefijo que la desplaza
    const tid = await seedThread(eventDir, 'texto ancla');

    const events = await readEvents(eventDir);
    const threads = project(events);
    assert.strictEqual(threads.length, 1, '1 hilo');

    const newText = 'prefijo nuevo\ntexto ancla\nfin\n';
    const count = await reanchorThreads(newText, threads, eventDir);
    assert.strictEqual(count, 1, 'reanchorThreads emite 1 evento');

    await assertAllEventsConform(eventDir, validate, ev => ev['type'] === 'thread.reanchored');
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// T4.2 — reanchor detached → thread.reanchored con detached:true
// ---------------------------------------------------------------------------

test('schema ajv: reanchor (detached) produce thread.reanchored conforme al schema', async () => {
  const validate = await buildValidate();
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'texto ancla\n', 'utf8');
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    const tid = await seedThread(eventDir, 'texto ancla');

    const events = await readEvents(eventDir);
    const threads = project(events);

    // Texto sin la cita → ancla detached
    const count = await reanchorThreads('completamente diferente\n', threads, eventDir);
    assert.strictEqual(count, 1, 'reanchorThreads emite 1 evento (detached)');

    await assertAllEventsConform(eventDir, validate, ev => ev['type'] === 'thread.reanchored');
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// T4.2 — reanchor con uncertain:true también es conforme al schema
// ---------------------------------------------------------------------------

test('schema ajv: reanchor uncertain:true produce thread.reanchored conforme al schema', async () => {
  const validate = await buildValidate();
  const { gitRoot, cleanup } = await makeGitRepo();
  try {
    const docAbs = join(gitRoot, 'doc.md');
    await writeFile(docAbs, 'texto ancla\n', 'utf8');
    const eventDir = join(gitRoot, '.ai', 'review', 'doc.md');

    // Ancla con quote en offset 0; nuevo texto la desplaza >200 chars → uncertain
    const tid = await seedThread(eventDir, 'texto ancla');

    const events = await readEvents(eventDir);
    const threads = project(events);

    const prefix = 'x'.repeat(201);
    const newText = prefix + 'texto ancla';
    const count = await reanchorThreads(newText, threads, eventDir);
    assert.strictEqual(count, 1, 'reanchorThreads emite 1 evento');

    const evs = await rawEvents(eventDir);
    const reanchored = evs.filter(ev => ev['type'] === 'thread.reanchored');
    assert.strictEqual(reanchored.length, 1, '1 evento thread.reanchored');
    assert.strictEqual(reanchored[0]['uncertain'], true, 'uncertain:true para desplazamiento >200');

    const valid = validate(reanchored[0]);
    if (!valid) {
      assert.fail(
        `thread.reanchored con uncertain:true no válido según schema:\n` +
        JSON.stringify(validate.errors, null, 2)
      );
    }
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// Casos negativos: el oneOf del esquema rechaza eventos malformados
// ---------------------------------------------------------------------------

test('schema ajv: rechaza un evento con type desconocido', async () => {
  const validate = await buildValidate();
  const valid = validate({
    version: 2,
    id: randomUUID(),
    thread_id: randomUUID(),
    type: 'thread.exploded',
    author: { kind: 'human' },
    created_at: utcTimestampMs(),
  });
  assert.strictEqual(valid, false, 'un type fuera del oneOf debe fallar la validación');
});

test('schema ajv: rechaza thread.assigned con agent fuera del enum', async () => {
  const validate = await buildValidate();
  const valid = validate({
    version: 2,
    id: randomUUID(),
    thread_id: randomUUID(),
    type: 'thread.assigned',
    agent: 'becario',
    author: { kind: 'human' },
    created_at: utcTimestampMs(),
  });
  assert.strictEqual(valid, false, 'un agent fuera del enum debe fallar la validación');
});

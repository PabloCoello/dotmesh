/**
 * reanchor.test.ts — tests de reanchor.ts
 *
 * Estructura:
 *  - Tests de funciones puras: resolveQuote, firstNonEmptyLineInRange, classifyThread, projectEvents
 *  - Tests de integración con sistema de ficheros: reanchorAfterReplace (usa directorios temporales)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

import {
  resolveQuote,
  firstNonEmptyLineInRange,
  classifyThread,
  projectEvents,
  reanchorAfterReplace,
  type Anchor,
} from './reanchor.ts';

// ---------------------------------------------------------------------------
// Helpers de test
// ---------------------------------------------------------------------------

/** UUIDs fijos para tests (forma válida de UUID). */
const THREAD_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const THREAD_B = 'bbbbbbbb-0000-4000-8000-000000000002';

/** Crea un directorio temporal limpio para aislar cada test de IO. */
async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'mesh-run-reanchor-'));
}

/** Escribe un evento thread.opened en el directorio de eventos dado. */
async function writeOpenedEvent(
  eventDir: string,
  threadId: string,
  anchor: Anchor,
  body = 'Comentario de prueba'
): Promise<void> {
  await mkdir(eventDir, { recursive: true });
  const ev = {
    id: threadId,
    version: 2,
    type: 'thread.opened',
    thread_id: threadId,
    author: { kind: 'human' },
    created_at: '2026-07-16T10:00:00.000Z',
    commit: null,
    dirty: false,
    anchor,
    commentType: 'nota',
    body,
  };
  await writeFile(
    path.join(eventDir, `${threadId}.json`),
    JSON.stringify(ev, null, 2) + '\n',
    'utf8'
  );
}

/** Escribe un evento thread.status-changed para marcar el hilo como resuelto. */
async function writeResolvedEvent(eventDir: string, threadId: string): Promise<void> {
  const id = '00000000-0000-4000-8000-000000000099';
  const ev = {
    id,
    version: 2,
    type: 'thread.status-changed',
    thread_id: threadId,
    author: { kind: 'human' },
    created_at: '2026-07-16T11:00:00.000Z',
    commit: null,
    dirty: false,
    to: 'resolved',
  };
  await writeFile(
    path.join(eventDir, `${id}.json`),
    JSON.stringify(ev, null, 2) + '\n',
    'utf8'
  );
}

/** Lee todos los ficheros .json de un directorio y los parsea. */
async function readAllEvents(dir: string): Promise<Record<string, unknown>[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const results: Record<string, unknown>[] = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const content = await readFile(path.join(dir, name), 'utf8');
    results.push(JSON.parse(content) as Record<string, unknown>);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Tests de resolveQuote
// ---------------------------------------------------------------------------

test('resolveQuote: cita vacía devuelve null', () => {
  const anchor: Anchor = { quote: '', line_hint: 0, char_offset: 0 };
  assert.strictEqual(resolveQuote('cualquier texto', anchor), null);
});

test('resolveQuote: cita no encontrada devuelve null', () => {
  const anchor: Anchor = { quote: 'ausente', line_hint: 0, char_offset: 0 };
  assert.strictEqual(resolveQuote('texto sin la frase', anchor), null);
});

test('resolveQuote: ocurrencia única devuelve offsets correctos', () => {
  const text = 'abc def ghi';
  const anchor: Anchor = { quote: 'def', line_hint: 0, char_offset: 4 };
  const result = resolveQuote(text, anchor);
  assert.deepStrictEqual(result, { startOffset: 4, endOffset: 7 });
});

test('resolveQuote: múltiples ocurrencias — gana la más cercana a char_offset', () => {
  // 'match' aparece en offset 0 y offset 12
  const text = 'match text  match text';
  //            0123456789012345678901
  //            ^           ^
  //            0           12

  // char_offset cerca del segundo → selecciona offset 12
  const anchor1: Anchor = { quote: 'match', line_hint: 0, char_offset: 12 };
  const r1 = resolveQuote(text, anchor1);
  assert.deepStrictEqual(r1, { startOffset: 12, endOffset: 17 });

  // char_offset cerca del primero → selecciona offset 0
  const anchor2: Anchor = { quote: 'match', line_hint: 0, char_offset: 0 };
  const r2 = resolveQuote(text, anchor2);
  assert.deepStrictEqual(r2, { startOffset: 0, endOffset: 5 });
});

// ---------------------------------------------------------------------------
// Tests de firstNonEmptyLineInRange
// ---------------------------------------------------------------------------

test('firstNonEmptyLineInRange: rango vacío devuelve null', () => {
  const result = firstNonEmptyLineInRange('abc\ndef\n', 4, 4);
  assert.strictEqual(result, null);
});

test('firstNonEmptyLineInRange: rango con solo líneas en blanco devuelve null', () => {
  const text = 'before\n   \n  \nafter\n';
  //            01234567 8901234 56789
  // Rango [7, 14) cubre '   \n  \n'
  const result = firstNonEmptyLineInRange(text, 7, 14);
  assert.strictEqual(result, null);
});

test('firstNonEmptyLineInRange: devuelve la primera línea no vacía con offsets y lineNumber', () => {
  const text = 'line0\nline1\nline2\n';
  //            0     6     12    17
  // Rango [6, 17) cubre 'line1\nline2\n'
  const result = firstNonEmptyLineInRange(text, 6, 17);
  assert.ok(result !== null);
  assert.strictEqual(result.lineText, 'line1');
  assert.strictEqual(result.lineStart, 6);
  assert.strictEqual(result.lineNumber, 1);
});

test('firstNonEmptyLineInRange: salta líneas vacías iniciales', () => {
  const text = '\n\ncontent\n';
  //            0 1 2       9
  // Rango [0, 9)
  const result = firstNonEmptyLineInRange(text, 0, 9);
  assert.ok(result !== null);
  assert.strictEqual(result.lineText, 'content');
  assert.strictEqual(result.lineStart, 2);
  assert.strictEqual(result.lineNumber, 2);
});

// ---------------------------------------------------------------------------
// Tests de classifyThread
// ---------------------------------------------------------------------------

// Textos de prueba compartidos
//   textBefore: 'antes\nbloque\ndespues\n'
//   'antes\n'   = offset 0-5 (con \n en 5)
//   'bloque\n'  = offset 6-12 (con \n en 12)
//   'despues\n' = offset 13-20
//   previousOutputRange = { startOffset: 6, endOffset: 13 }  ← cubre 'bloque\n'
//   'bloque' está en offset 6, dentro del rango [6, 13)

const TB = 'antes\nbloque\ndespues\n';
const PREV_RANGE = { startOffset: 6, endOffset: 13 };
// textAfter con nuevo contenido (bloque reemplazado por 'nuevo\n')
const TA_NEW = 'antes\nnuevo\ndespues\n';
const NEW_RANGE = { startOffset: 6, endOffset: 12 };

test('classifyThread: ancla fuera del rango anterior → ignore', () => {
  // 'antes' está en offset 0, fuera de [6, 13)
  const anchor: Anchor = { quote: 'antes', line_hint: 0, char_offset: 0 };
  const decision = classifyThread(anchor, TB, TA_NEW, PREV_RANGE, NEW_RANGE);
  assert.strictEqual(decision.action, 'ignore');
});

test('classifyThread: cita resolvía en el bloque anterior pero sigue en textAfter → ignore', () => {
  // 'antes' aparece también en textAfter (no fue reemplazado)
  const anchor: Anchor = { quote: 'antes', line_hint: 0, char_offset: 0 };
  // Usamos un rango que incluye 'antes' en textBefore (offset 0)
  const prevRange = { startOffset: 0, endOffset: 6 };
  const decision = classifyThread(anchor, TB, TA_NEW, prevRange, NEW_RANGE);
  // 'antes' sigue en TA_NEW → ignore
  assert.strictEqual(decision.action, 'ignore');
});

test('classifyThread: cita en bloque anterior, desaparece en textAfter, newOutputRange no null → reanchor', () => {
  const anchor: Anchor = { quote: 'bloque', line_hint: 1, char_offset: 6 };
  const decision = classifyThread(anchor, TB, TA_NEW, PREV_RANGE, NEW_RANGE);
  assert.strictEqual(decision.action, 'reanchor');
  if (decision.action === 'reanchor') {
    assert.strictEqual(decision.oldQuote, 'bloque');
    // La primera línea no vacía de TA_NEW en [6, 12) es 'nuevo'
    assert.strictEqual(decision.newAnchor.quote, 'nuevo');
    assert.strictEqual(decision.newAnchor.char_offset, 6);
    assert.strictEqual(decision.newAnchor.line_hint, 1);
  }
});

test('classifyThread: cita en bloque anterior, desaparece en textAfter, newOutputRange null → detach', () => {
  const anchor: Anchor = { quote: 'bloque', line_hint: 1, char_offset: 6 };
  const decision = classifyThread(anchor, TB, TA_NEW, PREV_RANGE, null);
  assert.strictEqual(decision.action, 'detach');
  if (decision.action === 'detach') {
    assert.strictEqual(decision.oldQuote, 'bloque');
  }
});

test('classifyThread: cita duplicada — char_offset desambigua correctamente (dentro del rango)', () => {
  // 'frase' aparece en offset 0 y en offset 12
  // textBefore = 'frase\nprosa\nfrase\nfin\n'
  //               0     6     12    18
  const textBefore = 'frase\nprosa\nfrase\nfin\n';
  // prevRange cubre el segundo 'frase' [12, 18)
  const prevRange = { startOffset: 12, endOffset: 18 };
  // textAfter: el segundo 'frase' fue reemplazado por 'nuevo'
  const textAfter = 'frase\nprosa\nnuevo\nfin\n';
  const newRange = { startOffset: 12, endOffset: 18 };

  // anchor.char_offset cerca del segundo (12) → resuelve a offset 12 (dentro del rango) → reanchor
  const anchor: Anchor = { quote: 'frase', line_hint: 2, char_offset: 12 };
  const decision = classifyThread(anchor, textBefore, textAfter, prevRange, newRange);
  // 'frase' sigue en textAfter (offset 0), por lo que resolveQuote lo encuentra
  // → pero la decisión final depende de si resuelve en textAfter → sí, offset 0 → ignore
  //
  // Espera: 'frase' está en textAfter en offset 0 → classifyThread devuelve 'ignore'
  // Esto verifica que incluso cuando la cita estaba en el rango previo,
  // si sigue resolviendo en textAfter (fuera del bloque) → no se re-ancla.
  assert.strictEqual(decision.action, 'ignore');
});

test('classifyThread: cita duplicada — char_offset selecciona la de fuera del rango → ignore', () => {
  // 'word' en offset 0 (fuera) y offset 10 (dentro del rango previo)
  const textBefore = 'word prev\nword now\nrest\n';
  //                   0         10        19
  const prevRange = { startOffset: 10, endOffset: 19 };
  const textAfter = 'word prev\nnew  now\nrest\n';
  const newRange = { startOffset: 10, endOffset: 19 };

  // char_offset = 0 → más cercano a offset 0 (fuera del rango) → classifyThread ignora
  const anchor: Anchor = { quote: 'word', line_hint: 0, char_offset: 0 };
  const decision = classifyThread(anchor, textBefore, textAfter, prevRange, newRange);
  assert.strictEqual(decision.action, 'ignore');
});

// ---------------------------------------------------------------------------
// Tests de projectEvents
// ---------------------------------------------------------------------------

test('projectEvents: sin eventos devuelve []', () => {
  assert.deepStrictEqual(projectEvents([]), []);
});

test('projectEvents: thread.opened crea hilo abierto con ancla correcta', () => {
  const anchor: Anchor = { quote: 'texto', line_hint: 0, char_offset: 5 };
  const ev = {
    id: THREAD_A,
    version: 2 as const,
    type: 'thread.opened',
    thread_id: THREAD_A,
    author: { kind: 'human' as const },
    created_at: '2026-07-16T10:00:00.000Z',
    commit: null,
    dirty: false,
    anchor,
    commentType: 'nota',
    body: 'cuerpo',
  };
  const threads = projectEvents([ev]);
  assert.strictEqual(threads.length, 1);
  assert.strictEqual(threads[0].status, 'open');
  assert.deepStrictEqual(threads[0].anchor, anchor);
});

test('projectEvents: thread.reanchored actualiza el ancla', () => {
  const anchor1: Anchor = { quote: 'original', line_hint: 0, char_offset: 0 };
  const anchor2: Anchor = { quote: 'nueva', line_hint: 2, char_offset: 10 };
  const events = [
    {
      id: THREAD_A,
      version: 2 as const,
      type: 'thread.opened',
      thread_id: THREAD_A,
      author: { kind: 'human' as const },
      created_at: '2026-07-16T10:00:00.000Z',
      commit: null,
      dirty: false,
      anchor: anchor1,
      commentType: 'nota',
      body: 'b',
    },
    {
      id: THREAD_B,
      version: 2 as const,
      type: 'thread.reanchored',
      thread_id: THREAD_A,
      author: { kind: 'ai' as const, model: 'mesh-run', subagent: 'runner' },
      created_at: '2026-07-16T11:00:00.000Z',
      commit: null,
      dirty: true,
      anchor: anchor2,
    },
  ];
  const threads = projectEvents(events);
  assert.strictEqual(threads.length, 1);
  assert.deepStrictEqual(threads[0].anchor, anchor2);
  assert.strictEqual(threads[0].status, 'open');
});

test('projectEvents: thread.status-changed a resolved marca el hilo como resuelto', () => {
  const anchor: Anchor = { quote: 'txt', line_hint: 0, char_offset: 0 };
  const events = [
    {
      id: THREAD_A,
      version: 2 as const,
      type: 'thread.opened',
      thread_id: THREAD_A,
      author: { kind: 'human' as const },
      created_at: '2026-07-16T10:00:00.000Z',
      commit: null,
      dirty: false,
      anchor,
      commentType: 'nota',
      body: 'b',
    },
    {
      id: THREAD_B,
      version: 2 as const,
      type: 'thread.status-changed',
      thread_id: THREAD_A,
      author: { kind: 'human' as const },
      created_at: '2026-07-16T11:00:00.000Z',
      commit: null,
      dirty: false,
      to: 'resolved',
    },
  ];
  const threads = projectEvents(events);
  assert.strictEqual(threads.length, 1);
  assert.strictEqual(threads[0].status, 'resolved');
});

// ---------------------------------------------------------------------------
// Tests de integración: reanchorAfterReplace con sistema de ficheros temporal
// ---------------------------------------------------------------------------

test('reanchorAfterReplace: gitRoot null → no hace nada', async () => {
  const gitRoot = await makeTempDir();
  const eventDir = path.join(gitRoot, '.ai', 'review', 'doc.md');
  await writeOpenedEvent(
    eventDir,
    THREAD_A,
    { quote: 'bloque', line_hint: 1, char_offset: 6 }
  );

  await reanchorAfterReplace({
    docFsPath: path.join(gitRoot, 'doc.md'),
    gitRoot: null,
    textBefore: 'antes\nbloque\nfin\n',
    textAfter: 'antes\nnuevo\nfin\n',
    previousOutputRange: { startOffset: 6, endOffset: 13 },
    newOutputRange: { startOffset: 6, endOffset: 12 },
  });

  // Solo el evento inicial debe existir — no se ha escrito nada
  const events = await readAllEvents(eventDir);
  assert.strictEqual(events.length, 1);
});

test('reanchorAfterReplace: previousOutputRange null → no hace nada', async () => {
  const gitRoot = await makeTempDir();
  const eventDir = path.join(gitRoot, '.ai', 'review', 'doc.md');
  await writeOpenedEvent(
    eventDir,
    THREAD_A,
    { quote: 'bloque', line_hint: 1, char_offset: 6 }
  );

  await reanchorAfterReplace({
    docFsPath: path.join(gitRoot, 'doc.md'),
    gitRoot,
    textBefore: 'antes\nbloque\nfin\n',
    textAfter: 'antes\nnuevo\nfin\n',
    previousOutputRange: null,
    newOutputRange: { startOffset: 6, endOffset: 12 },
  });

  const events = await readAllEvents(eventDir);
  assert.strictEqual(events.length, 1);
});

test('reanchorAfterReplace: sin hilos abiertos → no escribe eventos', async () => {
  // Directorio de eventos vacío (no existe)
  const gitRoot = await makeTempDir();

  await reanchorAfterReplace({
    docFsPath: path.join(gitRoot, 'doc.md'),
    gitRoot,
    textBefore: 'antes\nbloque\nfin\n',
    textAfter: 'antes\nnuevo\nfin\n',
    previousOutputRange: { startOffset: 6, endOffset: 13 },
    newOutputRange: { startOffset: 6, endOffset: 12 },
  });

  // El directorio de eventos no debe haberse creado (o estar vacío)
  const eventDir = path.join(gitRoot, '.ai', 'review', 'doc.md');
  const events = await readAllEvents(eventDir);
  assert.strictEqual(events.length, 0);
});

test('reanchorAfterReplace: hilo resuelto → no escribe eventos', async () => {
  const gitRoot = await makeTempDir();
  const eventDir = path.join(gitRoot, '.ai', 'review', 'doc.md');
  await writeOpenedEvent(
    eventDir,
    THREAD_A,
    { quote: 'bloque', line_hint: 1, char_offset: 6 }
  );
  await writeResolvedEvent(eventDir, THREAD_A);

  await reanchorAfterReplace({
    docFsPath: path.join(gitRoot, 'doc.md'),
    gitRoot,
    textBefore: 'antes\nbloque\nfin\n',
    textAfter: 'antes\nnuevo\nfin\n',
    previousOutputRange: { startOffset: 6, endOffset: 13 },
    newOutputRange: { startOffset: 6, endOffset: 12 },
  });

  // Solo los 2 eventos iniciales, sin nuevos
  const events = await readAllEvents(eventDir);
  assert.strictEqual(events.length, 2);
});

test('reanchorAfterReplace: cita desaparece → escribe thread.reanchored + message.posted', async () => {
  const gitRoot = await makeTempDir();
  const eventDir = path.join(gitRoot, '.ai', 'review', 'doc.md');
  const anchor: Anchor = { quote: 'bloque', line_hint: 1, char_offset: 6 };
  await writeOpenedEvent(eventDir, THREAD_A, anchor);

  // textBefore: 'antes\nbloque\nfin\n'   ← 'bloque' en offset 6, dentro de [6,13)
  // textAfter:  'antes\nnuevo\nfin\n'    ← 'bloque' no existe
  await reanchorAfterReplace({
    docFsPath: path.join(gitRoot, 'doc.md'),
    gitRoot,
    textBefore: 'antes\nbloque\nfin\n',
    textAfter: 'antes\nnuevo\nfin\n',
    previousOutputRange: { startOffset: 6, endOffset: 13 },
    newOutputRange: { startOffset: 6, endOffset: 12 },
  });

  const events = await readAllEvents(eventDir);
  // 1 original + 2 nuevos (thread.reanchored + message.posted)
  assert.strictEqual(events.length, 3);

  const newEvents = events.filter(e => e['type'] !== 'thread.opened');
  const reanchored = newEvents.find(e => e['type'] === 'thread.reanchored');
  const message = newEvents.find(e => e['type'] === 'message.posted');

  assert.ok(reanchored !== undefined, 'debe existir evento thread.reanchored');
  assert.ok(message !== undefined, 'debe existir evento message.posted');

  // El evento reanchored tiene ancla (no detached)
  assert.ok('anchor' in reanchored, 'thread.reanchored debe tener anchor');
  assert.ok(!('detached' in reanchored), 'thread.reanchored no debe tener detached');

  // El message.posted menciona la cita anterior
  assert.ok(
    typeof message['body'] === 'string' && message['body'].includes('bloque'),
    'el body de message.posted debe mencionar la cita anterior'
  );
});

test('reanchorAfterReplace: bloque eliminado (newOutputRange null) → thread.reanchored con detached:true', async () => {
  const gitRoot = await makeTempDir();
  const eventDir = path.join(gitRoot, '.ai', 'review', 'doc.md');
  const anchor: Anchor = { quote: 'bloque', line_hint: 1, char_offset: 6 };
  await writeOpenedEvent(eventDir, THREAD_A, anchor);

  await reanchorAfterReplace({
    docFsPath: path.join(gitRoot, 'doc.md'),
    gitRoot,
    textBefore: 'antes\nbloque\nfin\n',
    textAfter: 'antes\nfin\n',
    previousOutputRange: { startOffset: 6, endOffset: 13 },
    newOutputRange: null,
  });

  const events = await readAllEvents(eventDir);
  // 1 original + 1 nuevo (thread.reanchored detached)
  assert.strictEqual(events.length, 2);

  const reanchored = events.find(e => e['type'] === 'thread.reanchored');
  assert.ok(reanchored !== undefined);
  assert.strictEqual(reanchored['detached'], true);
  assert.ok(!('anchor' in reanchored), 'detached no debe tener campo anchor');
});

// ---------------------------------------------------------------------------
// Validación estructural de los eventos generados contra el schema V2
// ---------------------------------------------------------------------------

test('reanchorAfterReplace: evento thread.reanchored generado valida contra schema V2', async () => {
  const gitRoot = await makeTempDir();
  const eventDir = path.join(gitRoot, '.ai', 'review', 'doc.md');
  const anchor: Anchor = { quote: 'bloque', line_hint: 1, char_offset: 6 };
  await writeOpenedEvent(eventDir, THREAD_A, anchor);

  await reanchorAfterReplace({
    docFsPath: path.join(gitRoot, 'doc.md'),
    gitRoot,
    textBefore: 'antes\nbloque\nfin\n',
    textAfter: 'antes\nnuevo\nfin\n',
    previousOutputRange: { startOffset: 6, endOffset: 13 },
    newOutputRange: { startOffset: 6, endOffset: 12 },
  });

  const events = await readAllEvents(eventDir);
  const reanchored = events.find(e => e['type'] === 'thread.reanchored');
  assert.ok(reanchored !== undefined);

  // Campos de sobre obligatorios
  assert.strictEqual(reanchored['version'], 2);
  assert.strictEqual(typeof reanchored['id'], 'string');
  assert.strictEqual(typeof reanchored['thread_id'], 'string');
  assert.strictEqual(typeof reanchored['created_at'], 'string');
  assert.strictEqual(reanchored['commit'], null);
  assert.strictEqual(reanchored['dirty'], true);

  // UUID v4 (patrón estricto del schema)
  const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(reanchored['id'] as string, uuidV4Pattern, 'id debe ser UUID v4');
  assert.match(reanchored['thread_id'] as string, uuidV4Pattern, 'thread_id debe ser UUID v4');

  // Timestamp ISO con milisegundos
  const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  assert.match(reanchored['created_at'] as string, isoPattern, 'created_at debe ser ISO UTC');

  // Author
  const author = reanchored['author'] as Record<string, unknown>;
  assert.strictEqual(author['kind'], 'ai');
  assert.strictEqual(author['model'], 'mesh-run');
  assert.strictEqual(author['subagent'], 'runner');

  // Ancla (variante re-anchor: tiene 'anchor', no tiene 'detached')
  const anchorField = reanchored['anchor'] as Record<string, unknown>;
  assert.ok(anchorField !== undefined, 'debe tener campo anchor');
  assert.strictEqual(typeof anchorField['quote'], 'string');
  assert.ok((anchorField['quote'] as string).length > 0, 'anchor.quote no puede ser vacío');
  assert.strictEqual(typeof anchorField['line_hint'], 'number');
  assert.strictEqual(typeof anchorField['char_offset'], 'number');
});

test('reanchorAfterReplace: evento message.posted generado valida contra schema V2', async () => {
  const gitRoot = await makeTempDir();
  const eventDir = path.join(gitRoot, '.ai', 'review', 'doc.md');
  const anchor: Anchor = { quote: 'bloque', line_hint: 1, char_offset: 6 };
  await writeOpenedEvent(eventDir, THREAD_A, anchor);

  await reanchorAfterReplace({
    docFsPath: path.join(gitRoot, 'doc.md'),
    gitRoot,
    textBefore: 'antes\nbloque\nfin\n',
    textAfter: 'antes\nnuevo\nfin\n',
    previousOutputRange: { startOffset: 6, endOffset: 13 },
    newOutputRange: { startOffset: 6, endOffset: 12 },
  });

  const events = await readAllEvents(eventDir);
  const message = events.find(e => e['type'] === 'message.posted');
  assert.ok(message !== undefined);

  assert.strictEqual(message['version'], 2);
  const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  assert.match(message['id'] as string, uuidV4Pattern);
  assert.match(message['thread_id'] as string, uuidV4Pattern);
  const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  assert.match(message['created_at'] as string, isoPattern);

  const author = message['author'] as Record<string, unknown>;
  assert.strictEqual(author['kind'], 'ai');
  assert.strictEqual(author['model'], 'mesh-run');

  assert.strictEqual(typeof message['body'], 'string');
  assert.ok((message['body'] as string).length > 0, 'body no puede ser vacío');

  assert.strictEqual(message['commit'], null);
  assert.strictEqual(message['dirty'], true);
});

/**
 * reanchor.ts — re-anclaje de hilos de mesh-review tras reemplazar un bloque de salida.
 *
 * Funciones puras (resolución de anclas, clasificación de hilos, proyección de eventos)
 * separadas de la capa IO (lectura/escritura de ficheros en .ai/review/).
 *
 * No importa ningún módulo de vscode/ ni de review-extension. Sigue el contrato
 * JSON de agents/.agents/skills/doc-review/schema.json (versión 2).
 *
 * Seguridad (path traversal): la ruta relativa del documento se valida antes de
 * usarla como componente de ruta en el sistema de ficheros. Se rechaza cualquier
 * docFsPath que escape del gitRoot o que produzca un componente absoluto.
 */

import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Tipos locales — subconjunto del schema V2
// (no se importa review-extension; solo se sigue el contrato JSON)
// ---------------------------------------------------------------------------

export interface Anchor {
  quote: string;
  line_hint: number;
  char_offset: number;
}

type Author =
  | { kind: 'human'; name?: string }
  | { kind: 'ai'; model: string; effort?: string; subagent?: string };

interface EventEnvelope {
  id: string;
  version: 2;
  type: string;
  thread_id: string;
  author: Author;
  created_at: string;
  commit: string | null;
  dirty: boolean;
  [key: string]: unknown;
}

interface ThreadProjection {
  thread_id: string;
  anchor: Anchor | { detached: true };
  status: 'open' | 'resolved' | 'detached';
}

// ---------------------------------------------------------------------------
// Interfaz pública de la función principal
// ---------------------------------------------------------------------------

export interface ReanchorOptions {
  docFsPath: string;
  gitRoot: string | null;
  /** Texto del documento antes del reemplazo. */
  textBefore: string;
  /** Texto del documento después del reemplazo. */
  textAfter: string;
  /** Rango del bloque de salida anterior en textBefore. null si no existía. */
  previousOutputRange: {
    startOffset: number;
    endOffset: number;
  } | null;
  /** Rango del bloque nuevo en textAfter. null si el bloque fue eliminado. */
  newOutputRange: {
    startOffset: number;
    endOffset: number;
  } | null;
}

/** Autor fijo para todos los eventos escritos por mesh-run. */
const AI_AUTHOR: Author = { kind: 'ai', model: 'mesh-run', subagent: 'runner' };

// ---------------------------------------------------------------------------
// Funciones puras: resolución de anclas
// ---------------------------------------------------------------------------

/**
 * Resuelve un ancla buscando `anchor.quote` en `text`.
 *
 * Replica la semántica de review-extension/src/anchor.ts:
 * - Si hay varias ocurrencias, elige la más cercana a `anchor.char_offset`.
 * - Devuelve null si la cita no aparece en el texto o es vacía.
 */
export function resolveQuote(
  text: string,
  anchor: Anchor
): { startOffset: number; endOffset: number } | null {
  const { quote, char_offset } = anchor;
  if (!quote) return null;

  const occurrences: number[] = [];
  let searchFrom = 0;
  while (searchFrom <= text.length) {
    const idx = text.indexOf(quote, searchFrom);
    if (idx === -1) break;
    occurrences.push(idx);
    searchFrom = idx + 1;
  }

  if (occurrences.length === 0) return null;
  if (occurrences.length === 1) {
    return { startOffset: occurrences[0], endOffset: occurrences[0] + quote.length };
  }

  // Varias ocurrencias: la más cercana a char_offset gana
  let best = occurrences[0];
  let bestDist = Math.abs(occurrences[0] - char_offset);
  for (let i = 1; i < occurrences.length; i++) {
    const dist = Math.abs(occurrences[i] - char_offset);
    if (dist < bestDist) {
      bestDist = dist;
      best = occurrences[i];
    }
  }
  return { startOffset: best, endOffset: best + quote.length };
}

/**
 * Primera línea no vacía (trim !== '') dentro del rango [rangeStart, rangeEnd) de text.
 * Devuelve null si no hay ninguna línea no vacía en ese rango.
 */
export function firstNonEmptyLineInRange(
  text: string,
  rangeStart: number,
  rangeEnd: number
): { lineStart: number; lineText: string; lineNumber: number } | null {
  // Número de línea (base 0) al inicio del rango
  let lineNumber = text.slice(0, rangeStart).split('\n').length - 1;
  let pos = rangeStart;

  while (pos < rangeEnd) {
    const nlIdx = text.indexOf('\n', pos);
    const lineEnd = nlIdx === -1 ? text.length : nlIdx;
    const effectiveEnd = Math.min(lineEnd, rangeEnd);
    const lineText = text.slice(pos, effectiveEnd);
    if (lineText.trim() !== '') {
      return { lineStart: pos, lineText, lineNumber };
    }
    lineNumber++;
    pos = lineEnd + 1;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Funciones puras: clasificación de hilos
// ---------------------------------------------------------------------------

export type ThreadDecision =
  | { action: 'ignore' }
  | { action: 'reanchor'; newAnchor: Anchor; oldQuote: string }
  | { action: 'detach'; oldQuote: string };

/**
 * Decide qué hacer con un hilo cuyo ancla actual es `anchor` tras el reemplazo.
 *
 * Reglas (en orden de prioridad):
 * 1. La cita no resolvía dentro de previousOutputRange en textBefore → ignore.
 * 2. La cita sigue resolviendo en textAfter (donde sea) → ignore.
 * 3. newOutputRange es null (bloque eliminado) → detach.
 * 4. Hay una primera línea no vacía en el nuevo bloque → reanchor con esa línea.
 * 5. Sin línea no vacía en el nuevo bloque (bloque vacío) → detach (fallback).
 */
export function classifyThread(
  anchor: Anchor,
  textBefore: string,
  textAfter: string,
  previousOutputRange: { startOffset: number; endOffset: number },
  newOutputRange: { startOffset: number; endOffset: number } | null
): ThreadDecision {
  // 1. ¿La cita resolvía dentro del bloque anterior?
  const resolvedBefore = resolveQuote(textBefore, anchor);
  if (
    resolvedBefore === null ||
    resolvedBefore.startOffset < previousOutputRange.startOffset ||
    resolvedBefore.startOffset >= previousOutputRange.endOffset
  ) {
    return { action: 'ignore' };
  }

  // 2. ¿La cita sigue resolviendo en textAfter?
  const resolvedAfter = resolveQuote(textAfter, anchor);
  if (resolvedAfter !== null) {
    return { action: 'ignore' };
  }

  const oldQuote = anchor.quote;

  // 3. Bloque eliminado → detach
  if (newOutputRange === null) {
    return { action: 'detach', oldQuote };
  }

  // 4. Re-anclar a la primera línea no vacía del nuevo bloque
  const firstLine = firstNonEmptyLineInRange(
    textAfter,
    newOutputRange.startOffset,
    newOutputRange.endOffset
  );
  if (firstLine === null) {
    // 5. Bloque nuevo vacío → detach (fallback defensivo)
    return { action: 'detach', oldQuote };
  }

  const newAnchor: Anchor = {
    quote: firstLine.lineText,
    line_hint: firstLine.lineNumber,
    char_offset: firstLine.lineStart,
  };
  return { action: 'reanchor', newAnchor, oldQuote };
}

// ---------------------------------------------------------------------------
// Funciones puras: proyección mínima de eventos V2
// ---------------------------------------------------------------------------

/** Valida forma de UUID (leniente: acepta cualquier 8-4-4-4-12 hex). */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function compareEvents(a: EventEnvelope, b: EventEnvelope): number {
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (ta !== tb) return ta - tb;
  // thread.opened precede a cualquier mutación del mismo instante
  const ra = a.type === 'thread.opened' ? 0 : 1;
  const rb = b.type === 'thread.opened' ? 0 : 1;
  if (ra !== rb) return ra - rb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Proyecta un array de eventos V2 al estado neto de cada hilo.
 * Maneja: thread.opened, thread.reanchored (con anchor o con detached:true),
 * thread.status-changed. Ignora el resto (message.posted, etc.).
 * Pura: no muta el array de entrada.
 */
export function projectEvents(events: EventEnvelope[]): ThreadProjection[] {
  const sorted = [...events].sort(compareEvents);
  const map = new Map<string, ThreadProjection>();
  const order: string[] = [];

  for (const ev of sorted) {
    const tid = ev.thread_id;

    if (ev.type === 'thread.opened') {
      map.set(tid, {
        thread_id: tid,
        anchor: ev['anchor'] as Anchor,
        status: 'open',
      });
      order.push(tid);
      continue;
    }

    const proj = map.get(tid);
    if (!proj) continue; // defensivo: hilo desconocido

    if (ev.type === 'thread.reanchored') {
      if (ev['anchor'] !== undefined) {
        proj.anchor = ev['anchor'] as Anchor;
        if (proj.status === 'detached') proj.status = 'open';
      } else if (ev['detached'] === true) {
        proj.anchor = { detached: true };
        proj.status = 'detached';
      }
    } else if (ev.type === 'thread.status-changed') {
      proj.status = ev['to'] as 'open' | 'resolved' | 'detached';
    }
  }

  return order.map(id => map.get(id)!);
}

// ---------------------------------------------------------------------------
// IO: lectura de eventos del directorio del sidecar
// ---------------------------------------------------------------------------

async function readEventsFromDir(dir: string): Promise<EventEnvelope[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const results: EventEnvelope[] = [];
  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    try {
      const content = await readFile(path.join(dir, name), 'utf8');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (parsed?.version !== 2) continue;
      // Defensa: descartar eventos con id o thread_id que no sean UUID válido
      if (typeof parsed.id !== 'string' || !isUuid(parsed.id)) continue;
      if (typeof parsed.thread_id !== 'string' || !isUuid(parsed.thread_id)) continue;
      results.push(parsed as unknown as EventEnvelope);
    } catch {
      // fichero ilegible o JSON inválido — se ignora
    }
  }
  results.sort(compareEvents);
  return results;
}

// ---------------------------------------------------------------------------
// IO: escritura de un evento en el directorio del sidecar
// ---------------------------------------------------------------------------

async function writeEventToDir(dir: string, event: EventEnvelope): Promise<void> {
  // Guarda de path traversal: el id se convierte en nombre de fichero
  if (!isUuid(event.id)) {
    throw new Error(`mesh-run: id de evento inválido (no es UUID): ${event.id}`);
  }
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${event.id}.json`),
    JSON.stringify(event, null, 2) + '\n',
    'utf8'
  );
}

// ---------------------------------------------------------------------------
// Función principal
// ---------------------------------------------------------------------------

/**
 * Tras reemplazar o eliminar un bloque de salida, comprueba si algún hilo
 * abierto de mesh-review estaba anclado dentro del bloque anterior y, si es
 * así, emite los eventos de re-anclaje o detach necesarios.
 *
 * Seguridad: valida que docFsPath esté dentro de gitRoot antes de derivar la
 * ruta relativa que se usa como componente del directorio de eventos.
 */
export async function reanchorAfterReplace(opts: ReanchorOptions): Promise<void> {
  const {
    docFsPath,
    gitRoot,
    textBefore,
    textAfter,
    previousOutputRange,
    newOutputRange,
  } = opts;

  // Caso 1: sin git root o sin rango previo → no hacer nada
  if (gitRoot === null || previousOutputRange === null) return;

  // Seguridad: verificar que docFsPath está dentro de gitRoot
  const docRelPath = path.relative(gitRoot, docFsPath);
  if (docRelPath.startsWith('..') || path.isAbsolute(docRelPath)) {
    // docFsPath escapa del gitRoot — no actuar
    return;
  }

  const eventDir = path.join(gitRoot, '.ai', 'review', docRelPath);

  // Leer y proyectar eventos existentes
  const events = await readEventsFromDir(eventDir);
  const threads = projectEvents(events);
  const openThreads = threads.filter(t => t.status === 'open');

  if (openThreads.length === 0) return;

  const now = new Date().toISOString();

  for (const thread of openThreads) {
    // Hilos con ancla ya detached se omiten
    if ('detached' in thread.anchor) continue;

    const anchor = thread.anchor as Anchor;
    const decision = classifyThread(
      anchor,
      textBefore,
      textAfter,
      previousOutputRange,
      newOutputRange
    );

    if (decision.action === 'ignore') continue;

    if (decision.action === 'detach') {
      const ev: EventEnvelope = {
        id: randomUUID(),
        version: 2,
        type: 'thread.reanchored',
        thread_id: thread.thread_id,
        author: AI_AUTHOR,
        created_at: now,
        commit: null,
        dirty: true,
        detached: true,
      };
      await writeEventToDir(eventDir, ev);
      continue;
    }

    // action === 'reanchor': emite thread.reanchored + message.posted
    const reanchorEv: EventEnvelope = {
      id: randomUUID(),
      version: 2,
      type: 'thread.reanchored',
      thread_id: thread.thread_id,
      author: AI_AUTHOR,
      created_at: now,
      commit: null,
      dirty: true,
      anchor: decision.newAnchor,
    };
    await writeEventToDir(eventDir, reanchorEv);

    const messageEv: EventEnvelope = {
      id: randomUUID(),
      version: 2,
      type: 'message.posted',
      thread_id: thread.thread_id,
      author: AI_AUTHOR,
      created_at: now,
      commit: null,
      dirty: true,
      body: `Re-anclado por mesh-run: la cita anterior era «${decision.oldQuote}».`,
    };
    await writeEventToDir(eventDir, messageEv);
  }
}

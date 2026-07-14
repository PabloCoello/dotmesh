/**
 * sidecar.ts — lectura/escritura del sidecar JSON y detección del git root.
 *
 * Lógica pura separada de la capa VS Code: ninguna importación de 'vscode'.
 * Exporta funciones de rutas, hash, IO y comprobación de gitignore.
 *
 * Conviven dos formatos:
 *   V1 — sidecar plano (Sidecar, Comment, CommentType, Status originales).
 *        Los tests existentes cubren este formato; no se rompe.
 *   V2 — modelo event-sourced (EventEnvelope, Author, ThreadProjection, …).
 *        Los nuevos tipos se añaden de forma aditiva a continuación.
 */

import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, appendFile, chmod, readdir, stat } from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Tipos V1 (schema V1, coinciden con agents/.agents/skills/doc-review/schema.json)
// ---------------------------------------------------------------------------

export interface Anchor {
  quote: string;
  line_hint: number;
  char_offset: number;
}

/** V1 tenía 5 tipos; V2 añade 'referencia' y 'supuesto' como anotaciones durables. */
export type CommentType =
  | 'edita' | 'sugerencia' | 'pregunta' | 'verifica' | 'nota'
  | 'referencia' | 'supuesto';

/** V1 tenía 'open' | 'resolved'; V2 añade 'detached' para anclas rotas. */
export type Status = 'open' | 'resolved' | 'detached';

export interface Comment {
  id: string;
  anchor: Anchor;
  type: CommentType;
  agent?: string;
  body: string;
  status: Status;
  created_at: string;
  updated_at: string;
}

export interface Sidecar {
  version: 1;
  file: string;
  comments: Comment[];
}

// ---------------------------------------------------------------------------
// Tipos V2 — modelo event-sourced
// (coinciden con $defs de agents/.agents/skills/doc-review/schema.json)
// ---------------------------------------------------------------------------

export type EventType =
  | 'thread.opened'
  | 'message.posted'
  | 'message.revised'
  | 'message.retracted'
  | 'thread.status-changed'
  | 'thread.reanchored'
  | 'thread.assigned';

export type Author =
  | { kind: 'human'; name?: string }
  | { kind: 'ai'; model: string; effort?: string; subagent?: string };

/**
 * Sobre común a todos los eventos V2.
 * Los campos opcionales de cada tipo de evento (anchor, body, to, …) se
 * acceden a través del índice de cadena; la lógica de proyección los
 * extrae con comprobación en tiempo de ejecución.
 */
export interface EventEnvelope {
  id: string;
  version: 2;
  type: EventType;
  thread_id: string;
  author: Author;
  created_at: string;
  commit: string | null;
  dirty: boolean;
  [key: string]: unknown;
}

export interface MessageProjection {
  id: string;
  body: string;
  author: Author;
  created_at: string;
  retracted: boolean;
}

export interface ThreadProjection {
  thread_id: string;
  commentType: CommentType;
  anchor: Anchor | { detached: true };
  status: 'open' | 'resolved' | 'detached';
  assignee?: string;
  confidence?: 'alta' | 'media' | 'baja';
  refs?: Array<{ title: string; url?: string; note?: string }>;
  messages: MessageProjection[];
  openedAt: string;
  openedBy: Author;
}

/**
 * Tarea accesoria identificada durante una sesión de revisión.
 * Se persiste en <gitRoot>/.ai/backlog/<id>.json.
 */
export interface BacklogTask {
  id: string;
  doc: string;
  session: string;
  author: Author;
  commit: string | null;
  body: string;
}

// ---------------------------------------------------------------------------
// Funciones puras (sin IO de red ni VS Code)
// ---------------------------------------------------------------------------

/** SHA-256 hex de una cadena UTF-8. */
export function sha256hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Ruta primaria del sidecar: espejo de la ruta relativa del documento.
 * `docs/informe.md` → `<gitRoot>/.ai/review/docs/informe.md.json`
 */
export function sidecarPathForDoc(docAbsPath: string, gitRoot: string): string {
  const relative = path.relative(gitRoot, docAbsPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`mesh-review: document path escapes git root — ${docAbsPath}`);
  }
  return path.join(gitRoot, '.ai', 'review', relative + '.json');
}

/**
 * Ruta de fallback (doc fuera de repo git):
 * `~/.local/state/mesh-review/<sha256-de-ruta-absoluta>.json`
 * SHA-256 de la ruta absoluta UTF-8, sin salto de línea final.
 */
export function fallbackSidecarPath(docAbsPath: string): string {
  const hash = sha256hex(docAbsPath);
  return path.join(os.homedir(), '.local', 'state', 'mesh-review', hash + '.json');
}

/** Timestamp UTC sin milisegundos, conforme al patrón del schema. */
export function utcTimestamp(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Timestamp UTC CON milisegundos para el created_at de los eventos V2. */
export function utcTimestampMs(): string {
  return new Date().toISOString();
}

/**
 * Valida que una cadena tenga forma de UUID (v4 canónico, 8-4-4-4-12 hex).
 *
 * Seguridad: los ids de evento y de tarea se usan como nombre de fichero
 * (`<id>.json`) en writeEvent/writeBacklogTask. Un id que no sea un UUID —por
 * ejemplo `../../.ssh/evil` copiado verbatim de un sidecar V1 hostil durante la
 * migración— permitiría escapar del directorio de eventos. Todo id que se
 * convierta en nombre de fichero pasa por esta guarda antes de tocar el disco.
 */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Orden total de eventos para la proyección (spec "Orden y causalidad").
 * - created_at ascendente por instante real: Date.parse compara correctamente
 *   incluso con precisión mixta ms / sin-ms (eventos nativos vs migrados de V1),
 *   donde la comparación léxica de cadenas se invertiría ('…00Z' vs '…00.1Z').
 * - A igual instante, thread.opened precede a cualquier mutación de su hilo: un
 *   hilo se abre antes de mutarse, así el fold nunca descarta un evento válido
 *   por un empate de timestamp (p. ej. un thread.status-changed sintético de la
 *   migración con el mismo segundo que su thread.opened).
 * - Desempate final por id en orden de punto de código (no locale-dependiente).
 */
function compareEvents(a: EventEnvelope, b: EventEnvelope): number {
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (ta !== tb) return ta - tb;
  const ra = a.type === 'thread.opened' ? 0 : 1;
  const rb = b.type === 'thread.opened' ? 0 : 1;
  if (ra !== rb) return ra - rb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Proyecta un array de eventos V2 al estado neto de cada hilo.
 * Pura: no muta el array de entrada.
 * Orden de fold: el de compareEvents (created_at, luego thread.opened, luego id).
 * El cuerpo del thread.opened pasa a messages[0]; ThreadProjection no tiene
 * campo body propio.
 */
export function project(events: EventEnvelope[]): ThreadProjection[] {
  const sorted = [...events].sort(compareEvents);

  const map = new Map<string, ThreadProjection>();
  const order: string[] = [];

  for (const ev of sorted) {
    const tid = ev.thread_id;

    if (ev.type === 'thread.opened') {
      const proj: ThreadProjection = {
        thread_id: tid,
        commentType: ev.commentType as CommentType,
        anchor: ev.anchor as Anchor,
        status: 'open',
        messages: [{
          id: ev.id,
          body: ev.body as string,
          author: ev.author,
          created_at: ev.created_at,
          retracted: false,
        }],
        openedAt: ev.created_at,
        openedBy: ev.author,
      };
      if (ev.assignee !== undefined) proj.assignee = ev.assignee as string;
      if (ev.confidence !== undefined) proj.confidence = ev.confidence as 'alta' | 'media' | 'baja';
      if (ev.refs !== undefined) proj.refs = ev.refs as Array<{ title: string; url?: string; note?: string }>;
      map.set(tid, proj);
      order.push(tid);
      continue;
    }

    const proj = map.get(tid);
    if (!proj) continue; // defensivo: hilo desconocido, se ignora

    switch (ev.type) {
      case 'message.posted':
        proj.messages.push({
          id: ev.id,
          body: ev.body as string,
          author: ev.author,
          created_at: ev.created_at,
          retracted: false,
        });
        break;
      case 'message.revised': {
        const msg = proj.messages.find(m => m.id === (ev.target_message_id as string));
        if (msg) msg.body = ev.body as string;
        break;
      }
      case 'message.retracted': {
        const msg = proj.messages.find(m => m.id === (ev.target_message_id as string));
        if (msg) msg.retracted = true;
        break;
      }
      case 'thread.status-changed':
        proj.status = ev.to as 'open' | 'resolved' | 'detached';
        break;
      case 'thread.reanchored':
        if (ev.anchor !== undefined) {
          proj.anchor = ev.anchor as Anchor;
          if (proj.status === 'detached') proj.status = 'open';
        } else if (ev.detached === true) {
          proj.anchor = { detached: true };
          proj.status = 'detached';
        }
        break;
      case 'thread.assigned':
        proj.assignee = ev.agent as string;
        break;
    }
  }

  return order.map(id => map.get(id)!);
}

/**
 * Convierte un sidecar V1 en un array de eventos V2.
 * Pura: no muta el sidecar de entrada, no hace IO.
 * El UUID del comentario original pasa a ser el id Y el thread_id del evento abierto.
 */
export function migrateV1(sidecar: Sidecar): EventEnvelope[] {
  const events: EventEnvelope[] = [];
  for (const c of sidecar.comments) {
    // El id V1 se reutiliza como id/thread_id del thread.opened, y el id acaba
    // como nombre de fichero en writeEvent. Un sidecar hostil podría traer un id
    // con traversal; se descarta el comentario en vez de propagarlo (el fichero
    // V1 se conserva intacto, así que no hay pérdida de dato irreversible).
    if (!isUuid(c.id)) continue;
    const opened: EventEnvelope = {
      id: c.id,
      version: 2,
      type: 'thread.opened',
      thread_id: c.id,
      author: { kind: 'human' },
      created_at: c.created_at,
      commit: null,
      dirty: false,
      anchor: c.anchor,
      commentType: c.type,
      body: c.body,
    };
    if (c.agent !== undefined) opened.assignee = c.agent;
    events.push(opened);
    if (c.status === 'resolved') {
      events.push({
        id: randomUUID(),
        version: 2,
        type: 'thread.status-changed',
        thread_id: c.id,
        author: { kind: 'human' },
        created_at: c.updated_at,
        commit: null,
        dirty: false,
        to: 'resolved',
      });
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// IO: git
// ---------------------------------------------------------------------------

/**
 * Detecta el git root ejecutando `git rev-parse --show-toplevel` desde
 * `fromDir`. Devuelve null si el directorio no está dentro de ningún repo.
 */
export async function getGitRoot(fromDir: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--show-toplevel'],
      { cwd: fromDir }
    );
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Directorio de fallback para eventos V2 de documentos fuera de cualquier
 * repo git: `~/.local/state/mesh-review/<sha256-de-ruta-absoluta>/`
 * Análogo a fallbackSidecarPath pero devuelve un directorio, sin `.json`.
 * Pura: node:path, node:os, node:crypto únicamente.
 */
export function fallbackEventDir(docAbsPath: string): string {
  const hash = sha256hex(docAbsPath);
  return path.join(os.homedir(), '.local', 'state', 'mesh-review', hash);
}

/**
 * Obtiene el hash corto del commit HEAD mediante `git rev-parse --short HEAD`.
 * Devuelve null si el directorio no está en un repo o si git falla.
 */
export async function getHeadSha(gitRoot: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['rev-parse', '--short', 'HEAD'],
      { cwd: gitRoot }
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Obtiene el nombre del autor de git (`git config user.name`) desde `fromDir`.
 * Devuelve undefined si el directorio no está en un repo, si user.name no está
 * configurado o si git falla por cualquier razón.
 */
export async function getUserName(fromDir: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['config', 'user.name'],
      { cwd: fromDir }
    );
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Comprueba si `.ai/review/` está ignorado según git check-ignore
 * (cubre tanto .gitignore como .git/info/exclude).
 * Ejecuta desde gitRoot.
 */
export async function isAiReviewIgnored(gitRoot: string): Promise<boolean> {
  try {
    await execFileAsync(
      'git',
      ['check-ignore', '-q', path.join('.ai', 'review')],
      { cwd: gitRoot }
    );
    return true; // exit 0 → está ignorado
  } catch {
    return false; // exit ≠ 0 → no está ignorado
  }
}

/**
 * Añade `entry` a `.git/info/exclude` del repo.
 * No toca nunca `.gitignore`. Idempotente por entrada.
 * Por defecto añade `.ai/review/`.
 */
export async function addToGitExclude(gitRoot: string, entry: string = '.ai/review/'): Promise<void> {
  const excludePath = path.join(gitRoot, '.git', 'info', 'exclude');
  const existing = await readFile(excludePath, 'utf8').catch(() => '');
  // Comparación por línea, no substring: un patrón más largo o un comentario que
  // contenga `entry` como subcadena no debe suprimir la inserción de la entrada real.
  if (existing.split('\n').some((line) => line.trim() === entry.trim())) return;
  const block = '\n# mesh-review (no versionar)\n' + entry + '\n';
  await appendFile(excludePath, block, 'utf8');
}

// ---------------------------------------------------------------------------
// IO: sidecar
// ---------------------------------------------------------------------------

/**
 * Lee el sidecar JSON desde disco. Devuelve null si el fichero no existe
 * o no puede parsearse.
 */
export async function readSidecar(filePath: string): Promise<Sidecar | null> {
  try {
    const content = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(content);
    if (parsed?.version !== 1 || !Array.isArray(parsed?.comments)) return null;
    return parsed as Sidecar;
  } catch {
    return null;
  }
}

/**
 * Escribe el sidecar JSON a disco, creando el directorio si no existe.
 * Sangría de 2 espacios para legibilidad humana.
 */
export async function writeSidecar(filePath: string, data: Sidecar): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Crea `~/.local/state/mesh-review/` con permisos 0o700 (solo usuario).
 * Idempotente.
 */
export async function ensureFallbackDir(
  dir: string = path.join(os.homedir(), '.local', 'state', 'mesh-review')
): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
}

// ---------------------------------------------------------------------------
// IO V2: directorio de eventos
//
// Seguridad: `dir`, `docRelPath` y `event.id` se asumen ya saneados por quien
// llama para las rutas de escritura. El acotado de rutas al git root vive en
// los call-sites de extension.ts (gate F4). readEvents, además, valida en
// runtime la forma de los eventos que lee del disco (id/thread_id UUID, body
// string) como defensa en profundidad frente a ficheros de evento malformados.
// ---------------------------------------------------------------------------

/**
 * Lee todos los eventos V2 del directorio dado.
 * Si el directorio no existe, devuelve [].
 * Salta ficheros que no pueden parsearse o cuya version !== 2.
 * Ordena por created_at ascendente; desempate por id lexicográfico.
 */
export async function readEvents(dir: string): Promise<EventEnvelope[]> {
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
      // Endurecimiento: un evento en disco puede estar malformado (escrito por
      // otro colaborador o un agente). Se descartan los que no tengan id y
      // thread_id con forma de UUID, o cuyo body —cuando está presente— no sea
      // string, para que ni la proyección ni el render del webview reciban
      // datos corruptos (un body no-string haría fallar escapeHtml).
      if (typeof parsed.id !== 'string' || !isUuid(parsed.id)) continue;
      if (typeof parsed.thread_id !== 'string' || !isUuid(parsed.thread_id)) continue;
      if ('body' in parsed && typeof parsed.body !== 'string') continue;
      results.push(parsed as unknown as EventEnvelope);
    } catch {
      // fichero ilegible o JSON inválido — se ignora
    }
  }
  results.sort(compareEvents);
  return results;
}

/**
 * Escribe un único fichero de evento en el directorio dado.
 * Crea el directorio si no existe.
 * Nombre: <event.id>.json. Sangría 2 espacios + salto de línea final.
 */
export async function writeEvent(dir: string, event: EventEnvelope): Promise<void> {
  // Guarda de path traversal: el id se convierte en nombre de fichero. Rechaza
  // cualquier id que no sea un UUID (p. ej. copiado de un sidecar V1 hostil por
  // migrateV1) antes de tocar el disco. Guarda central: protege a todo llamante.
  if (!isUuid(event.id)) {
    throw new Error(`mesh-review: id de evento inválido (no es UUID): ${event.id}`);
  }
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, `${event.id}.json`),
    JSON.stringify(event, null, 2) + '\n',
    'utf8'
  );
}

/**
 * Detecta si un documento tiene sidecar V1 (fichero plano) pero no directorio V2.
 * V1 = <gitRoot>/.ai/review/<docRelPath>.json
 * V2 = <gitRoot>/.ai/review/<docRelPath>  (directorio)
 * Devuelve true solo si el fichero V1 existe Y el directorio V2 NO existe.
 *
 * Invariante del llamante: `docRelPath` debe venir ya saneado y contenido en el
 * git root (resolveEventDir lo valida antes de devolverlo). Aquí no se revalida.
 */
export async function detectLegacy(gitRoot: string, docRelPath: string): Promise<boolean> {
  const v1File = path.join(gitRoot, '.ai', 'review', `${docRelPath}.json`);
  const v2Dir  = path.join(gitRoot, '.ai', 'review', docRelPath);

  let v2DirExists = false;
  try {
    const s = await stat(v2Dir);
    v2DirExists = s.isDirectory();
  } catch {
    v2DirExists = false;
  }

  if (v2DirExists) return false;

  try {
    await stat(v1File);
    return true; // V1 existe y V2 no existe
  } catch {
    return false; // ninguno existe
  }
}

// ---------------------------------------------------------------------------
// IO V2: backlog
// ---------------------------------------------------------------------------

/**
 * Crea el directorio de backlog idempotentemente.
 * <gitRoot>/.ai/backlog/
 */
export async function ensureBacklogDir(gitRoot: string): Promise<void> {
  await mkdir(path.join(gitRoot, '.ai', 'backlog'), { recursive: true });
}

/**
 * Escribe una tarea de backlog a disco.
 * <gitRoot>/.ai/backlog/<task.id>.json
 * Sangría 2 espacios + salto de línea final.
 */
export async function writeBacklogTask(gitRoot: string, task: BacklogTask): Promise<void> {
  // Misma guarda de path traversal que writeEvent: task.id es el nombre de fichero.
  if (!isUuid(task.id)) {
    throw new Error(`mesh-review: id de tarea inválido (no es UUID): ${task.id}`);
  }
  await ensureBacklogDir(gitRoot);
  await writeFile(
    path.join(gitRoot, '.ai', 'backlog', `${task.id}.json`),
    JSON.stringify(task, null, 2) + '\n',
    'utf8'
  );
}

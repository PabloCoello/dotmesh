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

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, appendFile, chmod } from 'node:fs/promises';
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
 * Añade `.ai/review/` a `.git/info/exclude` del repo.
 * No toca nunca `.gitignore`.
 */
export async function addToGitExclude(gitRoot: string): Promise<void> {
  const excludePath = path.join(gitRoot, '.git', 'info', 'exclude');
  const existing = await readFile(excludePath, 'utf8').catch(() => '');
  if (existing.includes('.ai/review/')) return;
  const entry = '\n# mesh-review: comentarios de revisión (no versionar)\n.ai/review/\n';
  await appendFile(excludePath, entry, 'utf8');
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

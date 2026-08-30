/**
 * reply.ts — subcomando `reply` del CLI mesh-review.
 *
 * Emite un evento `message.posted` en un hilo existente sin hacer commit de git.
 * El campo `commit` captura el SHA corto del HEAD actual (o null si no hay HEAD),
 * igual que hace `addCommentImpl` para el evento `thread.opened`.
 *
 * Salida (stdout): el UUID del evento `message.posted`.
 * En caso de error de validación: mensaje en stderr + exit 1.
 *
 * Sin dependencias de `vscode`. Reutiliza:
 *   - `getGitRoot`, `getUserName`, `getHeadSha`, `utcTimestampMs`, `isUuid`,
 *     `type Author`, `type EventEnvelope` de sidecar.ts
 *   - `emitEvent` de commands/emit.ts
 *   - `parseCliArgs` de cli/args.ts
 */

import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

import {
  getGitRoot,
  getUserName,
  getHeadSha,
  utcTimestampMs,
  isUuid,
  readEvents,
  project,
  type Author,
  type EventEnvelope,
} from '../../sidecar.ts';
import { emitEvent } from './emit.ts';
import { parseCliArgs } from '../args.ts';

// ---------------------------------------------------------------------------
// Known flags
// ---------------------------------------------------------------------------

const REPLY_KNOWN_FLAGS = new Set([
  'body', 'author', 'model', 'effort', 'subagent', 'confidence',
]);

/**
 * Maximum body length in UTF-16 code units.
 * Matches the VS Code webview composer cap so CLI and UI stay consistent.
 */
const MAX_BODY_CHARS = 10_000;

/**
 * Rejects NUL and the C0 control characters, allowing tab (\x09),
 * newline (\x0A) and carriage return (\x0D).
 * Stored review text has no legitimate use for other control characters.
 */
const CTRL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Core logic of `mesh-review reply`, extracted for unit tests.
 *
 * @param argv  Argument vector (everything after the `reply` subcommand token).
 */
export async function runReply(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.length === 0) {
    printUsage();
    return;
  }

  const { flags, positionals } = parseCliArgs(argv, REPLY_KNOWN_FLAGS, 'reply');

  const doc = positionals[0];
  const threadId = positionals[1];
  const body = flags.get('body');
  const author = flags.get('author') ?? 'human';
  const model = flags.get('model');
  const effort = flags.get('effort');
  const subagent = flags.get('subagent');
  const confidence = flags.get('confidence');

  // --- Presence checks -------------------------------------------------------

  if (!doc) {
    process.stderr.write('mesh-review reply: se requiere <doc>\n');
    process.exit(1);
  }
  if (!threadId) {
    process.stderr.write('mesh-review reply: se requiere <thread_id>\n');
    process.exit(1);
  }
  if (!isUuid(threadId)) {
    process.stderr.write(`mesh-review reply: thread_id no es un UUID válido: ${threadId}\n`);
    process.exit(1);
  }
  if (!body || body.length === 0) {
    process.stderr.write('mesh-review reply: se requiere --body y no puede estar vacío\n');
    process.exit(1);
  }
  if (body.length > MAX_BODY_CHARS) {
    process.stderr.write(
      `mesh-review reply: --body supera el límite de ${MAX_BODY_CHARS} caracteres (${body.length})\n`
    );
    process.exit(1);
  }
  if (CTRL_CHAR_RE.test(body)) {
    process.stderr.write(
      'mesh-review reply: --body contiene caracteres de control no permitidos\n'
    );
    process.exit(1);
  }

  // --- Author validation -----------------------------------------------------

  if (author !== 'human' && author !== 'ai') {
    process.stderr.write(`mesh-review reply: --author debe ser "human" o "ai": ${author}\n`);
    process.exit(1);
  }
  if (author === 'ai' && !model) {
    process.stderr.write('mesh-review reply: --author ai requiere --model\n');
    process.exit(1);
  }
  if (author !== 'ai' && model !== undefined) {
    process.stderr.write('mesh-review reply: --model solo es válido con --author ai\n');
    process.exit(1);
  }

  // --- Confidence validation -------------------------------------------------

  if (confidence !== undefined && !['alta', 'media', 'baja'].includes(confidence)) {
    process.stderr.write(
      `mesh-review reply: --confidence debe ser alta, media o baja: ${confidence}\n`
    );
    process.exit(1);
  }

  // --- Resolve doc path and git root ----------------------------------------

  const docAbs = path.resolve(doc);
  const gitRoot = await getGitRoot(path.dirname(docAbs));
  if (!gitRoot) {
    process.stderr.write('mesh-review: el documento no está dentro de un repositorio git\n');
    process.exit(1);
  }

  const docRelPath = path.relative(gitRoot, docAbs);
  if (docRelPath.startsWith('..')) {
    process.stderr.write('mesh-review: el documento no está dentro del git root\n');
    process.exit(1);
  }
  const eventDir = path.join(gitRoot, '.ai', 'review', docRelPath);

  // --- Referential integrity -------------------------------------------------
  // Verify the target thread exists before writing; a typo'd UUID would
  // otherwise exit 0 while the orphan event is silently dropped by the reader.

  const existingEvents = await readEvents(eventDir);
  const threads = project(existingEvents);
  const threadExists = threads.some(t => t.thread_id === threadId);
  if (!threadExists) {
    process.stderr.write(`mesh-review reply: el hilo ${threadId} no existe en este documento\n`);
    process.exit(1);
  }

  // --- Build author ----------------------------------------------------------

  let authorObj: Author;
  if (author === 'ai') {
    authorObj = {
      kind: 'ai',
      model: model!,
      ...(effort !== undefined ? { effort } : {}),
      ...(subagent !== undefined ? { subagent } : {}),
    };
  } else {
    const name = await getUserName(path.dirname(docAbs));
    authorObj = name !== undefined ? { kind: 'human', name } : { kind: 'human' };
  }

  // --- Build event -----------------------------------------------------------

  const id = randomUUID();
  const ev: EventEnvelope = {
    id,
    version: 2,
    type: 'message.posted',
    thread_id: threadId,
    author: authorObj,
    created_at: utcTimestampMs(),
    commit: await getHeadSha(gitRoot),
    dirty: false,
    body,
  };

  if (confidence !== undefined) ev.confidence = confidence;

  // --- Write event atomically -----------------------------------------------

  await emitEvent(eventDir, ev);
  process.stdout.write(`${id}\n`);
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printUsage(): void {
  process.stderr.write(
    [
      'Uso: mesh-review reply <doc> <thread_id>',
      '         --body <texto>',
      '         [--author human|ai] [--model <id>]',
      '         [--effort <str>] [--subagent <str>]',
      '         [--confidence alta|media|baja]',
      '',
      'Publica un mensaje en el hilo sin hacer commit de git. El campo commit',
      'captura el SHA corto del HEAD actual (o null). Imprime el UUID del',
      'evento message.posted en stdout.',
      '',
      '  --author ai requiere --model.',
      '',
      'Salida:',
      '  stdout: UUID del evento message.posted',
      '',
      'Ejemplo:',
      '  mesh-review reply docs/SPEC.md <uuid> --body "Corrección aplicada"',
    ].join('\n') + '\n'
  );
}

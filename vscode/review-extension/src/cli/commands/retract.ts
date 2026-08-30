/**
 * retract.ts — subcomando `retract` del CLI mesh-review.
 *
 * Emite un evento `message.retracted { target_message_id }` para marcar un
 * mensaje concreto del hilo como retractado. El campo `--reason` es opcional.
 *
 * Salida (stdout): el UUID del evento `message.retracted`.
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

const RETRACT_KNOWN_FLAGS = new Set(['reason', 'author', 'model', 'effort', 'subagent']);

/**
 * Maximum reason length in UTF-16 code units.
 * Matches the VS Code webview composer cap so CLI and UI stay consistent.
 */
const MAX_REASON_CHARS = 10_000;

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
 * Core logic of `mesh-review retract`, extracted for unit tests.
 *
 * @param argv  Argument vector (everything after the `retract` subcommand token).
 */
export async function runRetract(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.length === 0) {
    printUsage();
    return;
  }

  const { flags, positionals } = parseCliArgs(argv, RETRACT_KNOWN_FLAGS, 'retract');

  const doc = positionals[0];
  const threadId = positionals[1];
  const messageId = positionals[2];
  const reason = flags.get('reason');
  const author = flags.get('author') ?? 'human';
  const model = flags.get('model');
  const effort = flags.get('effort');
  const subagent = flags.get('subagent');

  // --- Presence checks -------------------------------------------------------

  if (!doc) {
    process.stderr.write('mesh-review retract: se requiere <doc>\n');
    process.exit(1);
  }
  if (!threadId) {
    process.stderr.write('mesh-review retract: se requiere <thread_id>\n');
    process.exit(1);
  }
  if (!isUuid(threadId)) {
    process.stderr.write(`mesh-review retract: thread_id no es un UUID válido: ${threadId}\n`);
    process.exit(1);
  }
  if (!messageId) {
    process.stderr.write('mesh-review retract: se requiere <message_id>\n');
    process.exit(1);
  }
  if (!isUuid(messageId)) {
    process.stderr.write(`mesh-review retract: message_id no es un UUID válido: ${messageId}\n`);
    process.exit(1);
  }

  // --- Reason length cap -------------------------------------------------------

  if (reason !== undefined && reason.length > MAX_REASON_CHARS) {
    process.stderr.write(
      `mesh-review retract: --reason supera el límite de ${MAX_REASON_CHARS} caracteres (${reason.length})\n`
    );
    process.exit(1);
  }
  if (reason !== undefined && CTRL_CHAR_RE.test(reason)) {
    process.stderr.write(
      'mesh-review retract: --reason contiene caracteres de control no permitidos\n'
    );
    process.exit(1);
  }

  // --- Author validation -----------------------------------------------------

  if (author !== 'human' && author !== 'ai') {
    process.stderr.write(`mesh-review retract: --author debe ser "human" o "ai": ${author}\n`);
    process.exit(1);
  }
  if (author === 'ai' && !model) {
    process.stderr.write('mesh-review retract: --author ai requiere --model\n');
    process.exit(1);
  }
  if (author !== 'ai' && model !== undefined) {
    process.stderr.write('mesh-review retract: --model solo es válido con --author ai\n');
    process.exit(1);
  }

  // --- Resolve doc path and git root ----------------------------------------

  const docAbs = path.resolve(doc);
  const gitRoot = await getGitRoot(path.dirname(docAbs));
  if (!gitRoot) {
    process.stderr.write('mesh-review: el documento no está dentro de un repositorio git\n');
    process.exit(1);
  }

  // Use path.resolve + path.sep prefix check — same pattern as sidecarPathForDoc
  // in sidecar.ts — to catch embedded traversal (e.g. foo/../../bar) that the
  // simpler startsWith('..') check misses.
  const reviewDir = path.resolve(gitRoot, '.ai', 'review');
  const eventDir  = path.resolve(reviewDir, path.relative(gitRoot, docAbs));
  if (!eventDir.startsWith(reviewDir + path.sep)) {
    process.stderr.write('mesh-review: el documento no está dentro del git root\n');
    process.exit(1);
  }

  // --- Referential integrity -------------------------------------------------
  // Thread must exist; message_id must exist within that thread. A typo'd UUID
  // would otherwise exit 0 while the orphan event is silently dropped.

  const existingEvents = await readEvents(eventDir);
  const threads = project(existingEvents);
  const thread = threads.find(t => t.thread_id === threadId);
  if (!thread) {
    process.stderr.write(`mesh-review retract: el hilo ${threadId} no existe en este documento\n`);
    process.exit(1);
  }
  const messageExists = thread.messages.some(m => m.id === messageId);
  if (!messageExists) {
    process.stderr.write(`mesh-review retract: el mensaje ${messageId} no existe en el hilo ${threadId}\n`);
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
    type: 'message.retracted',
    thread_id: threadId,
    author: authorObj,
    created_at: utcTimestampMs(),
    commit: await getHeadSha(gitRoot),
    dirty: false,
    target_message_id: messageId,
    ...(reason !== undefined ? { reason } : {}),
  };

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
      'Uso: mesh-review retract <doc> <thread_id> <message_id>',
      '         [--reason <texto>]',
      '         [--author human|ai] [--model <id>]',
      '         [--effort <str>] [--subagent <str>]',
      '',
      'Retracta un mensaje del hilo emitiendo message.retracted.',
      'Imprime el UUID del nuevo evento en stdout.',
      '',
      '  --author ai requiere --model.',
      '  --reason es opcional.',
      '',
      'Salida:',
      '  stdout: UUID del evento message.retracted',
      '',
      'Ejemplo:',
      '  mesh-review retract docs/SPEC.md <thread-uuid> <msg-uuid> --reason "Error tipográfico"',
    ].join('\n') + '\n'
  );
}

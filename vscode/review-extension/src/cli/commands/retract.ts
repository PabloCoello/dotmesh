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
  type Author,
  type EventEnvelope,
} from '../../sidecar.ts';
import { emitEvent } from './emit.ts';
import { parseCliArgs } from '../args.ts';

// ---------------------------------------------------------------------------
// Known flags
// ---------------------------------------------------------------------------

const RETRACT_KNOWN_FLAGS = new Set(['reason', 'author', 'model', 'effort', 'subagent']);

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

  // --- Author validation -----------------------------------------------------

  if (author !== 'human' && author !== 'ai') {
    process.stderr.write(`mesh-review retract: --author debe ser "human" o "ai": ${author}\n`);
    process.exit(1);
  }
  if (author === 'ai' && !model) {
    process.stderr.write('mesh-review retract: --author ai requiere --model\n');
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

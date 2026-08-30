/**
 * resolve.ts — subcomando `resolve` del CLI mesh-review.
 *
 * Emite un evento `thread.status-changed { to: "resolved" }` para cerrar un
 * hilo de revisión. Idempotente en efecto: una segunda llamada escribe un
 * segundo evento que deja el hilo en el mismo estado.
 *
 * Salida (stdout): el UUID del evento `thread.status-changed`.
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

const RESOLVE_KNOWN_FLAGS = new Set(['author', 'model', 'effort', 'subagent']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Core logic of `mesh-review resolve`, extracted for unit tests.
 *
 * @param argv  Argument vector (everything after the `resolve` subcommand token).
 */
export async function runResolve(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.length === 0) {
    printUsage();
    return;
  }

  const { flags, positionals } = parseCliArgs(argv, RESOLVE_KNOWN_FLAGS, 'resolve');

  const doc = positionals[0];
  const threadId = positionals[1];
  const author = flags.get('author') ?? 'human';
  const model = flags.get('model');
  const effort = flags.get('effort');
  const subagent = flags.get('subagent');

  // --- Presence checks -------------------------------------------------------

  if (!doc) {
    process.stderr.write('mesh-review resolve: se requiere <doc>\n');
    process.exit(1);
  }
  if (!threadId) {
    process.stderr.write('mesh-review resolve: se requiere <thread_id>\n');
    process.exit(1);
  }
  if (!isUuid(threadId)) {
    process.stderr.write(`mesh-review resolve: thread_id no es un UUID válido: ${threadId}\n`);
    process.exit(1);
  }

  // --- Author validation -----------------------------------------------------

  if (author !== 'human' && author !== 'ai') {
    process.stderr.write(`mesh-review resolve: --author debe ser "human" o "ai": ${author}\n`);
    process.exit(1);
  }
  if (author === 'ai' && !model) {
    process.stderr.write('mesh-review resolve: --author ai requiere --model\n');
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
    type: 'thread.status-changed',
    thread_id: threadId,
    author: authorObj,
    created_at: utcTimestampMs(),
    commit: await getHeadSha(gitRoot),
    dirty: false,
    to: 'resolved',
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
      'Uso: mesh-review resolve <doc> <thread_id>',
      '         [--author human|ai] [--model <id>]',
      '         [--effort <str>] [--subagent <str>]',
      '',
      'Cierra un hilo de revisión emitiendo thread.status-changed to=resolved.',
      'Imprime el UUID del nuevo evento en stdout.',
      '',
      '  --author ai requiere --model.',
      '',
      'Salida:',
      '  stdout: UUID del evento thread.status-changed',
      '',
      'Ejemplo:',
      '  mesh-review resolve docs/SPEC.md <uuid>',
    ].join('\n') + '\n'
  );
}

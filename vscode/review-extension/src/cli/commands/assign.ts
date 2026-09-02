/**
 * assign.ts — subcomando `assign` del CLI mesh-review.
 *
 * Emite un evento `thread.assigned` para asignar un hilo a un subagente
 * conocido. Verifica que el hilo exista antes de escribir el evento.
 *
 * Sin dependencias de `vscode`. Reutiliza:
 *   - `getGitRoot`, `isUuid`, `utcTimestampMs`, `readEvents`, `project`
 *     de sidecar.ts
 *   - `emitEvent` de commands/emit.ts
 */

import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

import {
  getGitRoot,
  isUuid,
  utcTimestampMs,
  readEvents,
  project,
  type EventEnvelope,
} from '../../sidecar.ts';
import { emitEvent } from './emit.ts';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Subagentes válidos a los que se puede asignar un hilo.
 * Coincide con la lista del sistema 2+7 documentada en AGENTS.md.
 */
const VALID_AGENTS = new Set(['security', 'maths', 'reviser', 'editor']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Core logic of `mesh-review assign`, extracted for unit tests.
 *
 * @param argv  Argument vector (everything after the `assign` subcommand token).
 */
export async function runAssign(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.length === 0) {
    printUsage();
    return;
  }

  // Parse: <doc> <thread_id> --agent <nombre>
  const positionals: string[] = [];
  let agent: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--agent') {
      agent = argv[++i];
    } else if (!arg.startsWith('-')) {
      positionals.push(arg);
    }
  }

  const doc = positionals[0];
  const threadId = positionals[1];

  if (!doc || !threadId) {
    process.stderr.write('mesh-review assign: se requieren <doc> y <thread_id>\n');
    process.exit(1);
  }
  if (!isUuid(threadId)) {
    process.stderr.write(`mesh-review assign: thread_id no es un UUID válido: ${threadId}\n`);
    process.exit(1);
  }
  if (agent === undefined) {
    process.stderr.write('mesh-review assign: se requiere --agent <nombre>\n');
    process.exit(1);
  }
  if (!VALID_AGENTS.has(agent)) {
    process.stderr.write(
      `mesh-review assign: agente desconocido "${agent}"; válidos: ${[...VALID_AGENTS].join(', ')}\n`
    );
    process.exit(1);
  }

  const docAbs = path.resolve(doc);
  const gitRoot = await getGitRoot(path.dirname(docAbs));
  if (!gitRoot) {
    process.stderr.write('mesh-review: el documento no está dentro de un repositorio git\n');
    process.exit(1);
  }

  // Path traversal guard — same pattern as other subcommands.
  const reviewDir = path.resolve(gitRoot, '.ai', 'review');
  const eventDir  = path.resolve(reviewDir, path.relative(gitRoot, docAbs));
  if (!eventDir.startsWith(reviewDir + path.sep)) {
    process.stderr.write('mesh-review: el documento no está dentro del git root\n');
    process.exit(1);
  }

  // Verify the thread exists before emitting.
  const existingEvents = await readEvents(eventDir);
  const existingThreads = project(existingEvents);
  if (!existingThreads.some(t => t.thread_id === threadId)) {
    process.stderr.write(`mesh-review assign: el hilo ${threadId} no existe en este documento\n`);
    process.exit(1);
  }

  const ev: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'thread.assigned',
    thread_id: threadId,
    author: { kind: 'human' },
    created_at: utcTimestampMs(),
    commit: null,
    dirty: false,
    agent,
  } as EventEnvelope & { agent: string };

  await emitEvent(eventDir, ev);
  process.stdout.write(`${ev.id}\n`);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function printUsage(): void {
  process.stderr.write(
    [
      'Uso: mesh-review assign <doc> <thread_id> --agent <nombre>',
      '',
      'Emite un evento thread.assigned para asignar el hilo al subagente indicado.',
      'El hilo debe existir en el documento; se sale con error si no existe.',
      '',
      'Agentes válidos: security, maths, reviser, editor',
      '',
      'Opciones:',
      '  --agent <nombre>   Subagente al que se asigna el hilo (obligatorio)',
      '  --help             Muestra este mensaje',
      '',
      'Salida:',
      '  stdout: UUID del evento thread.assigned escrito',
      '',
      'Ejemplo:',
      '  mesh-review assign docs/SPEC.md <uuid> --agent reviser',
    ].join('\n') + '\n'
  );
}

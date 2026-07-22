/**
 * fix.ts — subcomando `fix` del CLI mesh-review.
 *
 * Commits a single reviewed document (pathspec-explicit), captures the short
 * SHA, and emits a `message.posted` event with author.kind="ai" and the
 * resulting commit reference — all in one CLI call.
 *
 * Without --already-done: requires pending changes on the document in the
 * worktree (git status --porcelain -- <doc>); exits 1 if the file is clean.
 * With --already-done <sha>: skips the commit and emits the event pointing
 * to the supplied SHA.
 *
 * Reuses:
 *   - `getGitRoot`, `isUuid`, `utcTimestampMs`, `readEvents`, `project` from sidecar.ts
 *   - `emitEvent` from commands/emit.ts
 *   - `reanchorThreads` from commands/reanchor.ts
 */

import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
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
import { reanchorThreads } from './reanchor.ts';

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface FixArgs {
  doc: string | undefined;
  threadId: string | undefined;
  commitMsg: string | undefined;
  body: string | undefined;
  reanchor: boolean;
  alreadyDone: string | undefined;
  model: string | undefined;
  confidence: string | undefined;
}

function parseArgs(argv: string[]): FixArgs {
  const positional: string[] = [];
  let commitMsg: string | undefined;
  let body: string | undefined;
  let reanchor = false;
  let alreadyDone: string | undefined;
  let model: string | undefined;
  let confidence: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-m') {
      commitMsg = argv[++i];
    } else if (arg === '--body') {
      body = argv[++i];
    } else if (arg === '--reanchor') {
      reanchor = true;
    } else if (arg === '--already-done') {
      alreadyDone = argv[++i];
    } else if (arg === '--model') {
      model = argv[++i];
    } else if (arg === '--confidence') {
      confidence = argv[++i];
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  return {
    doc: positional[0],
    threadId: positional[1],
    commitMsg,
    body,
    reanchor,
    alreadyDone,
    model,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Core logic of `mesh-review fix`, extracted for unit tests.
 *
 * @param argv  Argument vector (everything after the `fix` subcommand token).
 */
export async function runFix(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.length === 0) {
    printUsage();
    return;
  }

  const { doc, threadId, commitMsg, body, reanchor, alreadyDone, model, confidence } =
    parseArgs(argv);

  if (!doc || !threadId) {
    process.stderr.write('mesh-review fix: se requieren <doc> y <thread_id>\n');
    process.exit(1);
  }
  if (alreadyDone !== undefined && !/^[0-9a-f]{7,40}$/i.test(alreadyDone)) {
    process.stderr.write(
      `mesh-review fix: --already-done debe ser un SHA hex de 7–40 caracteres: ${alreadyDone}\n`
    );
    process.exit(1);
  }
  if (commitMsg !== undefined && alreadyDone !== undefined) {
    process.stderr.write(
      'mesh-review fix: -m y --already-done son mutuamente excluyentes\n'
    );
    process.exit(1);
  }
  if (!commitMsg && alreadyDone === undefined) {
    process.stderr.write('mesh-review fix: se requiere -m <commit-msg> (o --already-done <sha>)\n');
    process.exit(1);
  }
  if (body === undefined) {
    process.stderr.write('mesh-review fix: se requiere --body <respuesta>\n');
    process.exit(1);
  }
  if (!isUuid(threadId)) {
    process.stderr.write(`mesh-review fix: thread_id no es un UUID válido: ${threadId}\n`);
    process.exit(1);
  }
  if (confidence !== undefined && !['alta', 'media', 'baja'].includes(confidence)) {
    process.stderr.write(
      `mesh-review fix: --confidence debe ser alta, media o baja: ${confidence}\n`
    );
    process.exit(1);
  }

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

  const sha = await resolveCommit({ gitRoot, docAbs, commitMsg, alreadyDone });

  // Build and emit the message.posted event
  const ev: EventEnvelope = {
    id: randomUUID(),
    version: 2,
    type: 'message.posted',
    thread_id: threadId,
    author: { kind: 'ai', model: model ?? 'mesh-review-cli' },
    created_at: utcTimestampMs(),
    commit: sha,
    dirty: false,
    body,
  };
  if (confidence !== undefined) {
    ev.confidence = confidence;
  }

  await emitEvent(eventDir, ev);

  // Optional reanchor pass over the updated document
  if (reanchor) {
    let text: string;
    try {
      text = await readFile(docAbs, 'utf8');
    } catch {
      process.stderr.write(`mesh-review fix: no se puede leer el documento para reanchor: ${docAbs}\n`);
      process.exit(1);
    }
    const events = await readEvents(eventDir);
    const threads = project(events);
    await reanchorThreads(text, threads, eventDir);
  }

  // UUID to stdout so the caller can capture it; SHA to stderr as a trace
  process.stdout.write(`${ev.id}\n`);
  process.stderr.write(`${sha}\n`);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns the commit SHA to embed in the event.
 *
 * Without alreadyDone: verifies the document has pending changes, commits it
 * with an explicit pathspec, and returns the new short HEAD SHA.
 *
 * With alreadyDone: returns the supplied SHA without touching the repo.
 */
async function resolveCommit({
  gitRoot,
  docAbs,
  commitMsg,
  alreadyDone,
}: {
  gitRoot: string;
  docAbs: string;
  commitMsg: string | undefined;
  alreadyDone: string | undefined;
}): Promise<string> {
  if (alreadyDone !== undefined) {
    return alreadyDone;
  }

  // Check for pending changes on the document
  let statusOut: string;
  try {
    const result = await execFileAsync(
      'git', ['status', '--porcelain', '--', docAbs],
      { cwd: gitRoot }
    );
    statusOut = result.stdout;
  } catch (err) {
    process.stderr.write(
      `mesh-review fix: error al verificar el estado git: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }

  if (!statusOut.trim()) {
    process.stderr.write(
      `mesh-review fix: el documento no tiene cambios pendientes en el worktree: ${path.relative(gitRoot, docAbs)}\n`
    );
    process.exit(1);
  }

  // Commit using an explicit pathspec so dirty worktree files are not included
  try {
    await execFileAsync(
      'git', ['commit', '-m', commitMsg!, '--', docAbs],
      { cwd: gitRoot }
    );
  } catch (err) {
    process.stderr.write(
      `mesh-review fix: error en git commit: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }

  // Capture the short SHA of the new commit
  let shaOut: string;
  try {
    const result = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd: gitRoot });
    shaOut = result.stdout;
  } catch (err) {
    process.stderr.write(
      `mesh-review fix: error al capturar el SHA: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }

  return shaOut.trim();
}

function printUsage(): void {
  process.stderr.write(
    [
      'Uso: mesh-review fix <doc> <thread_id>',
      '         (-m <commit-msg> | --already-done <sha>)',
      '         --body <respuesta>',
      '         [--reanchor] [--model <id>] [--confidence alta|media|baja]',
      '',
      'Crea un commit del documento con pathspec explícito, captura el SHA corto',
      'y emite un evento message.posted con author.kind="ai" y ese commit.',
      'Con --already-done se omite el commit y se usa el SHA suministrado.',
      '-m y --already-done son mutuamente excluyentes.',
      '',
      'Opciones:',
      '  -m <msg>             Mensaje del commit (obligatorio sin --already-done)',
      '  --already-done <sha> SHA hex (7-40 chars) a usar en lugar de crear un commit',
      '  --body <texto>       Cuerpo del mensaje IA en el hilo (obligatorio)',
      '  --reanchor           Re-resuelve anclas tras el commit',
      '  --model <id>         Identificador del modelo (por defecto: mesh-review-cli)',
      '  --confidence <nivel> Nivel de confianza: alta, media o baja',
      '  --help               Muestra este mensaje',
      '',
      'Salida:',
      '  stdout: UUID del evento message.posted escrito',
      '  stderr: SHA corto del commit (nuevo o --already-done)',
      '',
      'Ejemplos:',
      '  mesh-review fix docs/SPEC.md <uuid> -m "fix(spec): corrige párrafo" --body "Corrección aplicada"',
      '  mesh-review fix docs/SPEC.md <uuid> --already-done abc1234 --body "Corrección aplicada en commit previo"',
    ].join('\n') + '\n'
  );
}

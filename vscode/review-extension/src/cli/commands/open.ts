/**
 * open.ts — subcomando `open` del CLI mesh-review.
 *
 * Crea un evento `thread.opened` con ancla bien formada a partir de los
 * offsets de cadena JS (unidades de código UTF-16) suministrados por el
 * llamante. El ancla se construye con `createAnchor` de anchor.ts — el
 * mismo camino de código que `addCommentImpl` en la extensión VS Code,
 * para que los dos clientes no puedan divergir.
 *
 * Salida (stdout): el UUID del nuevo hilo (= id del evento `thread.opened`).
 * En caso de error de validación: mensaje en stderr + exit 1.
 *
 * Sin dependencias de `vscode`. Reutiliza:
 *   - `createAnchor` de anchor.ts
 *   - `getGitRoot`, `getUserName`, `getHeadSha`, `utcTimestampMs`,
 *     `VALID_COMMENT_TYPES`, `type EventEnvelope` de sidecar.ts
 *   - `emitEvent` de commands/emit.ts
 */

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

import {
  getGitRoot,
  getUserName,
  getHeadSha,
  utcTimestampMs,
  VALID_COMMENT_TYPES,
  type Author,
  type EventEnvelope,
} from '../../sidecar.ts';
import { createAnchor } from '../../anchor.ts';
import { emitEvent } from './emit.ts';
import { parseCliArgs } from '../args.ts';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

const OPEN_KNOWN_FLAGS = new Set([
  'offset', 'end-offset', 'type', 'body', 'author', 'model',
  'effort', 'subagent', 'confidence', 'assignee',
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
 * Core logic of `mesh-review open`, extracted for unit tests.
 *
 * @param argv  Argument vector (everything after the `open` subcommand token).
 */
export async function runOpen(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.length === 0) {
    printUsage();
    return;
  }

  const { flags, positionals } = parseCliArgs(argv, OPEN_KNOWN_FLAGS, 'open');
  const doc = positionals[0];
  const offsetStr = flags.get('offset');
  const endOffsetStr = flags.get('end-offset');
  const type = flags.get('type');
  const body = flags.get('body');
  const author = flags.get('author') ?? 'human';
  const model = flags.get('model');
  const effort = flags.get('effort');
  const subagent = flags.get('subagent');
  const confidence = flags.get('confidence');
  const assignee = flags.get('assignee');

  // --- Presence checks -------------------------------------------------------

  if (!doc) {
    process.stderr.write('mesh-review open: se requiere <doc>\n');
    process.exit(1);
  }
  if (offsetStr === undefined) {
    process.stderr.write('mesh-review open: se requiere --offset\n');
    process.exit(1);
  }
  if (endOffsetStr === undefined) {
    process.stderr.write('mesh-review open: se requiere --end-offset\n');
    process.exit(1);
  }
  if (!type) {
    process.stderr.write('mesh-review open: se requiere --type\n');
    process.exit(1);
  }
  if (!body || body.length === 0) {
    process.stderr.write('mesh-review open: se requiere --body y no puede estar vacío\n');
    process.exit(1);
  }
  if (body.length > MAX_BODY_CHARS) {
    process.stderr.write(
      `mesh-review open: --body supera el límite de ${MAX_BODY_CHARS} caracteres (${body.length})\n`
    );
    process.exit(1);
  }
  if (CTRL_CHAR_RE.test(body)) {
    process.stderr.write(
      'mesh-review open: --body contiene caracteres de control no permitidos\n'
    );
    process.exit(1);
  }

  // --- Offset validation -----------------------------------------------------

  const offset = Number(offsetStr);
  const endOffset = Number(endOffsetStr);

  if (!Number.isInteger(offset) || offset < 0) {
    process.stderr.write(`mesh-review open: --offset debe ser un entero no negativo: ${offsetStr}\n`);
    process.exit(1);
  }
  if (!Number.isInteger(endOffset) || endOffset < 0) {
    process.stderr.write(`mesh-review open: --end-offset debe ser un entero no negativo: ${endOffsetStr}\n`);
    process.exit(1);
  }
  if (endOffset <= offset) {
    process.stderr.write(`mesh-review open: --end-offset (${endOffset}) debe ser mayor que --offset (${offset})\n`);
    process.exit(1);
  }

  // --- Type validation -------------------------------------------------------

  if (!VALID_COMMENT_TYPES.has(type)) {
    process.stderr.write(
      `mesh-review open: --type inválido: ${type}. Debe ser uno de: ${[...VALID_COMMENT_TYPES].join(', ')}\n`
    );
    process.exit(1);
  }

  // --- Author validation -----------------------------------------------------

  if (author !== 'human' && author !== 'ai') {
    process.stderr.write(`mesh-review open: --author debe ser "human" o "ai": ${author}\n`);
    process.exit(1);
  }
  if (author === 'ai' && !model) {
    process.stderr.write('mesh-review open: --author ai requiere --model\n');
    process.exit(1);
  }
  if (author !== 'ai' && model !== undefined) {
    process.stderr.write('mesh-review open: --model solo es válido con --author ai\n');
    process.exit(1);
  }

  // --- Confidence validation -------------------------------------------------

  const typesRequiringConfidence = new Set(['verifica', 'supuesto']);
  if (typesRequiringConfidence.has(type) && !confidence) {
    process.stderr.write(
      `mesh-review open: --type ${type} requiere --confidence (alta|media|baja)\n`
    );
    process.exit(1);
  }
  if (confidence !== undefined && !['alta', 'media', 'baja'].includes(confidence)) {
    process.stderr.write(
      `mesh-review open: --confidence debe ser alta, media o baja: ${confidence}\n`
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

  // Use path.resolve + path.sep prefix check — same pattern as sidecarPathForDoc
  // in sidecar.ts — to catch embedded traversal (e.g. foo/../../bar) that the
  // simpler startsWith('..') check misses.
  const reviewDir = path.resolve(gitRoot, '.ai', 'review');
  const eventDir  = path.resolve(reviewDir, path.relative(gitRoot, docAbs));
  if (!eventDir.startsWith(reviewDir + path.sep)) {
    process.stderr.write('mesh-review: el documento no está dentro del git root\n');
    process.exit(1);
  }

  // --- Read file and validate offsets ----------------------------------------

  let text: string;
  try {
    text = await readFile(docAbs, 'utf8');
  } catch (err) {
    process.stderr.write(
      `mesh-review open: no se puede leer el documento: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }

  if (offset >= text.length) {
    process.stderr.write(
      `mesh-review open: --offset (${offset}) fuera del documento (longitud ${text.length})\n`
    );
    process.exit(1);
  }
  if (endOffset > text.length) {
    process.stderr.write(
      `mesh-review open: --end-offset (${endOffset}) fuera del documento (longitud ${text.length})\n`
    );
    process.exit(1);
  }

  // --- Build anchor (same code path as addCommentImpl) ----------------------

  const anchor = createAnchor(text, offset, endOffset);

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

  // --- Build event (id === thread_id, same pattern as addCommentImpl) -------

  const threadId = randomUUID();
  const ev: EventEnvelope = {
    id: threadId,
    version: 2,
    type: 'thread.opened',
    thread_id: threadId,
    author: authorObj,
    created_at: utcTimestampMs(),
    commit: await getHeadSha(gitRoot),
    dirty: false,
    anchor,
    commentType: type,
    body,
  };

  if (confidence !== undefined) ev.confidence = confidence;
  if (assignee !== undefined) ev.assignee = assignee;

  // --- Write event atomically -----------------------------------------------

  await emitEvent(eventDir, ev);

  process.stdout.write(`${threadId}\n`);
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printUsage(): void {
  process.stderr.write(
    [
      'Uso: mesh-review open <doc>',
      '         --offset <n> --end-offset <n>',
      '         --type <commentType> --body <texto>',
      '         [--author human|ai] [--model <id>]',
      '         [--effort <str>] [--subagent <str>]',
      '         [--confidence alta|media|baja] [--assignee <nombre>]',
      '',
      'Crea un hilo de revisión anclado a la selección [offset, end-offset) del',
      'documento. Los offsets son índices de unidades de código UTF-16 (índices',
      'de cadena JS). Imprime el UUID del nuevo hilo en stdout.',
      '',
      'Tipos válidos: edita, sugerencia, pregunta, verifica, nota, referencia, supuesto',
      '  --type verifica|supuesto requiere --confidence.',
      '  --author ai requiere --model.',
      '',
      'Salida:',
      '  stdout: UUID del nuevo hilo (thread_id)',
      '',
      'Ejemplo:',
      '  mesh-review open docs/SPEC.md --offset 0 --end-offset 5 --type nota --body "Revisar"',
    ].join('\n') + '\n'
  );
}

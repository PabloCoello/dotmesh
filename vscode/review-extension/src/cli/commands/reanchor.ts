/**
 * reanchor.ts — subcomando `reanchor` del CLI mesh-review.
 *
 * Re-resuelve los anclas de hilos abiertos contra el texto actual del
 * documento y emite `thread.reanchored` (nueva ancla o `detached: true`)
 * para los que han cambiado de posición o desaparecido.
 *
 * Sin dependencias de `vscode`. Reutiliza:
 *   - `resolveAnchor`, `createAnchor` de anchor.ts
 *   - `anchorChanged`, `readEvents`, `project`, `getGitRoot`,
 *     `utcTimestampMs`, `Anchor` de sidecar.ts
 *   - `emitEvent` de commands/emit.ts
 */

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';

import { resolveAnchor, createAnchor } from '../../anchor.ts';
import {
  readEvents,
  project,
  getGitRoot,
  anchorChanged,
  utcTimestampMs,
  type Anchor,
  type EventEnvelope,
  type ThreadProjection,
} from '../../sidecar.ts';
import { emitEvent } from './emit.ts';

export async function runReanchor(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.length === 0) {
    printUsage();
    return;
  }

  const [docArg] = argv;
  const docAbs = path.resolve(docArg);
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

  let text: string;
  try {
    text = await readFile(docAbs, 'utf8');
  } catch {
    process.stderr.write(`mesh-review: no se puede leer el documento: ${docAbs}\n`);
    process.exit(1);
  }

  const events = await readEvents(eventDir);
  const threads = project(events);

  const count = await reanchorThreads(text, threads, eventDir);
  process.stderr.write(`mesh-review reanchor: ${count} evento(s) emitido(s)\n`);
}

/**
 * Re-resuelve las anclas de los hilos abiertos contra el texto actual del
 * documento y emite `thread.reanchored` para los que han cambiado.
 *
 * Omite hilos con `status === 'resolved'` o cuya ancla ya está marcada
 * como `detached`. Si el ancla no ha cambiado, no emite nada.
 *
 * @param text      Contenido actual del documento (UTF-8).
 * @param threads   Proyección actual de hilos (resultado de `project()`).
 * @param eventDir  Directorio de eventos donde escribir los nuevos eventos.
 * @returns Número de eventos `thread.reanchored` emitidos.
 */
export async function reanchorThreads(
  text: string,
  threads: ThreadProjection[],
  eventDir: string
): Promise<number> {
  let count = 0;

  for (const thread of threads) {
    // Hilos resueltos o cuya ancla ya está marcada como detached: sin acción
    if (thread.status === 'resolved' || thread.status === 'detached') continue;
    if ('detached' in thread.anchor) continue;

    const stored = thread.anchor as Anchor;
    const resolved = resolveAnchor(text, stored);

    let ev: EventEnvelope;

    if (resolved === null) {
      // El texto citado ya no existe en el documento → desanclar
      ev = {
        id: randomUUID(),
        version: 2,
        type: 'thread.reanchored',
        thread_id: thread.thread_id,
        author: { kind: 'ai', model: 'mesh-review-cli' },
        created_at: utcTimestampMs(),
        commit: null,
        dirty: false,
        detached: true,
      };
    } else {
      const newAnchor = createAnchor(text, resolved.startOffset, resolved.endOffset);
      // Si el ancla no ha cambiado (mismo offset, misma cita, mismo line_hint), no emitir
      if (!anchorChanged(stored, newAnchor)) continue;
      ev = {
        id: randomUUID(),
        version: 2,
        type: 'thread.reanchored',
        thread_id: thread.thread_id,
        author: { kind: 'ai', model: 'mesh-review-cli' },
        created_at: utcTimestampMs(),
        commit: null,
        dirty: false,
        anchor: newAnchor,
      };
    }

    await emitEvent(eventDir, ev);
    count++;
  }

  return count;
}

function printUsage(): void {
  process.stderr.write(
    [
      'Uso: mesh-review reanchor <doc>',
      '',
      'Re-resuelve las anclas de los hilos abiertos del documento contra su',
      'texto actual y emite thread.reanchored para los que han cambiado.',
      '',
      'Opciones:',
      '  --help   Muestra este mensaje',
      '',
      'Ejemplo:',
      '  mesh-review reanchor docs/SPEC.md',
    ].join('\n') + '\n'
  );
}

/**
 * project.ts — subcomando `project` del CLI mesh-review.
 *
 * Proyecta los hilos de revisión de un documento y opcionalmente filtra
 * los accionables en este momento con `--pending`.
 *
 * Sin dependencias de `vscode`. Reutiliza `readEvents`, `project`,
 * `getGitRoot` de sidecar.ts.
 */

import { readEvents, project, getGitRoot, type ThreadProjection } from '../../sidecar.ts';
import * as path from 'node:path';

export async function runProject(argv: string[]): Promise<void> {
  // Extrae el flag --pending y el argumento de documento
  const pendingIdx = argv.indexOf('--pending');
  const pending = pendingIdx !== -1;
  const args = argv.filter((_, i) => i !== pendingIdx);

  const [docArg] = args;
  if (!docArg) {
    process.stderr.write('Uso: mesh-review project [--pending] <doc>\n');
    process.exit(1);
  }

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

  const events = await readEvents(eventDir);
  let threads = project(events);

  if (pending) {
    threads = threads.filter(isPending);
  }

  process.stdout.write(JSON.stringify(threads) + '\n');
}

/**
 * Determina si un hilo abierto es accionable ahora mismo.
 *
 * Función pura sobre `ThreadProjection`. Regla: un hilo abierto es accionable
 * salvo que su último mensaje no retractado sea de autor IA (con o sin commit:
 * una respuesta en el hilo descarga igual que un fix). Una asignación
 * (`thread.assigned`) posterior a ese mensaje IA lo reactiva. El humano
 * reactiva respondiendo (iteración §7) o reasignando; un hilo sin mensajes
 * vivos no es accionable.
 */
export function isPending(thread: ThreadProjection): boolean {
  if (thread.status !== 'open') return false;

  const lastMsg = thread.messages.filter(m => !m.retracted).at(-1);
  if (!lastMsg) return false;
  if (lastMsg.author.kind !== 'ai') return true;

  return thread.assignedAt !== undefined &&
    Date.parse(thread.assignedAt) > Date.parse(lastMsg.created_at);
}

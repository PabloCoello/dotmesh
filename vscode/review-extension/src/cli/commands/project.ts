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
 * Función pura sobre `ThreadProjection`. Implementa la unión de tres casos:
 *   (a) Pase inicial: no existe ningún `message.posted` con author.kind==="ai" y commit!==null.
 *   (b) Iteración (§7): fix IA presente, último mensaje no retractado es humano y posterior
 *       al último fix IA.
 *   (c) Asignación: tiene `assignee` y el último mensaje no retractado es de autor IA (el
 *       agente fue asignado tras la última respuesta de la IA).
 *
 * Un hilo queda excluido solo cuando su último mensaje no retractado es de autor IA y no
 * se aplica el caso (c).
 */
export function isPending(thread: ThreadProjection): boolean {
  if (thread.status !== 'open') return false;

  const nonRetracted = thread.messages.filter(m => !m.retracted);
  const lastMsg = nonRetracted.at(-1);
  const lastIsAi = lastMsg?.author.kind === 'ai';

  // (a) Pase inicial: ningún mensaje IA con commit !== null
  const hasAiFix = thread.messages.some(
    m => !m.retracted && m.author.kind === 'ai' && m.commit !== null
  );
  if (!hasAiFix) return true;

  // (b) Iteración §7: último no retractado es humano y posterior al último fix IA
  const lastAiFix = [...thread.messages]
    .reverse()
    .find(m => !m.retracted && m.author.kind === 'ai' && m.commit !== null);
  if (
    lastMsg &&
    !lastIsAi &&
    lastAiFix &&
    Date.parse(lastMsg.created_at) > Date.parse(lastAiFix.created_at)
  ) {
    return true;
  }

  // (c) Asignación posterior al último mensaje IA
  if (thread.assignee && lastIsAi) {
    return true;
  }

  return false;
}

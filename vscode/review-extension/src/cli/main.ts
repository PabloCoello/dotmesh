/**
 * main.ts — punto de entrada del CLI mesh-review.
 *
 * Parsea argv, enruta a `project` o `emit`, muestra uso si el subcomando
 * no existe. Sin dependencias de `vscode`.
 */

import { runProject } from './commands/project.ts';
import { runEmit } from './commands/emit.ts';
import { runReanchor } from './commands/reanchor.ts';

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [subcommand, ...rest] = argv;

  switch (subcommand) {
    case 'project':
      await runProject(rest);
      break;
    case 'emit':
      await runEmit(rest);
      break;
    case 'reanchor':
      await runReanchor(rest);
      break;
    default:
      printUsage();
      if (subcommand !== undefined) process.exit(1);
      break;
  }
}

function printUsage(): void {
  process.stderr.write(
    [
      'Uso: mesh-review <subcomando> [argumentos]',
      '',
      'Subcomandos:',
      '  project [--pending] <doc>         Proyecta los hilos abiertos del documento',
      '  emit <doc> <tipo> [clave=valor…]  Emite un evento de revisión para el documento',
      '  reanchor <doc>                    Re-resuelve anclas y emite thread.reanchored',
      '',
      'Ejemplos:',
      '  mesh-review project --pending docs/SPEC.md',
      '  mesh-review emit docs/SPEC.md message.posted thread_id=<uuid> body="corrección" commit=null',
      '  mesh-review reanchor docs/SPEC.md',
    ].join('\n') + '\n'
  );
}

// Punto de entrada cuando se ejecuta directamente
main().catch(err => {
  process.stderr.write(
    `mesh-review: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});

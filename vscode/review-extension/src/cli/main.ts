/**
 * main.ts — punto de entrada del CLI mesh-review.
 *
 * Parsea argv, enruta a `project` o `emit`, muestra uso si el subcomando
 * no existe. Sin dependencias de `vscode`.
 */

import { runProject } from './commands/project.ts';
import { runEmit } from './commands/emit.ts';

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [subcommand, ...rest] = argv;

  switch (subcommand) {
    case 'project':
      await runProject(rest);
      break;
    case 'emit':
      await runEmit(rest);
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
      '',
      'Ejemplos:',
      '  mesh-review project --pending docs/SPEC.md',
      '  mesh-review emit docs/SPEC.md message.posted thread_id=<uuid> body="corrección" commit=null',
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

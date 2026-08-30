/**
 * main.ts — punto de entrada del CLI mesh-review.
 *
 * Parsea argv, enruta a `project` o `emit`, muestra uso si el subcomando
 * no existe. Sin dependencias de `vscode`.
 */

import { runProject } from './commands/project.ts';
import { runEmit } from './commands/emit.ts';
import { runReanchor } from './commands/reanchor.ts';
import { runFix } from './commands/fix.ts';
import { runOpen } from './commands/open.ts';
import { runReply } from './commands/reply.ts';
import { runResolve } from './commands/resolve.ts';
import { runRetract } from './commands/retract.ts';

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
    case 'fix':
      await runFix(rest);
      break;
    case 'open':
      await runOpen(rest);
      break;
    case 'reply':
      await runReply(rest);
      break;
    case 'resolve':
      await runResolve(rest);
      break;
    case 'retract':
      await runRetract(rest);
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
      'Subcomandos de lectura:',
      '  project [--pending] <doc>         Proyecta los hilos abiertos del documento',
      '',
      'Subcomandos de escritura:',
      '  open <doc> --offset <n> --end-offset <n> --type <t> --body <txt>',
      '                                    Abre un hilo (offsets = índices UTF-16)',
      '  reply <doc> <thread_id> --body <txt>',
      '                                    Publica un mensaje sin hacer commit',
      '  resolve <doc> <thread_id>         Cierra el hilo (thread.status-changed resolved)',
      '  retract <doc> <thread_id> <msg_id> [--reason <txt>]',
      '                                    Retracta un mensaje del hilo',
      '  fix <doc> <thread_id> -m <msg> --body <texto>',
      '                                    Commit + mensaje en una llamada',
      '',
      'Herramientas de bajo nivel:',
      '  emit <doc> <tipo> [clave=valor…]  Emite un evento de revisión para el documento',
      '  reanchor <doc>                    Re-resuelve anclas y emite thread.reanchored',
      '',
      'Ejemplos:',
      '  mesh-review project --pending docs/SPEC.md',
      '  mesh-review open docs/SPEC.md --offset 0 --end-offset 5 --type nota --body "Revisar"',
      '  mesh-review reply docs/SPEC.md <uuid> --body "Corrección aplicada"',
      '  mesh-review resolve docs/SPEC.md <uuid>',
      '  mesh-review retract docs/SPEC.md <thread-uuid> <msg-uuid> --reason "Error"',
      '  mesh-review fix docs/SPEC.md <uuid> -m "fix(spec): corrige párrafo" --body "Aplicado"',
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

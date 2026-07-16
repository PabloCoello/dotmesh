// lenses.ts — cálculo puro de los CodeLens de mesh-run.
// Sin importaciones de VS Code; extension.ts convierte offsets en rangos.

import { parseChunks } from './parser.ts';

export interface LensSpec {
  /** Offset en el texto donde se ancla el lens. */
  offset: number;
  title: string;
  command: string;
  /** Argumentos del comando; ausente en comandos sin argumentos. */
  arguments?: string[];
}

/**
 * Calcula los CodeLens de un documento Markdown:
 *
 * - Una vez por documento (offset 0, solo si hay chunks):
 *   "Ejecutar todo" y "Borrar todas las salidas".
 *
 * Las acciones por chunk (Ejecutar, Ejecutar hasta aquí, Borrar salida)
 * se exponen ahora como popup de hover en extension.ts, no como CodeLens.
 */
export function computeLensSpecs(text: string): LensSpec[] {
  const chunks = parseChunks(text);
  if (chunks.length === 0) return [];

  return [
    { offset: 0, title: '▶ Ejecutar todo', command: 'mesh-run.runAll' },
    { offset: 0, title: '✕ Borrar todas las salidas', command: 'mesh-run.clearOutputs' },
  ];
}

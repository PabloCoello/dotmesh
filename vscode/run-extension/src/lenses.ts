// lenses.ts — cálculo puro de los CodeLens de mesh-run.
// Sin importaciones de VS Code; extension.ts convierte offsets en rangos.

import { parseChunks, parseOutputs } from './parser.ts';

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
 * - Por chunk (anclados a su valla de apertura):
 *   "Ejecutar"; "Ejecutar hasta aquí" salvo en el primer chunk (donde
 *   equivaldría a "Ejecutar"); "Borrar salida" solo si el chunk tiene
 *   bloque de salida.
 */
export function computeLensSpecs(text: string): LensSpec[] {
  const chunks = parseChunks(text);
  if (chunks.length === 0) return [];

  const idsWithOutput = new Set(parseOutputs(text).map(o => o.chunkId));

  const specs: LensSpec[] = [
    { offset: 0, title: '▶ Ejecutar todo', command: 'mesh-run.runAll' },
    { offset: 0, title: '✕ Borrar todas las salidas', command: 'mesh-run.clearOutputs' },
    { offset: 0, title: '⟲ Reiniciar kernel', command: 'mesh-run.restartKernel' },
  ];

  chunks.forEach((chunk, index) => {
    specs.push({
      offset: chunk.startOffset,
      title: '▶ Ejecutar',
      command: 'mesh-run.runChunk',
      arguments: [chunk.id],
    });
    if (index > 0) {
      specs.push({
        offset: chunk.startOffset,
        title: '▶▶ Ejecutar hasta aquí',
        command: 'mesh-run.runUpTo',
        arguments: [chunk.id],
      });
    }
    if (idsWithOutput.has(chunk.id)) {
      specs.push({
        offset: chunk.startOffset,
        title: '✕ Borrar salida',
        command: 'mesh-run.clearChunkOutput',
        arguments: [chunk.id],
      });
    }
  });

  return specs;
}

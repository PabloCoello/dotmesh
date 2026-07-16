// writer.ts — truncado, construcción y reemplazo de bloques de salida.
// Funciones puras. Sin importaciones de VS Code ni de Node.

import type { ParsedChunk, ParsedOutput } from './parser.ts';

const DEFAULT_LIMIT = 50;

/**
 * Une las primeras `limit` líneas con \n. Si hay más líneas, añade
 * "[... output truncado en N líneas]" donde N = limit.
 *
 * Límites no finitos o menores que 1 se normalizan al valor por defecto 50.
 */
export function truncateOutput(lines: string[], limit: number): string {
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;

  if (lines.length <= limit) {
    return lines.join('\n');
  }

  return (
    lines.slice(0, limit).join('\n') +
    '\n' +
    `[... output truncado en ${limit} líneas]`
  );
}

/**
 * Atributos opcionales que buildOutputBlock añade al info string.
 * Solo se escriben los campos con valor definido.
 */
export interface OutputBlockOptions {
  warn?: boolean;
  seq?: number;
  up?: string;
}

/**
 * Construye el bloque de salida completo (sin \n final):
 *
 *   ```output {#chunkId hash=XXXXXXXX [warn=1] [seq=N] [up=H]}
 *   ...output...
 *   ```
 *
 * Los atributos opcionales se añaden al final del info string en el orden
 * warn, seq, up. Solo se escriben los que tienen valor definido.
 */
export function buildOutputBlock(
  chunkId: string,
  hash: string,
  output: string,
  options?: OutputBlockOptions
): string {
  let info = `\`\`\`output {#${chunkId} hash=${hash}`;
  if (options?.warn === true) info += ' warn=1';
  if (options?.seq !== undefined) info += ` seq=${options.seq}`;
  if (options?.up !== undefined) info += ` up=${options.up}`;
  info += '}';
  return `${info}\n${output}\n\`\`\``;
}

/**
 * Inserta o reemplaza el bloque de salida en docText.
 *
 * - Si existingOutput está definido: reemplaza exactamente el rango
 *   [existingOutput.startOffset, existingOutput.endOffset) por newOutput.
 *   El texto fuera de ese rango no cambia en ningún carácter.
 *
 * - Si existingOutput es undefined: inserta newOutput tras chunk.endOffset
 *   con una línea en blanco de separación entre el chunk y el bloque.
 *   chunk.endOffset apunta al \n que sigue a la línea de cierre del chunk,
 *   o a docText.length si el chunk cierra el fichero sin \n final.
 */
/**
 * Rango a borrar para eliminar un bloque de salida sin dejar residuo.
 *
 * Es la inversa de la inserción de replaceOrInsertOutputBlock: además del
 * bloque [startOffset, endOffset), consume el \n que termina su última línea
 * y uno de los dos \n anteriores (la línea en blanco de separación que la
 * inserción añadió encima). Borrar solo el rango del bloque dejaría esos dos
 * saltos huérfanos y acumularía una línea en blanco por cada ciclo
 * ejecutar → borrar.
 *
 * En bloques escritos a mano sin línea en blanco encima solo se consume el
 * \n final, sin tocar la línea anterior.
 */
export function outputDeletionRange(
  docText: string,
  output: Pick<ParsedOutput, 'startOffset' | 'endOffset'>,
): { startOffset: number; endOffset: number } {
  let { startOffset, endOffset } = output;

  // \n que termina la línea de cierre del bloque (ausente si el bloque es EOF)
  if (endOffset < docText.length && docText[endOffset] === '\n') {
    endOffset++;
  }

  // Línea en blanco inmediatamente anterior: consumir uno de los dos \n
  if (
    startOffset >= 2 &&
    docText[startOffset - 1] === '\n' &&
    docText[startOffset - 2] === '\n'
  ) {
    startOffset--;
  }

  return { startOffset, endOffset };
}

export function replaceOrInsertOutputBlock(
  docText: string,
  chunk: ParsedChunk,
  existingOutput: ParsedOutput | undefined,
  newOutput: string
): string {
  if (existingOutput !== undefined) {
    return (
      docText.slice(0, existingOutput.startOffset) +
      newOutput +
      docText.slice(existingOutput.endOffset)
    );
  }

  // Inserción: chunk.endOffset apunta al \n de cierre o al EOF
  const E = chunk.endOffset;
  if (E >= docText.length) {
    // El chunk cierra el fichero sin \n: añadimos los dos saltos antes del bloque
    return docText + '\n\n' + newOutput + '\n';
  }

  // text[E] === '\n': conservamos ese \n, añadimos la línea en blanco y el bloque
  return docText.slice(0, E + 1) + '\n' + newOutput + '\n' + docText.slice(E + 1);
}

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
 * Construye el bloque de salida completo (sin \n final):
 *
 *   ```output {#chunkId hash=XXXXXXXX}
 *   ...output...
 *   ```
 */
export function buildOutputBlock(
  chunkId: string,
  hash: string,
  output: string
): string {
  return `\`\`\`output {#${chunkId} hash=${hash}}\n${output}\n\`\`\``;
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

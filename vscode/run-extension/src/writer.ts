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
 * Rango a borrar para eliminar un bloque de salida sin dejar residuo.
 *
 * Es la inversa de la inserción de replaceOrInsertOutputBlock: además del
 * bloque [startOffset, endOffset), consume el \n que termina su última línea.
 * Si además hay una línea en blanco inmediatamente anterior (documentos legados
 * con la separación antigua), también la consume. Borrar solo el rango del
 * bloque dejaría esos saltos huérfanos y acumularía líneas en blanco por cada
 * ciclo ejecutar → borrar.
 *
 * En bloques sin línea en blanco encima solo se consume el \n final.
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

/**
 * Inserta o reemplaza el bloque de salida en docText.
 *
 * - Si existingOutput está definido: reemplaza el bloque anterior por newOutput.
 *   Si el bloque legado tenía una línea en blanco de separación encima
 *   (`\n\n` antes de startOffset), la consume para normalizar al formato
 *   actual (una sola línea entre chunk y output).
 *
 * - Si existingOutput es undefined: inserta newOutput directamente tras el
 *   cierre del chunk, sin línea en blanco de separación.
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
    // Reemplazo: si hay línea en blanco legada encima, retroceder 1 para consumirla
    let start = existingOutput.startOffset;
    if (
      start >= 2 &&
      docText[start - 1] === '\n' &&
      docText[start - 2] === '\n'
    ) {
      start--;
    }
    return (
      docText.slice(0, start) +
      newOutput +
      docText.slice(existingOutput.endOffset)
    );
  }

  // Inserción: chunk.endOffset apunta al \n de cierre o al EOF
  const E = chunk.endOffset;
  if (E >= docText.length) {
    // El chunk cierra el fichero sin \n: un solo salto antes del bloque y uno tras él
    return docText + '\n' + newOutput + '\n';
  }

  // text[E] === '\n': conservamos ese \n e insertamos el bloque inmediatamente después
  return docText.slice(0, E + 1) + newOutput + '\n' + docText.slice(E + 1);
}

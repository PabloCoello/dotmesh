// adorn.ts — cálculo puro de rangos de ocultación y adornos before.
// Sin importaciones de vscode; extension.ts convierte offsets en vscode.Range.

import type { ParsedChunk, ParsedOutput } from './parser.ts';
import type { OutputState, OutputStateResult } from './stale.ts';

export interface ConcealSpec {
  startOffset: number;
  endOffset: number;     // exclusivo; no incluye el \n de fin de línea
}

export interface BeforeSpec {
  lineStartOffset: number; // offset del primer carácter de la línea
  lineEndOffset: number;   // offset del \n de fin de línea (o EOF)
  contentText: string;
  state: OutputState;      // determina el color del before
}

export interface AdornResult {
  conceal: ConcealSpec[];  // rangos de valla a hacer invisibles
  before: BeforeSpec[];    // textos before por línea
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Offset del inicio de la línea que contiene `offset`. */
function lineStartOffset(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

/** Offset del primer \n a partir de `lineStart`, o text.length si no hay. */
function lineEndOffset(text: string, lineStart: number): number {
  const nl = text.indexOf('\n', lineStart);
  return nl === -1 ? text.length : nl;
}

/**
 * Pares [lineStart, lineEnd] de las líneas de contenido del output
 * (sin incluir las vallas de apertura y cierre).
 * lineEnd es el offset del \n (o text.length para la última línea sin \n).
 */
function contentLineOffsets(text: string, output: ParsedOutput): Array<[number, number]> {
  const openNl = text.indexOf('\n', output.startOffset);
  if (openNl === -1) return [];

  const closeLineStart = lineStartOffset(text, output.endOffset);
  const result: Array<[number, number]> = [];

  let pos = openNl + 1;
  while (pos < closeLineStart) {
    const end = lineEndOffset(text, pos);
    result.push([pos, end]);
    pos = end + 1;
  }

  return result;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Calcula los rangos a ocultar (conceal) y los textos before a añadir
 * dado el texto del documento, los chunks, los outputs, los estados y el
 * offset del cursor activo (-1 si no hay cursor).
 *
 * No llama a parseChunks ni parseOutputs: extension.ts ya los tiene
 * calculados y los pasa como argumentos.
 */
export function computeAdornments(
  text: string,
  chunks: ParsedChunk[],
  outputs: ParsedOutput[],
  states: OutputStateResult[],
  cursorOffset: number,
): AdornResult {
  if (chunks.length === 0) return { conceal: [], before: [] };

  // Detectar chunkIds duplicados entre chunks
  const seenChunkIds = new Set<string>();
  const duplicateChunkIds = new Set<string>();
  for (const chunk of chunks) {
    if (seenChunkIds.has(chunk.id)) {
      duplicateChunkIds.add(chunk.id);
    } else {
      seenChunkIds.add(chunk.id);
    }
  }

  // Mapear chunkId → output para ids únicos con exactamente un output
  const outputByChunkId = new Map<string, ParsedOutput>();
  const multipleOutputIds = new Set<string>();
  for (const output of outputs) {
    if (outputByChunkId.has(output.chunkId)) {
      multipleOutputIds.add(output.chunkId);
    } else {
      outputByChunkId.set(output.chunkId, output);
    }
  }
  // Retirar los que tienen más de un output
  for (const id of multipleOutputIds) {
    outputByChunkId.delete(id);
  }

  // Mapear output.startOffset → estado para la búsqueda por output concreto
  const stateByOutputStart = new Map<number, OutputState>();
  for (const s of states) {
    stateByOutputStart.set(s.startOffset, s.state);
  }

  const conceal: ConcealSpec[] = [];
  const before: BeforeSpec[] = [];

  for (const chunk of chunks) {
    const cursorInChunk =
      cursorOffset >= chunk.startOffset && cursorOffset <= chunk.endOffset;

    // Longitud de la línea de apertura del chunk (incluye la sangría hasta 3 espacios)
    const actualOpenLineStart = lineStartOffset(text, chunk.startOffset);
    const openFenceNl = text.indexOf('\n', chunk.startOffset);
    const openFenceLineEnd = openFenceNl === -1 ? text.length : openFenceNl;
    const openLineLen = openFenceLineEnd - actualOpenLineStart;

    // Línea de cierre del chunk
    const closeLineStart = lineStartOffset(text, chunk.endOffset);
    // chunk.endOffset apunta al \n tras la línea de cierre (o text.length)
    const closeLineEnd = chunk.endOffset;

    if (!cursorInChunk) {
      // Ocultar valla de apertura (desde primer backtick hasta \n, sin incluir \n)
      conceal.push({ startOffset: chunk.startOffset, endOffset: openFenceLineEnd });
      // Ocultar valla de cierre (desde inicio de línea hasta \n, sin incluir \n)
      conceal.push({ startOffset: closeLineStart, endOffset: closeLineEnd });
    }

    // Solo pares vinculados: chunk id único Y exactamente un output para ese id
    if (duplicateChunkIds.has(chunk.id)) continue;
    if (multipleOutputIds.has(chunk.id)) continue;
    const output = outputByChunkId.get(chunk.id);
    if (!output) continue;

    const state = stateByOutputStart.get(output.startOffset) ?? 'stale';

    const cursorInOutput =
      cursorOffset >= output.startOffset && cursorOffset <= output.endOffset;

    // Valla de apertura del output
    const outOpenNl = text.indexOf('\n', output.startOffset);
    const outOpenLineEnd = outOpenNl === -1 ? text.length : outOpenNl;

    // Valla de cierre del output
    const outCloseLineStart = lineStartOffset(text, output.endOffset);
    const outCloseLineEnd = output.endOffset;

    if (!cursorInOutput) {
      // Ocultar vallas del output
      conceal.push({ startOffset: output.startOffset, endOffset: outOpenLineEnd });
      conceal.push({ startOffset: outCloseLineStart, endOffset: outCloseLineEnd });

      // Before: barra horizontal en la valla de cierre del chunk
      // Solo si el cursor tampoco está en el chunk (cuando el cursor está dentro,
      // la valla de cierre está revelada y la barra estorbaría)
      if (!cursorInChunk) {
        before.push({
          lineStartOffset: closeLineStart,
          lineEndOffset: closeLineEnd,
          contentText: '─'.repeat(openLineLen),
          state,
        });
      }

      // Before: línea en blanco intermedia (si existe)
      const hasBlankLine =
        output.startOffset >= 2 &&
        text[output.startOffset - 1] === '\n' &&
        text[output.startOffset - 2] === '\n';
      if (hasBlankLine) {
        const blankNlOffset = output.startOffset - 1;
        before.push({
          lineStartOffset: blankNlOffset,
          lineEndOffset: blankNlOffset,
          contentText: '│',
          state,
        });
      }

      // Before: valla de apertura del output → '│'
      before.push({
        lineStartOffset: output.startOffset,
        lineEndOffset: outOpenLineEnd,
        contentText: '│',
        state,
      });

      // Before: líneas de contenido del output
      const contentLines = contentLineOffsets(text, output);
      for (let i = 0; i < contentLines.length; i++) {
        const [lStart, lEnd] = contentLines[i];
        before.push({
          lineStartOffset: lStart,
          lineEndOffset: lEnd,
          contentText: i === 0 ? '╰─▶ ' : '    ',
          state,
        });
      }
    }
  }

  return { conceal, before };
}

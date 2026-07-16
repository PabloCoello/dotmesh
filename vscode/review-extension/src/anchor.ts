/**
 * anchor.ts — resolución y seguimiento de anclas textuales.
 *
 * Funciones puras sobre strings y offsets. Sin importaciones de VS Code ni de
 * Node. La capa VS Code (extension.ts) convierte vscode.Range ↔ offsets de
 * carácter y llama a estas funciones.
 */

export interface Anchor {
  quote: string;
  line_hint: number;
  char_offset: number;
}

/**
 * Umbral de distancia (en caracteres) entre el mejor match de `resolveAnchor`
 * y el `char_offset` original a partir del cual el resultado se marca como
 * incierto (`uncertain: true`). Exportado para su uso en tests y en la capa
 * de reanclado en vivo (P3).
 */
export const ANCHOR_UNCERTAINTY_THRESHOLD = 200;

/**
 * Crea un ancla a partir del texto completo del documento y los offsets de
 * carácter de inicio y fin de la selección.
 *
 * @param text         Contenido completo del documento.
 * @param startOffset  Offset de carácter del inicio de la selección.
 * @param endOffset    Offset de carácter del fin de la selección (exclusivo).
 */
export function createAnchor(text: string, startOffset: number, endOffset: number): Anchor {
  const quote = text.slice(startOffset, endOffset);
  // line_hint: número de línea base-0 donde está el inicio de la selección
  const textBefore = text.slice(0, startOffset);
  const line_hint = textBefore.split('\n').length - 1;
  return { quote, line_hint, char_offset: startOffset };
}

/**
 * Resuelve un ancla buscando `anchor.quote` en el texto del documento.
 *
 * Devuelve `{ startOffset, endOffset }` si se encuentra la cita, o `null`
 * si el texto ya no existe en el documento.
 *
 * Desambiguación: si `quote` aparece varias veces, elige la ocurrencia cuyo
 * `startOffset` es más cercano a `anchor.char_offset`.
 *
 * @param text    Contenido actual del documento.
 * @param anchor  Ancla creada en el momento de añadir el comentario.
 */
export function resolveAnchor(
  text: string,
  anchor: Anchor
): { startOffset: number; endOffset: number; uncertain?: boolean } | null {
  const { quote, char_offset } = anchor;

  if (!quote) return null;

  // Recopila todas las ocurrencias NO solapadas de quote en text.
  // Avanzamos searchFrom por quote.length en lugar de +1: las ocurrencias
  // solapadas (p. ej. "aa" en "aaa") no aportan como ancla y generarían
  // iteraciones extra en el bucle de mejor candidato (peor caso O(n²)
  // para citas muy cortas en documentos grandes). Para citas de 1 char,
  // quote.length === 1 y el comportamiento es idéntico al anterior.
  const occurrences: number[] = [];
  let searchFrom = 0;
  while (searchFrom <= text.length) {
    const idx = text.indexOf(quote, searchFrom);
    if (idx === -1) break;
    occurrences.push(idx);
    searchFrom = idx + quote.length;
  }

  if (occurrences.length === 0) return null;

  // Elige la ocurrencia más cercana a char_offset (cubre tanto una como varias).
  let best = occurrences[0];
  let bestDist = Math.abs(occurrences[0] - char_offset);

  for (let i = 1; i < occurrences.length; i++) {
    const dist = Math.abs(occurrences[i] - char_offset);
    if (dist < bestDist) {
      bestDist = dist;
      best = occurrences[i];
    }
  }

  const result: { startOffset: number; endOffset: number; uncertain?: boolean } = {
    startOffset: best,
    endOffset: best + quote.length,
  };
  if (bestDist > ANCHOR_UNCERTAINTY_THRESHOLD) {
    result.uncertain = true;
  }
  return result;
}

/**
 * Desplaza un rango `{start, end}` aplicando los `contentChanges` de VS Code
 * en el orden en que los provee (de fin a inicio del documento). Solo aritmética
 * de offsets: no requiere el texto completo del documento.
 *
 * Casos:
 *   - Cambio completamente antes del rango (`changeEnd <= start`):
 *     desplaza start y end por delta = text.length − rangeLength.
 *   - Cambio completamente después del rango (`changeStart >= end`):
 *     sin efecto.
 *   - Cambio contenido dentro del rango (`changeStart ∈ [start,end]` y
 *     `changeEnd ∈ [start,end]`): ajusta end por delta. Si el rango queda
 *     colapsado (end ≤ start tras el delta), el ancla se destruye → null.
 *   - Cualquier otro caso (solapamiento parcial o envolvimiento total):
 *     el ancla queda destruida → null.
 *
 * @param rangeStart   Offset de inicio del rango anclado (inclusive).
 * @param rangeEnd     Offset de fin del rango anclado (exclusive).
 * @param contentChanges  Array de cambios tal como lo provee VS Code en
 *   `TextDocumentChangeEvent.contentChanges` (orden fin→inicio del doc).
 * @returns  El rango desplazado, o `null` si el ancla fue destruida.
 */
export function shiftAnchorRange(
  rangeStart: number,
  rangeEnd: number,
  contentChanges: ReadonlyArray<{
    rangeOffset: number;
    rangeLength: number;
    text: string;
  }>
): { start: number; end: number } | null {
  let start = rangeStart;
  let end = rangeEnd;

  for (const change of contentChanges) {
    const changeStart = change.rangeOffset;
    const changeEnd = change.rangeOffset + change.rangeLength;
    const delta = change.text.length - change.rangeLength;

    if (changeEnd <= start) {
      // Antes del rango: desplazar ambos extremos
      start += delta;
      end += delta;
    } else if (changeStart >= end) {
      // Después del rango: sin efecto
    } else if (changeStart >= start && changeEnd <= end) {
      // Contenido dentro del rango: ajustar solo end
      end += delta;
      if (end <= start) return null; // rango colapsado por borrado interno
    } else {
      // Solapamiento parcial o envolvimiento: ancla destruida
      return null;
    }
  }

  return { start, end };
}

/**
 * anchor.ts — resolución de anclas por cita textual.
 *
 * Funciones puras sobre strings. Sin importaciones de VS Code ni de Node.
 * La capa VS Code (extension.ts) convierte vscode.Range ↔ offsets de carácter
 * y llama a estas funciones.
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

  // Recopila todas las ocurrencias de quote en text
  const occurrences: number[] = [];
  let searchFrom = 0;
  while (searchFrom <= text.length) {
    const idx = text.indexOf(quote, searchFrom);
    if (idx === -1) break;
    occurrences.push(idx);
    searchFrom = idx + 1;
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

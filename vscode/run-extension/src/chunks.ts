// chunks.ts — utilidades puras para generación de IDs de chunk e inserción.
// Sin importaciones de VS Code ni de Node.

export interface TextRange {
  startOffset: number;
  endOffset: number;
}

/**
 * Genera el ID de chunk mínimo no ocupado de la forma «chunk-<n>» (n ≥ 1).
 * Ejemplo: si existingIds = ['chunk-1', 'chunk-3'], devuelve 'chunk-2'.
 */
export function generateChunkId(existingIds: readonly string[]): string {
  const ids = new Set(existingIds);
  let n = 1;
  while (ids.has(`chunk-${n}`)) n++;
  return `chunk-${n}`;
}

/**
 * Infiere el lenguaje de los chunks ya presentes en el documento.
 *
 * - Sin chunks: devuelve null (el llamante debe preguntar al usuario).
 * - Un solo lenguaje: lo devuelve normalizado a minúsculas.
 * - Mezcla de lenguajes: devuelve el lenguaje del último chunk (el más
 *   cercano al punto de inserción habitual) — decisión simple y documentada.
 */
export function resolveChunkLanguage(
  chunks: readonly { language: string }[],
): string | null {
  if (chunks.length === 0) return null;
  return chunks[chunks.length - 1].language.toLowerCase();
}

/**
 * Devuelve el offset en `text` donde se debe insertar el nuevo chunk.
 *
 * El offset devuelto es siempre «el final de la línea de inserción»: la
 * posición del \n que la termina, o text.length si es la última línea sin \n.
 * El texto insertado debe empezar por \n para abrir línea nueva; insertar
 * ANTES del \n existente garantiza que la valla de cierre del chunk nuevo
 * conserva un salto de línea detrás y no se fusiona con la línea siguiente.
 *
 * - Si cursorOffset cae dentro de algún rango de `fences` (extremos
 *   incluidos): la línea de inserción es la línea de cierre de esa valla
 *   (endOffset apunta a su \n, o a text.length en EOF; ver parser.ts).
 * - Si no: la línea de inserción es la línea del cursor.
 */
export function resolveChunkInsertionOffset(
  text: string,
  cursorOffset: number,
  fences: readonly TextRange[],
): number {
  const enclosing = fences.find(
    f => cursorOffset >= f.startOffset && cursorOffset <= f.endOffset,
  );

  if (enclosing) {
    return enclosing.endOffset;
  }

  const nlIdx = text.indexOf('\n', cursorOffset);
  return nlIdx === -1 ? text.length : nlIdx;
}

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
 * Devuelve el offset en `text` donde se debe insertar el nuevo chunk.
 *
 * - Si cursorOffset cae dentro de algún rango de `fences` (extremos incluidos):
 *   inserta tras la línea de cierre de esa valla:
 *   endOffset + 1 si endOffset < text.length (apunta al \n tras el cierre),
 *   o text.length si el cierre es la última línea sin \n final (EOF).
 * - Si no: inserta al final de la línea del cursor, es decir, en la posición
 *   del \n que termina esa línea, o text.length si es la última línea sin \n.
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
    return enclosing.endOffset < text.length
      ? enclosing.endOffset + 1
      : text.length;
  }

  const nlIdx = text.indexOf('\n', cursorOffset);
  return nlIdx === -1 ? text.length : nlIdx;
}

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

/** Lenguajes que mesh-run soporta para inserción de chunks. */
const SUPPORTED_LANGUAGES = ['python', 'r'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Infiere el lenguaje de los chunks ya presentes en el documento.
 *
 * Contrato:
 * - Sin chunks → null (el llamante debe preguntar al usuario).
 * - El lenguaje del último chunk manda en caso de mezcla (decisión documentada).
 * - Si el lenguaje inferido no está en la whitelist `['python', 'r']` → null,
 *   de modo que el llamante vuelve a preguntar. Esto evita insertar vallas con
 *   lenguajes no soportados (p. ej. `bash`, `python3`) heredados del documento.
 */
export function resolveChunkLanguage(
  chunks: readonly { language: string }[],
): SupportedLanguage | null {
  if (chunks.length === 0) return null;
  const lang = chunks[chunks.length - 1].language.toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang)
    ? (lang as SupportedLanguage)
    : null;
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

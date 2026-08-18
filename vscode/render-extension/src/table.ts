/**
 * table.ts — detección de tabla GFM bajo el cursor.
 *
 * Módulo puro sin dependencias de vscode ni de Node. Testeable directamente
 * con node:test igual que decorations-utils.ts en mesh-review.
 * La capa que adapta vscode.TextDocument / vscode.Position a los tipos simples
 * que espera este módulo vive en hover.ts.
 */

/** Devuelve true si la línea contiene al menos un carácter pipe. */
function isTableRow(line: string): boolean {
  return line.includes('|');
}

/**
 * Devuelve true si la línea es una fila separadora GFM válida.
 * Cada celda (dividida por '|') debe coincidir con /^\s*:?-+:?\s*$/.
 *
 * Exportada para ser reutilizada por gutter.ts sin duplicar la lógica.
 */
export function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  // Eliminar pipes exteriores opcionales y dividir por '|'
  const inner = trimmed.replace(/^\||\|$/g, '');
  const cells = inner.split('|');
  return (
    cells.length > 0 &&
    cells.every(cell => /^\s*:?-+:?\s*$/.test(cell))
  );
}

/**
 * Dado el documento como array de líneas y una posición del cursor (0-based),
 * devuelve el bloque GFM completo de la tabla como cadena si el cursor cae en
 * cualquier línea de la tabla, o null si no.
 *
 * Una tabla GFM válida exige:
 *   - línea 0 (cabecera): cualquier línea con '|'
 *   - línea 1 (separador): celdas que coincidan con :?-+:?
 *   - líneas 2..N (datos): cualquier línea con '|' (pueden ser cero)
 *
 * El parámetro cursorChar se reserva para extensiones futuras (p. ej. resaltar
 * la celda bajo el cursor); en esta fase se ignora.
 */
export function tableAtPosition(
  lines: string[],
  cursorLine: number,
  _cursorChar: number,
): string | null {
  if (cursorLine < 0 || cursorLine >= lines.length) return null;
  if (!isTableRow(lines[cursorLine])) return null;

  // Escanear hacia arriba para encontrar el inicio del bloque
  let start = cursorLine;
  while (start > 0 && isTableRow(lines[start - 1])) {
    start--;
  }

  // La tabla necesita al menos dos líneas (cabecera + separador)
  if (start + 1 >= lines.length) return null;

  // La segunda línea del bloque debe ser el separador GFM
  if (!isSeparatorRow(lines[start + 1])) return null;

  // Escanear hacia abajo para encontrar el final del bloque
  let end = start;
  while (end + 1 < lines.length && isTableRow(lines[end + 1])) {
    end++;
  }

  // Verificar que el cursor está dentro del bloque detectado
  if (cursorLine < start || cursorLine > end) return null;

  return lines.slice(start, end + 1).join('\n');
}

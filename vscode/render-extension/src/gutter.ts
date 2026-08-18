/**
 * gutter.ts — detección de líneas con contenido renderable para el icono de
 * gutter de mesh-render.
 *
 * Módulo puro sin dependencias de vscode. Testeable directamente con node:test
 * igual que table.ts y formula.ts. La capa de VS Code (TextEditorDecorationType,
 * debounce, suscripciones) vive en extension.ts.
 *
 * Reglas de marcado:
 *   - Tabla GFM: solo la línea de cabecera (primera del bloque).
 *   - Bloque $$...$$: solo la primera línea (valla de apertura o línea
 *     single-line $$ contenido $$).
 *   - Fórmula inline $...$: la línea que la contiene.
 *
 * La lógica de detección se reutiliza desde isSeparatorRow (table.ts) y
 * formulaAtPosition (formula.ts) para no duplicar reglas.
 */

import { isSeparatorRow } from './table.ts';
import { formulaAtPosition } from './formula.ts';

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** True si la línea contiene al menos un pipe (posible fila de tabla GFM). */
function isTableRow(line: string): boolean {
  return line.includes('|');
}

/** Regex para bloque single-line: $$ contenido $$ en una sola línea. */
const BLOCK_SINGLE_RE = /\$\$(.+?)\$\$/;

/** Regex para valla de bloque: la línea contiene solo $$ (más espacios). */
const BLOCK_FENCE_RE = /^\s*\$\$\s*$/;

/**
 * True si la línea contiene al menos una fórmula inline $...$ válida.
 * Reutiliza formulaAtPosition para no duplicar las reglas de mitigación de
 * falsos positivos (precio, espacio tras $, par sin cierre, etc.).
 */
function lineHasInlineFormula(line: string): boolean {
  if (!line.includes('$')) return false;
  for (let col = 0; col < line.length; col++) {
    if (line[col] === '$') {
      const result = formulaAtPosition([line], 0, col);
      if (result !== null && result.kind === 'inline') return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Dado el documento como array de líneas (0-based), devuelve los índices de
 * línea que contienen el INICIO de contenido renderable:
 *
 *   - Tabla GFM: solo la línea de cabecera (primera del bloque). Las líneas
 *     separadoras y las filas de datos no se marcan.
 *   - Bloque $$...$$: solo la primera línea (valla de apertura o línea
 *     single-line $$ contenido $$). Las líneas interiores al bloque no se marcan.
 *   - Fórmula inline $...$: la línea que la contiene.
 *
 * El array devuelto está ordenado de forma creciente y no contiene duplicados.
 */
export function gutterLines(lines: string[]): number[] {
  const result: number[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Tabla GFM: la línea tiene pipe y la siguiente es separador válido.
    //    Solo se marca la cabecera; el bloque completo se salta.
    if (isTableRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      result.push(i);
      i += 2; // saltar cabecera + separador
      while (i < lines.length && isTableRow(lines[i])) i++; // saltar filas de datos
      continue;
    }

    // 2. Bloque single-line: $$ contenido $$ en la misma línea.
    if (BLOCK_SINGLE_RE.test(line)) {
      result.push(i);
      i++;
      continue;
    }

    // 3. Bloque multilínea: valla de apertura $$ (solo $$ en la línea).
    //    Se marca la apertura y se salta el interior hasta la valla de cierre.
    if (BLOCK_FENCE_RE.test(line)) {
      result.push(i);
      i++;
      while (i < lines.length && !BLOCK_FENCE_RE.test(lines[i])) i++;
      if (i < lines.length) i++; // saltar la valla de cierre
      continue;
    }

    // 4. Fórmula inline $...$: reutiliza la detección de formula.ts.
    if (lineHasInlineFormula(line)) {
      result.push(i);
    }

    i++;
  }

  return result;
}

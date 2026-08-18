/**
 * formula.ts — detección de delimitadores de fórmula LaTeX y render con MathJax.
 *
 * Módulo puro para la detección de posición (formulaAtPosition); sin importar
 * vscode para que sea testeable directamente con node:test.
 * renderLatex sí importa mathjax-full (bundleado por esbuild).
 */

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface FormulaResult {
  kind: 'inline' | 'block';
  latex: string;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Devuelve true si la línea es una valla $$ de bloque (solo contiene $$). */
function isBlockFence(line: string): boolean {
  return /^\s*\$\$\s*$/.test(line);
}

/**
 * Intenta detectar un bloque $$ ... $$ en el que cae el cursor.
 * Primero comprueba la variante single-line ($$ contenido $$), luego la
 * multilínea (vallas $$ en líneas separadas).
 */
function blockFormulaAtPosition(
  lines: string[],
  cursorLine: number,
): FormulaResult | null {
  const line = lines[cursorLine];

  // Single-line: $$ contenido $$ (contenido no vacío)
  const singleMatch = /\$\$(.+?)\$\$/.exec(line);
  if (singleMatch) {
    const latex = singleMatch[1].trim();
    if (latex) return { kind: 'block', latex };
  }

  // Si el cursor está en una valla $$ el contenido está en otra línea
  if (isBlockFence(line)) return null;

  // Multi-línea: escanear hacia arriba para encontrar la valla de apertura
  let openLine = -1;
  for (let i = cursorLine - 1; i >= 0; i--) {
    if (isBlockFence(lines[i])) { openLine = i; break; }
  }
  if (openLine === -1) return null;

  // Escanear hacia abajo para encontrar la valla de cierre
  let closeLine = -1;
  for (let i = cursorLine + 1; i < lines.length; i++) {
    if (isBlockFence(lines[i])) { closeLine = i; break; }
  }
  if (closeLine === -1) return null;

  const latex = lines.slice(openLine + 1, closeLine).join('\n').trim();
  if (!latex) return null;

  return { kind: 'block', latex };
}

/**
 * Detecta fórmulas inline $...$ en la línea del cursor.
 * Reglas de mitigación de falsos positivos:
 *   - el carácter tras $ de apertura no es espacio ni tabulador
 *   - el contenido no está vacío
 *   - el par abre y cierra en la misma línea
 *   - $$ se trata como delimitador de bloque y se omite
 */
function inlineFormulaAtPosition(
  line: string,
  cursorChar: number,
): FormulaResult | null {
  const len = line.length;
  let i = 0;

  while (i < len) {
    if (line[i] !== '$') { i++; continue; }

    // Secuencia $$: saltar todo el span $$ ... $$ y continuar
    if (i + 1 < len && line[i + 1] === '$') {
      i += 2;
      while (i < len - 1 && !(line[i] === '$' && line[i + 1] === '$')) i++;
      i += 2;
      continue;
    }

    // $ solitario: intento de inline
    const startOuter = i;
    i++; // avanzar más allá del $

    // El siguiente carácter no debe ser espacio ni tab
    if (i >= len || line[i] === ' ' || line[i] === '\t') continue;

    // Buscar $ de cierre en la misma línea
    const contentStart = i;
    while (i < len && line[i] !== '$') i++;

    if (i >= len) return null; // sin cierre en esta línea

    const contentEnd = i;
    const endOuter = i + 1;
    const latex = line.slice(contentStart, contentEnd);

    if (latex.length > 0 && cursorChar >= startOuter && cursorChar < endOuter) {
      return { kind: 'inline', latex };
    }

    i++; // avanzar más allá del $ de cierre
  }

  return null;
}

// ---------------------------------------------------------------------------
// API pública — detección
// ---------------------------------------------------------------------------

/**
 * Dado el documento como array de líneas y la posición del cursor (0-based),
 * devuelve la fórmula bajo el cursor o null si no hay ninguna.
 *
 * Precedencia: bloque $$ sobre inline $; si el cursor cae en un bloque,
 * se devuelve el bloque aunque la misma línea contenga también un inline.
 */
export function formulaAtPosition(
  lines: string[],
  cursorLine: number,
  cursorChar: number,
): FormulaResult | null {
  if (cursorLine < 0 || cursorLine >= lines.length) return null;

  const block = blockFormulaAtPosition(lines, cursorLine);
  if (block !== null) return block;

  return inlineFormulaAtPosition(lines[cursorLine], cursorChar);
}

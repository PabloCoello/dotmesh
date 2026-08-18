/**
 * formula.ts — detección de delimitadores de fórmula LaTeX y render con MathJax.
 *
 * La sección de detección (formulaAtPosition) es un módulo puro sin dependencias
 * de vscode, testeable directamente con node:test.
 * renderLatex importa mathjax-full (bundleado por esbuild en out/extension.js).
 *
 * API MathJax verificada contra mathjax-full@3.2.x:
 *   liteAdaptor()          — adaptador sin DOM (nodo/navegador independiente)
 *   RegisterHTMLHandler()  — registra el manejador HTML en el singleton mathjax
 *   mathjax.document()     — crea un documento de conversión
 *   doc.convert()          — convierte LaTeX → nodo SVG (síncrono)
 *   adaptor.outerHTML()    — serializa el nodo a cadena HTML/SVG
 */

// Imports de MathJax — todos estáticos para que esbuild los bundlee sin
// necesidad de loader dinámico. Se importan con la ruta JS del paquete CJS.
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';

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

// ---------------------------------------------------------------------------
// Render con MathJax
// ---------------------------------------------------------------------------

// Singleton: el documento MathJax y el adaptador se inicializan una sola vez.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mjxDoc: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mjxAdaptor: any | null = null;

function getMathJax(): { doc: any; adaptor: any } {
  if (_mjxDoc && _mjxAdaptor) {
    return { doc: _mjxDoc, adaptor: _mjxAdaptor };
  }
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const tex = new TeX({ packages: ['base', 'ams'] });
  const svg = new SVG({ fontCache: 'none' });
  const doc = mathjax.document('', { InputJax: tex, OutputJax: svg });
  _mjxAdaptor = adaptor;
  _mjxDoc = doc;
  return { doc, adaptor };
}

/** Caché de expresión LaTeX → SVG (o mensaje de error). */
const _renderCache = new Map<string, string>();

/**
 * Renderiza una expresión LaTeX a SVG con MathJax.
 *
 * @param latex   - Expresión LaTeX sin delimitadores ($, $$).
 * @param display - true para modo display (bloque centrado), false para inline.
 * @returns       SVG autocontenido como cadena, o un mensaje de error de MathJax
 *                si la expresión es inválida. Nunca lanza.
 *
 * El SVG resultante usa `fill=currentColor` / `stroke=currentColor` para heredar
 * el color del tema del editor (claro / oscuro).
 * Las llamadas repetidas con la misma (latex, display) usan caché en memoria.
 */
export async function renderLatex(latex: string, display = false): Promise<string> {
  const cacheKey = `${display ? 'D' : 'I'}:${latex}`;
  const cached = _renderCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const { doc, adaptor } = getMathJax();
  const node = doc.convert(latex, { display });
  const containerHtml: string = adaptor.outerHTML(node);

  // Detectar error de LaTeX: MathJax incluye data-mjx-error en el nodo merror
  const errMatch = /data-mjx-error="([^"]*)"/.exec(containerHtml);
  if (errMatch) {
    const msg = `LaTeX error: ${errMatch[1]}`;
    _renderCache.set(cacheKey, msg);
    return msg;
  }

  // Extraer solo el elemento <svg> del contenedor mjx-container
  const svgMatch = /<svg[\s\S]*?<\/svg>/.exec(containerHtml);
  const result = svgMatch ? svgMatch[0] : containerHtml;

  _renderCache.set(cacheKey, result);
  return result;
}

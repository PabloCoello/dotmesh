/**
 * table-render.ts — render enriquecido de tablas GFM.
 *
 * Sustituye las fórmulas $...$ y $$...$$ de las celdas por imágenes SVG
 * data: antes de pasar el markdown al MarkdownString de VS Code.
 *
 * Módulo puro sin dependencias de vscode (reutiliza renderLatex de formula.ts).
 */

import { renderLatex } from './formula.ts';

/**
 * Dado el markdown de una tabla GFM, sustituye todas las fórmulas inline
 * $...$ y bloque $$...$$ de las celdas por sus imágenes SVG (data URI).
 * El resto del markdown de la tabla se mantiene intacto.
 *
 * @param tableMarkdown  Bloque GFM completo devuelto por tableAtPosition.
 * @returns              Markdown con las fórmulas reemplazadas por imágenes.
 */
export async function renderTableMarkdown(tableMarkdown: string): Promise<string> {
  // Procesar línea a línea para preservar la estructura de la tabla
  const lines = tableMarkdown.split('\n');
  const rendered = await Promise.all(lines.map(line => renderTableLine(line)));
  return rendered.join('\n');
}

/**
 * Sustituye las fórmulas de una línea de tabla por imágenes SVG.
 * Prioridad: $$ (bloque inline en celda) sobre $ (inline).
 */
async function renderTableLine(line: string): Promise<string> {
  // Primero sustituir $$ ... $$ (bloque inline dentro de celda)
  line = await replaceAsync(line, /\$\$(.+?)\$\$/g, async (_, latex: string) => {
    const trimmed = latex.trim();
    if (!trimmed) return '$$$$';
    return svgOrError(await renderLatex(trimmed, true));
  });

  // Luego sustituir $ ... $ (inline, sin espacio tras $)
  line = await replaceAsync(line, /\$([^\s$][^$]*)\$/g, async (_, latex: string) => {
    return svgOrError(await renderLatex(latex.trim(), false));
  });

  return line;
}

/**
 * Dado el resultado de renderLatex, devuelve la imagen data URI o el mensaje
 * de error escapado para incrustar en la celda de tabla.
 *
 * El mensaje de error se envuelve en backticks para neutralizar cualquier
 * metacaracter markdown que pudiera provenir del texto del error de MathJax
 * (por ejemplo `[`, `]`, `(`, `)`, `*`, `_`, etc.).
 */
function svgOrError(result: string): string {
  if (result.startsWith('LaTeX error:')) {
    // Escapar el mensaje: reemplazar backticks internos para evitar romper el
    // bloque de código inline, luego envolver en backticks.
    const safe = result.replace(/`/g, "'");
    return `\`${safe}\``;
  }
  const dataUri = `data:image/svg+xml;base64,${Buffer.from(result).toString('base64')}`;
  return `![](${dataUri})`;
}

/**
 * Versión asíncrona de String.replace con soporte de reemplazos async.
 */
async function replaceAsync(
  str: string,
  regex: RegExp,
  replacer: (match: string, ...args: string[]) => Promise<string>,
): Promise<string> {
  const matches: { match: string; args: string[]; index: number }[] = [];
  str.replace(regex, (match, ...args) => {
    // args puede incluir: grupos de captura, índice, string original
    // Descartamos el string original (último elemento) e índice (penúltimo)
    const groups = args.slice(0, -2) as string[];
    const index = args[args.length - 2] as number;
    matches.push({ match, args: groups, index });
    return match; // placeholder
  });

  if (matches.length === 0) return str;

  // Resolver todos los reemplazos en paralelo
  const replacements = await Promise.all(
    matches.map(({ match, args }) => replacer(match, ...args)),
  );

  // Construir el string final aplicando los reemplazos de derecha a izquierda
  let result = str;
  for (let i = matches.length - 1; i >= 0; i--) {
    const { match, index } = matches[i];
    result = result.slice(0, index) + replacements[i] + result.slice(index + match.length);
  }
  return result;
}

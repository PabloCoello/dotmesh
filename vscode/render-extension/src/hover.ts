/**
 * hover.ts — HoverProvider que combina tablas GFM y fórmulas LaTeX.
 *
 * Precedencia:
 *   1. Tabla GFM (tableAtPosition): el cursor cae dentro de un bloque de tabla.
 *      Las fórmulas de las celdas se renderizan embebidas (renderTableMarkdown).
 *   2. Fórmula suelta (formulaAtPosition): el cursor cae sobre una fórmula
 *      que NO está dentro de una tabla.
 *
 * Los módulos puros de detección (table.ts, formula.ts) no importan vscode
 * para poder testearse directamente con node:test. Esta capa traduce entre
 * los tipos de vscode y los tipos simples de esos módulos.
 */
import * as vscode from 'vscode';
import { tableAtPosition } from './table';
import { formulaAtPosition, renderLatex } from './formula';
import { renderTableMarkdown } from './table-render';

/**
 * Devuelve el color de primer plano para incrustar SVGs de fórmulas.
 *
 * Los SVGs de MathJax usan `currentColor` como fill/stroke. Al incrustarse
 * como `<img src="data:image/svg+xml;base64,...">` el SVG queda en un contexto
 * aislado y currentColor no hereda el color del editor. Se elige un color
 * estático según el tipo de tema activo:
 *   - Claro / Alto contraste claro: #333333 (gris oscuro, contraste ≥ 10:1 sobre blanco)
 *   - Oscuro / Alto contraste oscuro: #cccccc (gris claro, contraste ≥ 10:1 sobre #1e1e1e)
 *
 * Esta solución es un buen compromiso mientras VS Code no exponga el color
 * real del hover widget a las extensiones vía API pública.
 */
function _themeFgColor(): string {
  const kind = vscode.window.activeColorTheme.kind;
  return kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight
    ? '#333333'
    : '#cccccc';
}

export class MeshRenderHoverProvider implements vscode.HoverProvider {
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null> {
    // Extraer las líneas del documento como cadenas simples.
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      lines.push(document.lineAt(i).text);
    }

    // 1. Tabla GFM — tiene precedencia sobre fórmulas sueltas.
    //    Las fórmulas dentro de las celdas se renderizan embebidas.
    const table = tableAtPosition(lines, position.line, position.character);
    if (table !== null) {
      let renderedTable: string;
      try {
        renderedTable = await renderTableMarkdown(table, _themeFgColor());
      } catch {
        // Degradación: mostrar la tabla sin renderizar fórmulas antes que
        // no mostrar nada. renderLatex ya no propaga, pero cualquier otro
        // fallo de renderTableMarkdown queda cubierto aquí.
        renderedTable = table;
      }
      const md = new vscode.MarkdownString(renderedTable);
      return new vscode.Hover(md);
    }

    // 2. Fórmula suelta (inline o bloque).
    const formula = formulaAtPosition(lines, position.line, position.character);
    if (formula !== null) {
      const svg = await renderLatex(formula.latex, formula.kind === 'block');

      const md = new vscode.MarkdownString();

      if (svg.startsWith('LaTeX error:')) {
        // Error de LaTeX: mostrar el mensaje como texto
        md.appendText(svg);
      } else {
        // SVG válido: reemplazar currentColor con el color del tema activo
        // antes de codificar. En un contexto <img> el SVG es aislado y
        // currentColor no hereda el color del editor.
        const coloredSvg = svg.replace(/currentColor/g, _themeFgColor());
        const dataUri = `data:image/svg+xml;base64,${Buffer.from(coloredSvg).toString('base64')}`;
        md.appendMarkdown(`![fórmula](${dataUri})`);
      }

      return new vscode.Hover(md);
    }

    return null;
  }
}

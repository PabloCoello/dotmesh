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
      const renderedTable = await renderTableMarkdown(table);
      const md = new vscode.MarkdownString(renderedTable);
      md.isTrusted = true;
      md.supportHtml = true;
      return new vscode.Hover(md);
    }

    // 2. Fórmula suelta (inline o bloque).
    const formula = formulaAtPosition(lines, position.line, position.character);
    if (formula !== null) {
      const svg = await renderLatex(formula.latex, formula.kind === 'block');

      const md = new vscode.MarkdownString();
      md.isTrusted = true;
      md.supportHtml = true;

      if (svg.startsWith('LaTeX error:')) {
        // Error de LaTeX: mostrar el mensaje como texto
        md.appendText(svg);
      } else {
        // SVG válido: incrustar como imagen data URI
        const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
        md.appendMarkdown(`![fórmula](${dataUri})`);
      }

      return new vscode.Hover(md);
    }

    return null;
  }
}

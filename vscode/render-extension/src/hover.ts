/**
 * hover.ts — HoverProvider de tablas GFM (y, en la Fase 2, de fórmulas LaTeX).
 *
 * Este módulo es la capa de traducción entre los tipos de vscode
 * (TextDocument, Position) y las funciones puras de table.ts (y, en la
 * Fase 2, de formula.ts). Toda la lógica de detección vive en los módulos
 * puros para que pueda testearse sin VS Code.
 */
import * as vscode from 'vscode';
import { tableAtPosition } from './table';

export class MeshRenderHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.ProviderResult<vscode.Hover> {
    // Extraer las líneas del documento como cadenas simples.
    // Copiar el array en cada invocación es aceptable: el hover es bajo demanda
    // (una llamada por interacción del usuario) y los documentos Markdown
    // típicos son lo bastante pequeños para que el coste sea despreciable.
    const lines: string[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      lines.push(document.lineAt(i).text);
    }

    // Detección de tabla GFM: VS Code renderiza el markdown de la tabla de forma nativa
    const table = tableAtPosition(lines, position.line, position.character);
    if (table !== null) {
      return new vscode.Hover(new vscode.MarkdownString(table));
    }

    // Fase 2: detección de fórmulas (formula.ts) se añadirá aquí.

    return null;
  }
}

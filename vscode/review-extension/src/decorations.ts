/**
 * decorations.ts — gestión de TextEditorDecorationType y aplicación de
 * decoraciones para los comentarios de revisión anclados.
 *
 * Dos TextEditorDecorationType:
 *   (a) rangeDecorationType  — fondo del rango anclado + hover
 *   (b) labelDecorationType  — etiqueta «● tipo» o «● tipo·agente» al final de línea
 *
 * Los tipos se crean una vez en getDecorationTypes() y se reutilizan en
 * cada llamada a applyDecorations(); se liberan llamando a disposeDecorationTypes()
 * (registrado como suscripción en context.subscriptions desde activate).
 *
 * Las funciones puras de formato (buildLabelText, typeColor,
 * buildHoverMessage) viven en decorations-utils.ts para poder testearse
 * directamente con node:test sin necesidad del entorno de VS Code.
 */

import * as vscode from 'vscode';
import { resolveAnchor } from './anchor';
import type { Comment } from './sidecar';
import {
  RANGE_BG_COLOR,
  buildLabelText,
  typeColor,
  buildHoverMessage,
} from './decorations-utils';

export { buildLabelText, typeColor, buildHoverMessage } from './decorations-utils';

// ---------------------------------------------------------------------------
// Singleton de tipos de decoración
// ---------------------------------------------------------------------------

let _rangeType: vscode.TextEditorDecorationType | undefined;
let _labelType: vscode.TextEditorDecorationType | undefined;

/**
 * Devuelve los dos TextEditorDecorationType, creándolos la primera vez.
 * Los tipos se reutilizan entre llamadas a applyDecorations(); nunca se
 * crean duplicados.
 */
export function getDecorationTypes(): {
  rangeType: vscode.TextEditorDecorationType;
  labelType: vscode.TextEditorDecorationType;
} {
  if (!_rangeType) {
    _rangeType = vscode.window.createTextEditorDecorationType({
      backgroundColor: RANGE_BG_COLOR,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
  }
  if (!_labelType) {
    // Sin opciones a nivel de tipo: contentText y color se fijan
    // por instancia mediante renderOptions.after en applyDecorations().
    _labelType = vscode.window.createTextEditorDecorationType({
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
  }
  return { rangeType: _rangeType, labelType: _labelType };
}

/**
 * Libera los TextEditorDecorationType.
 * Llamar registrando `{ dispose: disposeDecorationTypes }` en
 * context.subscriptions dentro de activate().
 */
export function disposeDecorationTypes(): void {
  _rangeType?.dispose();
  _rangeType = undefined;
  _labelType?.dispose();
  _labelType = undefined;
}

// ---------------------------------------------------------------------------
// applyDecorations
// ---------------------------------------------------------------------------

/**
 * Aplica las decoraciones de revisión al editor dado.
 *
 * - Solo los comentarios con status «open» reciben decoración.
 * - Un ancla irresoluble se omite silenciosamente; no lanza.
 * - Segura ante llamadas repetidas: setDecorations reemplaza el estado
 *   anterior completo; no se acumulan tipos nuevos por llamada.
 *
 * Limitación conocida: los sidecars en el fallback global
 * (~/.local/state/mesh-review/) quedan fuera del alcance del
 * FileSystemWatcher del workspace de VS Code. Las decoraciones para
 * esos documentos se aplican al activar el editor y tras cada mutación
 * propia (Add Comment), pero no se recargan automáticamente si el sidecar
 * cambia desde fuera de VS Code.
 */
export function applyDecorations(
  editor: vscode.TextEditor,
  comments: Comment[]
): void {
  const { rangeType, labelType } = getDecorationTypes();
  const doc = editor.document;
  const text = doc.getText();

  const rangeOpts: vscode.DecorationOptions[] = [];
  const labelOpts: vscode.DecorationOptions[] = [];

  for (const comment of comments) {
    if (comment.status !== 'open') continue;

    const resolved = resolveAnchor(text, comment.anchor);
    if (!resolved) continue;

    const start = doc.positionAt(resolved.startOffset);
    const end = doc.positionAt(resolved.endOffset);
    const range = new vscode.Range(start, end);

    const hover = new vscode.MarkdownString(buildHoverMessage(comment));
    hover.isTrusted = false;

    rangeOpts.push({ range, hoverMessage: hover });

    // La etiqueta se ancla a un rango vacío al final de la línea donde
    // termina el ancla: si el rango comentado no llega al final de línea,
    // renderOptions.after insertaría «● tipo» en mitad del texto.
    const lineEnd = doc.lineAt(end.line).range.end;
    labelOpts.push({
      range: new vscode.Range(lineEnd, lineEnd),
      renderOptions: {
        after: {
          contentText: buildLabelText(comment),
          color: typeColor(comment.type),
          margin: '0 0 0 1ch',
          fontStyle: 'italic',
        },
      },
    });
  }

  editor.setDecorations(rangeType, rangeOpts);
  editor.setDecorations(labelType, labelOpts);
}

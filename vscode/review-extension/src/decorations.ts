/**
 * decorations.ts — gestión de TextEditorDecorationType y aplicación de
 * decoraciones para los comentarios de revisión anclados.
 *
 * Dos familias de TextEditorDecorationType:
 *   (a) typeStyles   — un tipo por color de comentario (getTypeStyle), keyed
 *       por hex. Aporta el fondo tintado del rango anclado (que VS Code refleja
 *       en el minimapa) y el tick de la overview ruler. El color de la ruler y
 *       del fondo es propiedad del tipo, no de la decoración individual, así que
 *       para colorear por tipo hace falta un tipo por color. El hover se adjunta
 *       por instancia a estas decoraciones.
 *   (b) labelType    — etiqueta «● tipo» o «● tipo·agente» al final de línea.
 *
 * Los tipos se crean bajo demanda (getTypeStyle / getLabelType) y se reutilizan
 * entre llamadas a applyDecorations(); se liberan llamando a
 * disposeDecorationTypes() (registrado como suscripción en context.subscriptions
 * desde activate).
 *
 * Las funciones puras de formato (buildLabelText, typeColor,
 * buildHoverMessage) viven en decorations-utils.ts para poder testearse
 * directamente con node:test sin necesidad del entorno de VS Code.
 */

import * as vscode from 'vscode';
import { resolveAnchor } from './anchor';
import type { ThreadProjection } from './sidecar';
import {
  RANGE_ALPHA,
  buildLabelText,
  typeColor,
  hexToRgba,
  buildThreadHover,
} from './decorations-utils';

export { buildLabelText, typeColor, buildHoverMessage, buildThreadHover } from './decorations-utils';

// ---------------------------------------------------------------------------
// Singleton de tipos de decoración
// ---------------------------------------------------------------------------

/**
 * Un TextEditorDecorationType por color de tipo, cacheado por hex. El color de
 * la overview ruler y el del fondo (que VS Code refleja en el minimapa) son
 * propiedades del tipo, no de la decoración individual, así que se necesita un
 * tipo por color. Se crean bajo demanda en getTypeStyle() y se reutilizan.
 */
const _typeStyles = new Map<string, vscode.TextEditorDecorationType>();
let _labelType: vscode.TextEditorDecorationType | undefined;

/**
 * Devuelve el TextEditorDecorationType del color dado, creándolo la primera vez.
 * Aporta el fondo tintado del rango (color a RANGE_ALPHA) y el tick de la
 * overview ruler (color a opacidad plena, carril central para no solaparse con
 * los marcadores de git —izquierda— ni de problemas —derecha—).
 */
function getTypeStyle(color: string): vscode.TextEditorDecorationType {
  let type = _typeStyles.get(color);
  if (!type) {
    type = vscode.window.createTextEditorDecorationType({
      backgroundColor: hexToRgba(color, RANGE_ALPHA),
      overviewRulerColor: color,
      overviewRulerLane: vscode.OverviewRulerLane.Center,
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
    _typeStyles.set(color, type);
  }
  return type;
}

/**
 * Devuelve el TextEditorDecorationType de las etiquetas «● tipo», creándolo la
 * primera vez. Sin opciones a nivel de tipo: contentText y color se fijan por
 * instancia mediante renderOptions.after en applyDecorations().
 */
function getLabelType(): vscode.TextEditorDecorationType {
  if (!_labelType) {
    _labelType = vscode.window.createTextEditorDecorationType({
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    });
  }
  return _labelType;
}

/**
 * Libera todos los TextEditorDecorationType.
 * Llamar registrando `{ dispose: disposeDecorationTypes }` en
 * context.subscriptions dentro de activate().
 */
export function disposeDecorationTypes(): void {
  for (const type of _typeStyles.values()) type.dispose();
  _typeStyles.clear();
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
  threads: ThreadProjection[]
): void {
  const doc = editor.document;
  const text = doc.getText();

  // Rangos agrupados por color de tipo: cada color tiene su TextEditorDecorationType
  // (fondo tintado + tick de ruler), así que las opciones se acumulan por color.
  const rangeOptsByColor = new Map<string, vscode.DecorationOptions[]>();
  const labelOpts: vscode.DecorationOptions[] = [];

  for (const thread of threads) {
    if (thread.status !== 'open') continue;
    if (!('line_hint' in thread.anchor)) continue;

    const resolved = resolveAnchor(text, thread.anchor);
    if (!resolved) continue;

    const start = doc.positionAt(resolved.startOffset);
    const end = doc.positionAt(resolved.endOffset);
    const range = new vscode.Range(start, end);

    const hover = new vscode.MarkdownString(buildThreadHover(thread, vscode.env.language));
    hover.isTrusted = false;   // no hay command links; no se necesita isTrusted
    hover.supportHtml = true;  // habilita <span style="color:#rrggbb;"> del sanitizador

    const color = typeColor(thread.commentType);
    let opts = rangeOptsByColor.get(color);
    if (!opts) {
      opts = [];
      rangeOptsByColor.set(color, opts);
    }
    opts.push({ range, hoverMessage: hover });

    // La etiqueta se ancla a un rango vacío al final de la línea donde
    // termina el ancla: si el rango comentado no llega al final de línea,
    // renderOptions.after insertaría «● tipo» en mitad del texto.
    const lineEnd = doc.lineAt(end.line).range.end;
    labelOpts.push({
      range: new vscode.Range(lineEnd, lineEnd),
      renderOptions: {
        after: {
          contentText: buildLabelText({ type: thread.commentType }),
          color,
          margin: '0 0 0 1ch',
          fontStyle: 'italic',
        },
      },
    });
  }

  // Asegura un tipo por cada color presente antes de aplicar.
  for (const color of rangeOptsByColor.keys()) getTypeStyle(color);
  // Aplica cada color y limpia (setDecorations con []) los colores cacheados que
  // no aparecen en esta pasada; si no, sus decoraciones anteriores persistirían.
  for (const [color, type] of _typeStyles) {
    editor.setDecorations(type, rangeOptsByColor.get(color) ?? []);
  }

  editor.setDecorations(getLabelType(), labelOpts);
}

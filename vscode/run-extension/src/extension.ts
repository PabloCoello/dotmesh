import * as vscode from 'vscode';
import { computeOutputStates } from './stale.js';

// ---------------------------------------------------------------------------
// Activate / Deactivate
// ---------------------------------------------------------------------------

/**
 * Punto de entrada de la extensión.
 *
 * Estructura deliberada para que la Tarea 5 (CodeLens + comandos) pueda
 * añadir su lógica sin reescribir esta función:
 * - Los decoration types se crean una vez y se registran en
 *   context.subscriptions para que VS Code los libere automáticamente.
 * - El cableado de cada funcionalidad va en una función separada
 *   (registerStaleDecorations, etc.) que recibe context y los recursos
 *   compartidos como parámetros.
 * - La Tarea 5 puede añadir registerCodeLens(context, decorationTypes)
 *   y registerCommands(context, kernelManager, decorationTypes) sin tocar
 *   el cuerpo de activate.
 */
export function activate(context: vscode.ExtensionContext): void {
  // Decoration types — creados una vez, reutilizados en todos los editores.
  // Se usan ThemeColor para respetar el tema activo; nunca colores hardcodeados.
  const staleDecorationType = vscode.window.createTextEditorDecorationType({
    // Borde izquierdo de advertencia
    borderWidth: '0 0 0 3px',
    borderStyle: 'solid',
    borderColor: new vscode.ThemeColor('editorWarning.foreground'),
    overviewRulerColor: new vscode.ThemeColor('editorWarning.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });

  const errorDecorationType = vscode.window.createTextEditorDecorationType({
    // Borde izquierdo de error
    borderWidth: '0 0 0 3px',
    borderStyle: 'solid',
    borderColor: new vscode.ThemeColor('editorError.foreground'),
    overviewRulerColor: new vscode.ThemeColor('editorError.foreground'),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });

  // Registrar en subscriptions garantiza dispose al desactivar la extensión
  context.subscriptions.push(staleDecorationType, errorDecorationType);

  registerStaleDecorations(context, staleDecorationType, errorDecorationType);
}

export function deactivate(): void {
  // Los recursos registrados en context.subscriptions se liberan
  // automáticamente por VS Code al desactivar; no se requiere nada aquí.
}

// ---------------------------------------------------------------------------
// Decoraciones de obsolescencia
// ---------------------------------------------------------------------------

/**
 * Registra los listeners que mantienen las decoraciones de stale/error
 * actualizadas en los editores markdown abiertos.
 *
 * Debounce de 150 ms sobre onDidChangeTextDocument para no parsear en cada
 * pulsación de tecla individual, cumpliendo el criterio de < 500 ms.
 * onDidChangeActiveTextEditor aplica inmediatamente (no hay texto en vuelo).
 */
function registerStaleDecorations(
  context: vscode.ExtensionContext,
  staleDecorationType: vscode.TextEditorDecorationType,
  errorDecorationType: vscode.TextEditorDecorationType,
): void {
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Recalcula y pinta las decoraciones en el editor dado.
   * Solo actúa en documentos markdown; limpia las decoraciones en cualquier
   * otro tipo de documento para no dejar rastros si el usuario cambia de
   * fichero dentro del mismo grupo de editor.
   */
  function applyDecorations(editor: vscode.TextEditor): void {
    const doc = editor.document;

    if (doc.languageId !== 'markdown') {
      // Limpiar por si el usuario abría antes un markdown en el mismo panel
      editor.setDecorations(staleDecorationType, []);
      editor.setDecorations(errorDecorationType, []);
      return;
    }

    const states = computeOutputStates(doc.getText());

    const staleRanges: vscode.Range[] = [];
    const errorRanges: vscode.Range[] = [];

    for (const { startOffset, endOffset, state } of states) {
      if (state === 'fresh') continue;
      const range = new vscode.Range(
        doc.positionAt(startOffset),
        doc.positionAt(endOffset),
      );
      if (state === 'stale') {
        staleRanges.push(range);
      } else {
        errorRanges.push(range);
      }
    }

    editor.setDecorations(staleDecorationType, staleRanges);
    editor.setDecorations(errorDecorationType, errorRanges);
  }

  /** Programa applyDecorations con debounce de 150 ms. */
  function scheduleDecorations(editor: vscode.TextEditor): void {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      applyDecorations(editor);
    }, 150);
  }

  // Al cambiar el editor activo: cancelar el debounce pendiente del editor
  // anterior y aplicar inmediatamente en el nuevo.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
      if (editor) {
        applyDecorations(editor);
      }
    }),
  );

  // Al modificar el documento activo: debounce para absorber pulsaciones
  // de teclas consecutivas.
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document === event.document) {
        scheduleDecorations(editor);
      }
    }),
  );

  // Liberar el timer si la extensión se desactiva mientras hay uno pendiente
  context.subscriptions.push({
    dispose: () => {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
        debounceTimer = undefined;
      }
    },
  });

  // Aplicar al editor activo en el momento de la activación de la extensión
  const initialEditor = vscode.window.activeTextEditor;
  if (initialEditor) {
    applyDecorations(initialEditor);
  }
}

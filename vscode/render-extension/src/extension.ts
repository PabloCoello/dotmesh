import * as vscode from 'vscode';
import { MeshRenderHoverProvider } from './hover';
import { gutterLines } from './gutter';

// ---------------------------------------------------------------------------
// Constantes compartidas
// ---------------------------------------------------------------------------

const SUPPORTED: vscode.DocumentSelector = [
  { language: 'markdown' },
  { language: 'plaintext' },
];

// ---------------------------------------------------------------------------
// Helpers de configuración
// ---------------------------------------------------------------------------

function getDebounceMs(): number {
  return vscode.workspace
    .getConfiguration('mesh-render')
    .get<number>('gutter.debounceMs', 300);
}

function isGutterEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('mesh-render')
    .get<boolean>('gutter.enabled', true);
}

/** True si el documento es markdown o plaintext (lenguajes soportados). */
function isSupportedDocument(doc: vscode.TextDocument): boolean {
  return doc.languageId === 'markdown' || doc.languageId === 'plaintext';
}

// ---------------------------------------------------------------------------
// Aplicación de decoraciones de gutter
// ---------------------------------------------------------------------------

/**
 * Aplica (o limpia) los iconos de gutter en el editor dado.
 *
 * - Si el gutter está desactivado o el lenguaje no es soportado, limpia las
 *   decoraciones existentes.
 * - En caso contrario, calcula las líneas renderables y las decora.
 *
 * Es segura ante llamadas repetidas: setDecorations reemplaza el estado
 * anterior completo; no se acumulan decoraciones.
 */
function applyGutterDecorations(
  editor: vscode.TextEditor,
  decorationType: vscode.TextEditorDecorationType,
): void {
  if (!isGutterEnabled() || !isSupportedDocument(editor.document)) {
    editor.setDecorations(decorationType, []);
    return;
  }

  const lines = editor.document.getText().split('\n');
  const lineNums = gutterLines(lines);
  const ranges: vscode.DecorationOptions[] = lineNums.map(n => ({
    range: new vscode.Range(n, 0, n, 0),
  }));
  editor.setDecorations(decorationType, ranges);
}

// ---------------------------------------------------------------------------
// Activación y desactivación
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  // Hover provider (tabla GFM + fórmulas LaTeX)
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(SUPPORTED, new MeshRenderHoverProvider()),
  );

  // TextEditorDecorationType propio de mesh-render — independiente del de
  // mesh-review para no colisionar con su carril de overview ruler.
  const decorationType = vscode.window.createTextEditorDecorationType({
    gutterIconPath: context.asAbsolutePath('media/mesh-render.svg'),
    gutterIconSize: 'contain',
  });
  context.subscriptions.push(decorationType);

  // Aplicar a todos los editores visibles al activar la extensión
  for (const editor of vscode.window.visibleTextEditors) {
    applyGutterDecorations(editor, decorationType);
  }

  // Timer de debounce — se limpia al desactivar la extensión vía el disposable
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  context.subscriptions.push({ dispose: () => clearTimeout(debounceTimer) });

  // Actualización tras cambios en el documento (con debounce).
  // Actualiza todos los editores visibles que muestren el documento cambiado
  // para dar soporte correcto a split panes con el mismo fichero abierto.
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        for (const editor of vscode.window.visibleTextEditors) {
          if (editor.document === event.document) {
            applyGutterDecorations(editor, decorationType);
          }
        }
      }, getDebounceMs());
    }),
  );

  // Actualización al cambiar el editor activo
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor) applyGutterDecorations(editor, decorationType);
    }),
  );

  // Actualización al cambiar los editores visibles (p. ej. split pane)
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(editors => {
      for (const editor of editors) {
        applyGutterDecorations(editor, decorationType);
      }
    }),
  );

  // Reacción al cambio de configuración de mesh-render.gutter.*
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration('mesh-render.gutter')) return;
      for (const editor of vscode.window.visibleTextEditors) {
        applyGutterDecorations(editor, decorationType);
      }
    }),
  );
}

export function deactivate(): void {
  // Los disposables registrados en context.subscriptions (incluido el
  // TextEditorDecorationType y el disposable del timer) se limpian
  // automáticamente cuando VS Code desactiva la extensión.
}

import * as vscode from 'vscode';

// SVG hardcoded para el spike de la Fase 0.
// Objetivo: comprobar que VS Code pinta data:image/svg+xml en un MarkdownString.
//
// El SVG contiene:
//   - Rectángulo verde con texto "SVG OK" en blanco (inequívoco si se pinta).
//   - Texto "mesh-render spike" con fill="currentColor" para verificar
//     que el elemento hereda el color del tema (claro/oscuro).
const SPIKE_SVG_B64 =
  'PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScyMDAnIGhlaWdodD0nOTAnIHZpZXdCb3g9JzAgMCAyMDAgOTAnPgogIDxyZWN0IHg9JzQnIHk9JzQnIHdpZHRoPScxOTInIGhlaWdodD0nODInIHJ4PScxMCcgcnk9JzEwJyBmaWxsPScjNENBRjUwJy8+CiAgPHRleHQgeD0nMTAwJyB5PSc0MicgdGV4dC1hbmNob3I9J21pZGRsZScgZm9udC1zaXplPScyNicgZm9udC1mYW1pbHk9J21vbm9zcGFjZScgZm9udC13ZWlnaHQ9J2JvbGQnIGZpbGw9J3doaXRlJz5TVkcgT0s8L3RleHQ+CiAgPHRleHQgeD0nMTAwJyB5PSc3MicgdGV4dC1hbmNob3I9J21pZGRsZScgZm9udC1zaXplPScxNCcgZm9udC1mYW1pbHk9J21vbm9zcGFjZScgZmlsbD0nY3VycmVudENvbG9yJz5tZXNoLXJlbmRlciBzcGlrZTwvdGV4dD4KPC9zdmc+';

const SPIKE_DATA_URI = `data:image/svg+xml;base64,${SPIKE_SVG_B64}`;

class SpikeHoverProvider implements vscode.HoverProvider {
  provideHover(
    _document: vscode.TextDocument,
    _position: vscode.Position,
    _token: vscode.CancellationToken,
  ): vscode.Hover {
    const md = new vscode.MarkdownString(
      `![mesh-render spike](${SPIKE_DATA_URI})`,
    );
    md.isTrusted = true;
    md.supportHtml = true;
    return new vscode.Hover(md);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = [
    { language: 'markdown' },
    { language: 'plaintext' },
  ];
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, new SpikeHoverProvider()),
  );
}

export function deactivate(): void {}

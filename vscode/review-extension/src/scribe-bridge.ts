/**
 * scribe-bridge.ts — gestión del terminal integrado de la sesión scribe.
 *
 * Importa VS Code: no es testeable con node:test. La validación es manual
 * (Fase 5 del plan). Las funciones puras que construyen prompts y comandos
 * viven en scribe-bridge-utils.ts para poder testearse de forma aislada.
 */

import * as vscode from 'vscode';

/** Nombre fijo del terminal scribe. Sin estado persistido: se busca en cada llamada. */
const SCRIBE_TERMINAL_NAME = 'scribe';

// ---------------------------------------------------------------------------
// getScribeTerminal
// ---------------------------------------------------------------------------

/**
 * Busca y devuelve el terminal llamado "scribe" entre los terminales abiertos.
 * Devuelve undefined si no existe ninguno con ese nombre.
 *
 * VS Code no expone si un terminal está vivo o cerrado hasta que el usuario lo
 * cierra: el terminal aparece en la lista hasta que se descarta. Si el usuario
 * cierra el terminal manualmente, desaparece de vscode.window.terminals y esta
 * función devuelve undefined, por lo que ensureScribeTerminal lo relanza.
 */
export function getScribeTerminal(): vscode.Terminal | undefined {
  return vscode.window.terminals.find(t => t.name === SCRIBE_TERMINAL_NAME);
}

// ---------------------------------------------------------------------------
// launchScribeTerminal
// ---------------------------------------------------------------------------

/**
 * Crea un nuevo terminal llamado "scribe" con el cwd indicado y le envía el
 * comando de lanzamiento. No comprueba si ya existe: esa responsabilidad es
 * de ensureScribeTerminal.
 *
 * @param cwd      Directorio de trabajo del terminal (normalmente el git root).
 * @param command  Comando de lanzamiento (resultado de buildLaunchCommand).
 */
export function launchScribeTerminal(cwd: string, command: string): vscode.Terminal {
  const options: vscode.TerminalOptions = { name: SCRIBE_TERMINAL_NAME };
  if (cwd) options.cwd = cwd;
  const terminal = vscode.window.createTerminal(options);
  terminal.sendText(command, true);
  return terminal;
}

// ---------------------------------------------------------------------------
// ensureScribeTerminal
// ---------------------------------------------------------------------------

/**
 * Obtiene el terminal scribe existente o crea uno nuevo.
 *
 * @returns `{ terminal, isNew: false }` si ya existía;
 *          `{ terminal, isNew: true }`  si acaba de crearse.
 *
 * El caller usa `isNew` para saber si debe esperar launchDelayMs antes de
 * enviar el primer prompt (la TUI de Claude Code necesita tiempo para arrancar).
 */
export function ensureScribeTerminal(
  cwd: string,
  command: string
): { terminal: vscode.Terminal; isNew: boolean } {
  const existing = getScribeTerminal();
  if (existing) {
    return { terminal: existing, isNew: false };
  }
  const terminal = launchScribeTerminal(cwd, command);
  return { terminal, isNew: true };
}

// ---------------------------------------------------------------------------
// sendToScribe
// ---------------------------------------------------------------------------

/**
 * Envía un texto a la sesión scribe usando sendText con addNewLine=true.
 *
 * Añadir la nueva línea final es necesario para que la TUI de Claude Code
 * interprete el mensaje como entrada completa.
 */
export function sendToScribe(terminal: vscode.Terminal, text: string): void {
  terminal.sendText(text, true);
}

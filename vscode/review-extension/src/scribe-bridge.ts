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
// Asentamiento del shell antes de lanzar
// ---------------------------------------------------------------------------
//
// Un terminal recién creado no está listo para recibir el comando de
// lanzamiento: otras extensiones inyectan comandos propios en el arranque
// (la extensión de Python teclea `source .venv/bin/activate` cuando la shell
// integration está lista, interrumpiendo con ^C el proceso en primer plano
// si claude ya arrancó). Por eso el lanzamiento espera a que la shell
// integration aparezca y a una ventana sin ejecuciones antes de teclear.
//
// La ventana de silencio no basta contra la activación de venv de Python:
// resolver el entorno puede tardar varios segundos, así que su `source …`
// llega cuando claude ya corre y cae en la TUI como primer prompt. La defensa
// principal es crear el terminal con hideFromUser: tanto ms-python.python
// como ms-python.vscode-python-envs saltan la autoactivación de terminales
// creados así (shouldSkipTerminalActivation comprueba creationOptions), y los
// callers hacen show() inmediato, con lo que el terminal se ve igual que antes.
// El asentamiento se mantiene como red para otras inyecciones de arranque.

/** Tiempo máximo de espera a que aparezca la shell integration del terminal. */
const SHELL_INTEGRATION_TIMEOUT_MS = 3000;
/** Ventana sin ejecuciones de shell para considerar el arranque asentado. */
const SHELL_QUIET_WINDOW_MS = 750;
/** Tope duro de la fase de asentamiento, pase lo que pase. */
const SHELL_SETTLE_CAP_MS = 10_000;
/** Sin shell integration no hay eventos que observar: espera fija y teclear. */
const NO_INTEGRATION_FALLBACK_MS = 2000;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Espera a que el terminal tenga shell integration activa.
 * Devuelve false si no aparece en SHELL_INTEGRATION_TIMEOUT_MS o si el
 * terminal se cierra mientras tanto.
 */
function waitForShellIntegration(terminal: vscode.Terminal): Promise<boolean> {
  if (terminal.shellIntegration) return Promise.resolve(true);
  return new Promise<boolean>(resolve => {
    const disposables: vscode.Disposable[] = [];
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      for (const d of disposables) d.dispose();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), SHELL_INTEGRATION_TIMEOUT_MS);
    disposables.push(
      vscode.window.onDidChangeTerminalShellIntegration(e => {
        if (e.terminal === terminal) finish(true);
      }),
      vscode.window.onDidCloseTerminal(t => {
        if (t === terminal) finish(false);
      })
    );
  });
}

/**
 * Espera a una ventana de SHELL_QUIET_WINDOW_MS sin ejecuciones de shell en
 * el terminal (las inyecciones de arranque de otras extensiones cuentan como
 * ejecuciones). Una ejecución que empieza pausa el reloj hasta que termina.
 * SHELL_SETTLE_CAP_MS acota la espera total.
 */
function waitForQuietShell(terminal: vscode.Terminal): Promise<void> {
  return new Promise<void>(resolve => {
    const disposables: vscode.Disposable[] = [];
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(quietTimer);
      clearTimeout(capTimer);
      for (const d of disposables) d.dispose();
      resolve();
    };
    const capTimer = setTimeout(finish, SHELL_SETTLE_CAP_MS);
    const restartQuietWindow = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(finish, SHELL_QUIET_WINDOW_MS);
    };
    disposables.push(
      vscode.window.onDidStartTerminalShellExecution(e => {
        if (e.terminal === terminal) clearTimeout(quietTimer);
      }),
      vscode.window.onDidEndTerminalShellExecution(e => {
        if (e.terminal === terminal) restartQuietWindow();
      }),
      vscode.window.onDidCloseTerminal(t => {
        if (t === terminal) finish();
      })
    );
    restartQuietWindow();
  });
}

// ---------------------------------------------------------------------------
// launchScribeTerminal
// ---------------------------------------------------------------------------

/**
 * Crea un nuevo terminal llamado "scribe" con el cwd indicado y lanza el
 * comando cuando el shell se ha asentado. No comprueba si ya existe: esa
 * responsabilidad es de ensureScribeTerminal.
 *
 * El terminal se devuelve de forma síncrona para que el caller pueda hacer
 * show() inmediatamente; `ready` se resuelve cuando el comando de lanzamiento
 * ya se ha enviado. Con shell integration el comando va por executeCommand
 * (secuenciado con el prompt); sin ella, sendText tras una espera fija.
 *
 * @param cwd      Directorio de trabajo del terminal (normalmente el git root).
 * @param command  Comando de lanzamiento (resultado de buildLaunchCommand).
 */
export function launchScribeTerminal(
  cwd: string,
  command: string
): { terminal: vscode.Terminal; ready: Promise<void> } {
  // hideFromUser excluye el terminal de la autoactivación de venv de las
  // extensiones de Python (ver nota de asentamiento). Los callers hacen
  // show() nada más crear, así que nunca queda oculto de verdad.
  const options: vscode.TerminalOptions = { name: SCRIBE_TERMINAL_NAME, hideFromUser: true };
  if (cwd) options.cwd = cwd;
  const terminal = vscode.window.createTerminal(options);
  const ready = (async () => {
    const hasIntegration = await waitForShellIntegration(terminal);
    if (hasIntegration) {
      await waitForQuietShell(terminal);
      const shellIntegration = terminal.shellIntegration;
      if (terminal.exitStatus !== undefined) return; // cerrado durante el asentamiento
      if (shellIntegration) {
        shellIntegration.executeCommand(command);
        return;
      }
    } else {
      await delay(NO_INTEGRATION_FALLBACK_MS);
    }
    if (terminal.exitStatus !== undefined) return; // sendText sobre un terminal disposed lanza
    terminal.sendText(command, true);
  })();
  return { terminal, ready };
}

// ---------------------------------------------------------------------------
// ensureScribeTerminal
// ---------------------------------------------------------------------------

/**
 * Obtiene el terminal scribe existente o crea uno nuevo.
 *
 * @returns `{ terminal, isNew: false, ready: resuelta }` si ya existía;
 *          `{ terminal, isNew: true, ready }` si acaba de crearse, con `ready`
 *          resolviéndose cuando el comando de lanzamiento se ha enviado.
 *
 * El caller espera `ready` y después, si `isNew`, launchDelayMs antes de
 * enviar el primer prompt (la TUI de Claude Code necesita tiempo para arrancar).
 */
export function ensureScribeTerminal(
  cwd: string,
  command: string
): { terminal: vscode.Terminal; isNew: boolean; ready: Promise<void> } {
  const existing = getScribeTerminal();
  if (existing) {
    return { terminal: existing, isNew: false, ready: Promise.resolve() };
  }
  const { terminal, ready } = launchScribeTerminal(cwd, command);
  return { terminal, isNew: true, ready };
}

// ---------------------------------------------------------------------------
// sendToScribe
// ---------------------------------------------------------------------------

/** Pausa entre el texto y el Enter para que la pty no los funda en un chunk. */
const SUBMIT_KEY_DELAY_MS = 200;

/**
 * Envía un texto a la sesión scribe y lo confirma con un Enter separado.
 *
 * La TUI de Claude Code trata el texto que llega junto a su salto de línea
 * (el addNewLine de sendText) como un pegado: lo inserta en el cajetín sin
 * enviarlo. Para que lo envíe, el Enter tiene que llegar como pulsación
 * independiente: texto sin salto, pausa breve (si no, la pty puede fundir
 * ambos writes en un solo chunk y volvemos al caso pegado) y `\r` aparte.
 *
 * Contrato: el caller garantiza que el lanzamiento ya ocurrió (`await ready`)
 * y que la TUI tuvo tiempo de arrancar (launchDelayMs si el terminal es nuevo).
 * sendText es la vía correcta hacia la TUI: executeCommand está pensado para
 * shells en prompt y podría interrumpir el proceso en primer plano. Si el
 * terminal se cierra entre medias, no-op (sendText sobre un disposed lanza);
 * se comprueba antes de cada write porque la pausa deja una ventana abierta.
 */
export async function sendToScribe(terminal: vscode.Terminal, text: string): Promise<void> {
  if (terminal.exitStatus !== undefined) return;
  terminal.sendText(text, false);
  await delay(SUBMIT_KEY_DELAY_MS);
  if (terminal.exitStatus !== undefined) return;
  terminal.sendText('\r', false);
}

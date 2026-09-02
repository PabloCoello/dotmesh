/**
 * scribe-bridge-utils.ts — funciones puras para construir comandos y prompts
 * de la sesión scribe.
 *
 * Sin importaciones de VS Code. Testeable con node:test.
 * La capa que gestiona el terminal vive en scribe-bridge.ts.
 *
 * Saneado: los valores interpolados pueden venir de disco (`events.jsonl`,
 * nombres de fichero del repo), que no son confiables. El texto viaja por
 * `terminal.sendText` a la TUI de Claude Code, pero si la sesión claude ha
 * muerto y el terminal "scribe" sigue vivo, ese texto se teclea sobre una
 * shell: un `$(…)` o backtick crudo se ejecutaría. Por eso las rutas van con
 * entrecomillado POSIX y el resto de campos se valida o se colapsa a una línea.
 */

import { VALID_COMMENT_TYPES } from './sidecar.ts';
import { existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Saneado común
// ---------------------------------------------------------------------------

/** Etiqueta neutra cuando el commentType del sidecar no está en la lista blanca. */
const FALLBACK_COMMENT_LABEL = 'comentario';

/** Mismo conjunto de caracteres que valida el wrapper de shell para `--style`. */
const VALID_STYLE_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * Colapsa caracteres de control (incluidos saltos de línea) a espacios.
 * Cubre C0, DEL y C1 (\x80-\x9f): los terminales VTE interpretan C1 como
 * secuencias de escape (p. ej. CSI \x9b). Mantiene el invariante "una sola
 * línea" aunque el valor venga corrupto.
 */
function toSingleLine(value: string): string {
  return value.replace(/[\x00-\x1f\x7f\x80-\x9f]+/g, ' ').trim();
}

/**
 * Entrecomillado POSIX con comillas simples (comilla interna → `'\''`).
 * Neutraliza `$(…)`, backticks y expansiones si el texto cayera en una shell
 * viva; para la TUI es solo una ruta citada, más legible con espacios.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// ---------------------------------------------------------------------------
// buildLaunchCommand
// ---------------------------------------------------------------------------

/**
 * Devuelve el comando de shell para lanzar Claude Code en la persona indicada.
 *
 * Ejemplo: buildLaunchCommand('scribe')
 *   → `claude --settings '{"outputStyle":"scribe"}'`
 *
 * Por qué --settings y no --style: `--style` no existe en la CLI de Claude Code
 * (comprobado con 2.1.251, "error: unknown option --style"); es azúcar del
 * wrapper de shell de dotmesh (`shell/.config/shell/claude-session.zsh`), que
 * lo traduce justamente a este `--settings`. El terminal integrado no garantiza
 * ese wrapper: basta un perfil de shell distinto, un contenedor o un WSL sin
 * los dotfiles para que el lanzamiento muera con "unknown option". Hablar
 * directamente el idioma de la CLI quita esa dependencia.
 *
 * El JSON va entre comillas simples POSIX porque el comando se teclea en un
 * shell: sin ellas, las llaves y las comillas dobles quedarían a merced del
 * globbing y del entrecomillado del shell.
 *
 * El caller (extension.ts) pasa siempre una constante de cadena ('scribe'),
 * nunca un valor del webview; la validación con VALID_STYLE_RE convierte un
 * mal uso futuro en error inmediato en vez de en un comando inyectable.
 */
export function buildLaunchCommand(style: string): string {
  if (!VALID_STYLE_RE.test(style)) {
    throw new TypeError(`estilo inválido para la persona: "${style}" (solo [a-zA-Z0-9._-])`);
  }
  return `claude --settings '{"outputStyle":"${style}"}'`;
}

// ---------------------------------------------------------------------------
// buildSendAllPrompt
// ---------------------------------------------------------------------------

/**
 * Construye el texto del prompt "enviar todos los hilos pendientes" para la
 * sesión scribe.
 *
 * Usa `mesh-review project --pending` porque el objetivo es que scribe procese
 * el subconjunto de hilos que esperan respuesta IA (pendientes en el sentido
 * del protocolo event-sourced: último mensaje no de IA, o thread.assigned más
 * reciente que el último mensaje IA).
 *
 * El prompt es una sola línea: la TUI de Claude Code recibe texto interactivo
 * y un salto de línea interno rompería el flujo de entrada. La ruta va
 * entrecomillada (ver cabecera del módulo).
 */
export function buildSendAllPrompt(docRelPath: string): string {
  const doc = shellQuote(toSingleLine(docRelPath));
  return `Procesa los hilos pendientes del documento ${doc}. Ejecuta: mesh-review project --pending ${doc}`;
}

// ---------------------------------------------------------------------------
// buildFocusPrompt
// ---------------------------------------------------------------------------

/**
 * Construye el texto del prompt "foco en un hilo concreto" para la sesión scribe.
 *
 * Usa `mesh-review project` sin `--pending` a propósito: un hilo abierto cuyo
 * último mensaje es de IA no aparece en el subconjunto pendiente, y el clic del
 * usuario en el botón de foco es la reactivación explícita del hilo. Filtrar con
 * --pending ocultaría ese hilo de la vista de contexto de scribe.
 *
 * Contrato de entrada: `thread_id` llega validado como UUID en el boundary del
 * webview; `lineLabel` lo genera el host ("L42" o "(desanclado)"). Aun así
 * ambos se colapsan a una línea por defensa en profundidad. `commentType`
 * viene de disco y se valida contra VALID_COMMENT_TYPES (el sidecar proyecta
 * hilos con tipos desconocidos, solo los avisa por consola).
 *
 * El prompt es una sola línea: misma razón que buildSendAllPrompt.
 */
// ---------------------------------------------------------------------------
// checkProcessAlive
// ---------------------------------------------------------------------------

/**
 * Comprueba si un proceso sigue activo enviando señal 0 (no-op).
 *
 * Semántica de retorno:
 *   - `true`      → proceso existe y tenemos permiso para señalizarlo.
 *   - `false`     → proceso no existe (ESRCH).
 *   - `undefined` → no se puede determinar: EPERM (proceso existe pero sin
 *                   permiso de señal, habitual en Windows) u otro error.
 *
 * El caller debe tratar `undefined` como "no verificable" y no enviar.
 * Esta función está separada de `scribe-bridge.ts` para ser testeable sin
 * dependencias de VS Code.
 *
 * Limitación conocida: `Terminal.processId` es el PID del proceso del
 * terminal host (generalmente la shell anfitriona). Esta función detecta si
 * la shell ha salido, pero no distingue el caso «shell viva, claude ya
 * terminó». Si claude sale pero el terminal sigue abierto, `checkProcessAlive`
 * devuelve `true` y el texto se envía igualmente a la shell. Detectar si
 * claude sigue activo requeriría leer la pantalla del terminal (como hace
 * scribe.lua vía herdr pane read), lo que no está disponible en VS Code.
 *
 * @param pid  PID del proceso a comprobar.
 */
export function checkProcessAlive(pid: number): boolean | undefined {
  // Guardia defensiva: pid debe ser un entero positivo.
  // kill(0, sig) actuaría sobre el proceso-grupo; kill(-1, sig) sobre todos los procesos.
  // process.kill con señal 0 no envía señal real, pero la guardia explícita
  // deja claro el invariante que esperamos de terminal.processId.
  if (!Number.isInteger(pid) || pid <= 0) return undefined;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    // EPERM u otro: el proceso puede existir pero no podemos señalizarlo.
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// resolveCliBundle
// ---------------------------------------------------------------------------

/**
 * Rutas donde puede estar el bundle mesh-review.mjs (en orden de preferencia).
 * Equivalente a KNOWN_PATHS de cli.lua.
 */
const BUNDLE_KNOWN_PATHS: readonly string[] = [
  path.join(os.homedir(), '.claude', 'skills', 'doc-review', 'bin', 'mesh-review.mjs'),
  path.join(os.homedir(), '.agents', 'skills', 'doc-review', 'bin', 'mesh-review.mjs'),
];

/**
 * Devuelve la ruta al bundle mesh-review.mjs, o `undefined` si no se
 * encuentra. Usa la variable de entorno MESH_REVIEW_CLI si está definida
 * y apunta a un fichero existente en disco; si no existe, cae a las rutas
 * conocidas en orden de preferencia.
 *
 * Equivalente en TypeScript a la resolución de `cli.lua:init_cli`.
 */
export function resolveCliBundle(): string | undefined {
  const envCli = process.env['MESH_REVIEW_CLI'];
  if (envCli && envCli.trim() !== '') {
    const p = envCli.trim();
    if (existsSync(p)) return p;
  }
  return BUNDLE_KNOWN_PATHS.find(p => existsSync(p));
}

export function buildFocusPrompt(
  docRelPath: string,
  thread_id: string,
  commentType: string,
  lineLabel: string
): string {
  const doc = shellQuote(toSingleLine(docRelPath));
  const tid = toSingleLine(thread_id);
  const type = VALID_COMMENT_TYPES.has(commentType) ? commentType : FALLBACK_COMMENT_LABEL;
  // lineLabel también va entrecomillado: si un valor inesperado cruzara el
  // boundary del host, un `;` dentro de los paréntesis del prompt sería un
  // separador de comandos en una shell viva.
  const line = shellQuote(toSingleLine(lineLabel));
  return `Céntrate única y exclusivamente en el hilo ${tid} (${type} en ${line}). No proceses ningún otro hilo. Para el contexto ejecuta: mesh-review project ${doc}`;
}

// ---------------------------------------------------------------------------
// createPromiseQueue
// ---------------------------------------------------------------------------

/**
 * Crea una cola de promesas genérica que serializa llamadas concurrentes.
 *
 * Cada llamada a la función devuelta espera a que la anterior termine antes
 * de ejecutar su función, aunque las llamadas lleguen simultáneamente. Un
 * rechazo en una función encolada rechaza la promesa de esa llamada, pero no
 * bloquea las siguientes: la cola sigue procesando en orden.
 *
 * Patrón: encadenamiento de promesas con cola interna que nunca rechaza
 * (tail.then/catch). La promesa con el resultado real se devuelve al caller.
 *
 * @returns función `enqueue(fn)` que añade `fn` al final de la cola y
 *          devuelve una promesa con el resultado de `fn` (puede rechazar).
 */
export function createPromiseQueue(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<void> = Promise.resolve();
  return function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = tail.then(fn);
    // tail nunca rechaza: un error en fn no bloquea llamadas posteriores.
    tail = next.then(() => {}, () => {});
    return next;
  };
}

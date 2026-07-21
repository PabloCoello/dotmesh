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

// ---------------------------------------------------------------------------
// Saneado común
// ---------------------------------------------------------------------------

/** Etiqueta neutra cuando el commentType del sidecar no está en la lista blanca. */
const FALLBACK_COMMENT_LABEL = 'comentario';

/** Mismo conjunto de caracteres que valida el wrapper zsh para `--style`. */
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
 * Ejemplo: buildLaunchCommand('scribe') → 'claude --style scribe'
 *
 * El caller (extension.ts) pasa siempre una constante de cadena ('scribe'),
 * nunca un valor del webview; la validación con VALID_STYLE_RE convierte un
 * mal uso futuro en error inmediato en vez de en un comando inyectable.
 */
export function buildLaunchCommand(style: string): string {
  if (!VALID_STYLE_RE.test(style)) {
    throw new TypeError(`estilo inválido para --style: "${style}" (solo [a-zA-Z0-9._-])`);
  }
  return `claude --style ${style}`;
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

/**
 * scribe-bridge-utils.ts — funciones puras para construir comandos y prompts
 * de la sesión scribe.
 *
 * Sin importaciones de VS Code. Testeable con node:test.
 * La capa que gestiona el terminal vive en scribe-bridge.ts.
 */

// ---------------------------------------------------------------------------
// buildLaunchCommand
// ---------------------------------------------------------------------------

/**
 * Devuelve el comando de shell para lanzar Claude Code en la persona indicada.
 *
 * Ejemplo: buildLaunchCommand('scribe') → 'claude --style scribe'
 *
 * El estilo se interpola directamente: el caller (extension.ts) pasa siempre
 * una constante de cadena ('scribe'), nunca un valor del webview.
 */
export function buildLaunchCommand(style: string): string {
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
 * y un salto de línea interno rompería el flujo de entrada.
 */
export function buildSendAllPrompt(docRelPath: string): string {
  return `Procesa los hilos pendientes del documento ${docRelPath}. Ejecuta: mesh-review project --pending ${docRelPath}`;
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
 * El prompt es una sola línea: misma razón que buildSendAllPrompt.
 */
export function buildFocusPrompt(
  docRelPath: string,
  thread_id: string,
  commentType: string,
  lineLabel: string
): string {
  return `Céntrate única y exclusivamente en el hilo ${thread_id} (${commentType} en ${lineLabel}). No proceses ningún otro hilo. Para el contexto ejecuta: mesh-review project ${docRelPath}`;
}

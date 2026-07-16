/**
 * lines.ts — utilidades puras para dividir y limpiar texto de salida del kernel.
 * Sin dependencias de VS Code; testeable con node --test.
 *
 * Convención de normalización de \r\n:
 *   Los outputs de kernels en Windows o de subprocesos con CRLF pueden producir \r\n.
 *   splitOutputLines normaliza \r\n → \n antes de dividir para que el resultado sea
 *   idéntico independientemente del terminador original.
 */

// Secuencias de escape ANSI/VT100 eliminadas por stripAnsi:
//   CSI — ESC [ <parámetros> <letra final>    e.g. \x1b[31m \x1b[1;36m \x1b[0m \x1b[m
//   OSC — ESC ] <datos> <BEL | ESC \>          e.g. títulos de ventana
//   Otros — ESC <letra/símbolo> sin corchete   e.g. \x1bM (reverse index)
const ANSI_RE =
  /\x1b(?:\[[0-9;?]*[A-Za-z~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@A-Z\\^_])/g;

/**
 * Divide texto de salida de kernel en líneas.
 *
 * - Normaliza \r\n a \n (terminadores Windows / subprocesos CRLF).
 * - Elimina el \n final: es el terminador de la última línea, no una línea extra.
 *   "hello\n" → ["hello"], no ["hello", ""].
 * - Un \n solo (print("")) representa una línea vacía → [""]).
 * - Texto vacío → [].
 */
/**
 * Elimina todas las secuencias de escape ANSI/VT100 del texto.
 * Los tracebacks de Jupyter llegan con códigos de color (ESC[31m, ESC[36m, etc.)
 * que en un bloque Markdown de texto plano se ven como basura.
 */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}

export function splitOutputLines(text: string): string[] {
  if (!text) {
    return [];
  }
  const normalized = text.replace(/\r\n/g, '\n');
  const stripped = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return stripped.split('\n');
}

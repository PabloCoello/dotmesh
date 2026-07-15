/**
 * lines.ts — utilidades puras para dividir texto de salida del kernel en líneas.
 * Sin dependencias de VS Code; testeable con node --test.
 *
 * Convención de normalización de \r\n:
 *   Los outputs de kernels en Windows o de subprocesos con CRLF pueden producir \r\n.
 *   splitOutputLines normaliza \r\n → \n antes de dividir para que el resultado sea
 *   idéntico independientemente del terminador original.
 */

/**
 * Divide texto de salida de kernel en líneas.
 *
 * - Normaliza \r\n a \n (terminadores Windows / subprocesos CRLF).
 * - Elimina el \n final: es el terminador de la última línea, no una línea extra.
 *   "hello\n" → ["hello"], no ["hello", ""].
 * - Un \n solo (print("")) representa una línea vacía → [""]).
 * - Texto vacío → [].
 */
export function splitOutputLines(text: string): string[] {
  if (!text) {
    return [];
  }
  const normalized = text.replace(/\r\n/g, '\n');
  const stripped = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return stripped.split('\n');
}

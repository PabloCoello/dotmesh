/**
 * diff-utils.ts — utilidades puras para la gestión de pestañas de diff.
 *
 * Sin importaciones de VS Code: testeable con node:test.
 */
import path from 'node:path';

/**
 * Construye el título compacto de una pestaña de diff de mesh-review.
 *
 * Formato: `basename · commentType · sha7`
 *
 * @param docRelPath - Ruta relativa del documento revisado (p. ej. `docs/informe.md`).
 * @param commentType - Tipo de comentario del hilo (p. ej. `'edita'`, `'nota'`).
 * @param sha - SHA completo o parcial del commit del fix (se trunca a 7 caracteres).
 * @returns Título compacto.
 *
 * @example
 * buildDiffTitle('docs/informe.md', 'edita', 'abc1234def')
 * // → 'informe.md · edita · abc1234'
 */
export function buildDiffTitle(
  docRelPath: string,
  commentType: string,
  sha: string
): string {
  return `${path.basename(docRelPath)} · ${commentType} · ${sha.slice(0, 7)}`;
}

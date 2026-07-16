/**
 * diff-utils.ts — utilidades puras para la gestión de pestañas de diff.
 *
 * Sin importaciones de VS Code: testeable con node:test.
 */
import path from 'node:path';

/**
 * Regex que reconoce etiquetas de pestaña generadas por buildDiffTitle.
 *
 * Patrón: '<basename> · <commentType> · <sha7>'
 * - El separador ' · ' contiene U+00B7 (MIDDLE DOT) flanqueado por espacios.
 * - El sha final tiene exactamente 7 dígitos hexadecimales en minúscula.
 *
 * Ni el basename ni el commentType contienen ' · ', así que los dos separadores
 * dividen el título en exactamente tres partes.
 */
const MESH_DIFF_LABEL_RE = /^.+? · .+? · [0-9a-f]{7}$/;

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

/**
 * Devuelve `true` si la etiqueta de una pestaña de diff fue generada por
 * `buildDiffTitle`, es decir, sigue el patrón `basename · commentType · sha7`.
 *
 * Uso: discrimina pestañas de diff de mesh-review frente a diffs del SCM de
 * VS Code (cuyas URIs usan igualmente el esquema `git:`).
 *
 * @param label - Etiqueta de la pestaña (`vscode.Tab.label`).
 */
export function isMeshReviewDiffTabLabel(label: string): boolean {
  return MESH_DIFF_LABEL_RE.test(label);
}

// hash.ts — normalización y hash SHA-256 del código de un chunk.
// Función pura. Sin importaciones de VS Code.

import { createHash } from 'node:crypto';

/**
 * Devuelve los primeros 8 caracteres hex (minúsculas) del SHA-256 del código
 * normalizado.
 *
 * Normalización:
 * 1. Divide por \n.
 * 2. Elimina espacios, tabulaciones y \r finales de cada línea.
 * 3. Une con \n sin \n final.
 * 4. SHA-256 UTF-8.
 *
 * El paso 2 incluye \r para que \r\n y \n produzcan el mismo hash.
 */
export function chunkHash(code: string): string {
  const normalized = code
    .split('\n')
    .map(line => line.replace(/[ \t\r]+$/, ''))
    .join('\n');

  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 8);
}

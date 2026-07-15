// stale.ts — lógica pura de decisión de estado de bloques de salida.
// Sin importaciones de VS Code ni de Node.
// Importa solo módulos puros del propio paquete.

import { parseChunks, parseOutputs } from './parser.ts';
import { chunkHash } from './hash.ts';

export type OutputState = 'stale' | 'error' | 'fresh';

export interface OutputStateResult {
  chunkId: string;
  startOffset: number;
  endOffset: number;
  state: OutputState;
}

/**
 * Prefijo que identifica un bloque de salida que contiene un error de ejecución.
 * Debe coincidir con lo que la Tarea 5 escribe en runChunk cuando
 * ExecutionResult.error no es null.
 */
const ERROR_PREFIX = '# Error\n';

/**
 * Compara el hash actual del código de cada chunk con el hash almacenado en
 * su bloque de salida y decide el estado de cada bloque.
 *
 * Reglas de precedencia (en orden de prioridad):
 *
 * 1. 'error'  — el contenido del bloque empieza por '# Error\n'.
 *    Se aplica incluso si el hash coincide (el código no ha cambiado desde
 *    que falló; la salida sigue siendo un error). Se aplica también si el
 *    hash difiere (el código fue editado tras el error). En ambos casos el
 *    estado más accionable para el usuario es saber que hay un error.
 *
 * 2. 'stale'  — el hash almacenado difiere del hash del código actual, O
 *    el output no tiene chunk correspondiente (output huérfano: el chunk
 *    que lo generó ya no existe en el documento y no se puede verificar
 *    si el output sigue siendo válido).
 *
 * 3. 'fresh'  — el hash coincide y el bloque no tiene prefijo de error.
 */
export function computeOutputStates(text: string): OutputStateResult[] {
  const chunks = parseChunks(text);
  const outputs = parseOutputs(text);

  // Índice chunkId → hash actual del código fuente del chunk
  const chunkHashMap = new Map<string, string>();
  for (const chunk of chunks) {
    chunkHashMap.set(chunk.id, chunkHash(chunk.code));
  }

  const results: OutputStateResult[] = [];

  for (const output of outputs) {
    let state: OutputState;

    if (output.content.startsWith(ERROR_PREFIX)) {
      // Regla 1: el prefijo de error tiene precedencia sobre hash stale
      state = 'error';
    } else {
      const currentHash = chunkHashMap.get(output.chunkId);
      if (currentHash === undefined) {
        // Output huérfano: el chunk ya no existe en el documento
        state = 'stale';
      } else if (currentHash !== output.hash) {
        state = 'stale';
      } else {
        state = 'fresh';
      }
    }

    results.push({
      chunkId: output.chunkId,
      startOffset: output.startOffset,
      endOffset: output.endOffset,
      state,
    });
  }

  return results;
}

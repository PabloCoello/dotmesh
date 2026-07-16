// stale.ts — lógica pura de decisión de estado de bloques de salida.
// Sin importaciones de VS Code ni de Node.
// Importa solo módulos puros del propio paquete.

import { parseChunks, parseOutputs } from './parser.ts';
import { chunkHash } from './hash.ts';

export type OutputState = 'fresh' | 'warn' | 'error' | 'stale';

export interface OutputStateResult {
  chunkId: string;
  startOffset: number;
  endOffset: number;
  state: OutputState;
}

/**
 * Prefijo que identifica un bloque de salida que contiene un error de ejecución.
 * Debe coincidir con lo que extension.ts escribe en runChunk cuando
 * ExecutionResult.error no es null.
 */
const ERROR_PREFIX = '# Error\n';

/**
 * Calcula el estado de cada bloque de salida en el documento.
 *
 * Precedencia (mayor a menor): stale > error > warn > fresh.
 *
 * Un output es 'stale' si cumple cualquiera de (se evalúan en orden,
 * el primero que se cumple gana):
 *   1. Su chunkId aparece en más de un chunk (id duplicado).
 *   2. No hay chunk con ese chunkId (output huérfano).
 *   3. El hash del código actual del chunk difiere del hash almacenado.
 *   4. output.up es undefined (output escrito antes de llevar seguimiento upstream).
 *   5. output.up !== upstreamHash(chunkPos): código aguas arriba modificado,
 *      chunk nuevo insertado o chunk eliminado.
 *   6. output.seq es undefined (output escrito antes de llevar numeración).
 *   7. Algún output de chunk con índice < chunkPos tiene seq > output.seq:
 *      un chunk aguas arriba fue re-ejecutado después de este output.
 *
 * Si no es 'stale':
 *   8. 'error'  si el contenido empieza por '# Error\n'.
 *   9. 'warn'   si output.warn === true.
 *   10. 'fresh' en cualquier otro caso.
 */
export function computeOutputStates(text: string): OutputStateResult[] {
  const chunks = parseChunks(text);
  const outputs = parseOutputs(text);

  // Detectar chunkIds duplicados entre chunks. Un id que aparece en dos o
  // más bloques de código crea un emparejamiento ambiguo.
  const seenChunkIds = new Set<string>();
  const duplicateChunkIds = new Set<string>();
  for (const chunk of chunks) {
    if (seenChunkIds.has(chunk.id)) {
      duplicateChunkIds.add(chunk.id);
    } else {
      seenChunkIds.add(chunk.id);
    }
  }

  // chunkId → hash actual del código (solo ids únicos)
  const chunkHashMap = new Map<string, string>();
  for (const chunk of chunks) {
    if (!duplicateChunkIds.has(chunk.id)) {
      chunkHashMap.set(chunk.id, chunkHash(chunk.code));
    }
  }

  // chunkId → posición (índice base 0) en la lista de chunks (solo ids únicos)
  const chunkPosMap = new Map<string, number>();
  for (let i = 0; i < chunks.length; i++) {
    if (!duplicateChunkIds.has(chunks[i].id)) {
      chunkPosMap.set(chunks[i].id, i);
    }
  }

  // Hash upstream por posición:
  //   upstreamHashes[i] = chunkHash de la concatenación con '\n' de los
  //   chunkHash(code) de los i predecesores (chunks.slice(0, i)).
  //   Para i=0 (sin predecesores): join da '', chunkHash('') = 'e3b0c442'.
  const upstreamHashes: string[] = chunks.map((_, i) =>
    chunkHash(chunks.slice(0, i).map(c => chunkHash(c.code)).join('\n'))
  );

  // (chunkPos, seq) de todos los outputs con seq definido y chunkId no duplicado,
  // necesario para la condición 7 (re-ejecución de chunk aguas arriba).
  const outputPositionSeqs: Array<{ pos: number; seq: number }> = [];
  for (const o of outputs) {
    if (!duplicateChunkIds.has(o.chunkId) && o.seq !== undefined) {
      const pos = chunkPosMap.get(o.chunkId);
      if (pos !== undefined) {
        outputPositionSeqs.push({ pos, seq: o.seq });
      }
    }
  }

  const results: OutputStateResult[] = [];

  for (const output of outputs) {
    let state: OutputState;

    // Regla 1: id de chunk duplicado → emparejamiento ambiguo
    if (duplicateChunkIds.has(output.chunkId)) {
      state = 'stale';
    // Regla 2: chunk no existe en el documento (output huérfano)
    } else if (!chunkHashMap.has(output.chunkId)) {
      state = 'stale';
    // Regla 3: hash del código actual distinto al almacenado en la valla
    } else if (chunkHashMap.get(output.chunkId) !== output.hash) {
      state = 'stale';
    // Regla 4: up ausente (output sin seguimiento upstream)
    } else if (output.up === undefined) {
      state = 'stale';
    // Regla 5: up no coincide con el hash upstream real del chunk
    } else if (output.up !== upstreamHashes[chunkPosMap.get(output.chunkId)!]) {
      state = 'stale';
    // Regla 6: seq ausente (output sin numeración de ejecución)
    } else if (output.seq === undefined) {
      state = 'stale';
    // Regla 7: algún chunk aguas arriba fue re-ejecutado después de este output
    } else if (outputPositionSeqs.some(
      item => item.pos < chunkPosMap.get(output.chunkId)! && item.seq > output.seq!
    )) {
      state = 'stale';
    // Regla 8: prefijo de error de ejecución
    } else if (output.content.startsWith(ERROR_PREFIX)) {
      state = 'error';
    // Regla 9: la ejecución emitió stderr sin excepción
    } else if (output.warn === true) {
      state = 'warn';
    // Regla 10: output actualizado y sin anomalías
    } else {
      state = 'fresh';
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

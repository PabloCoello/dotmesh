/**
 * emit.ts — subcomando `emit` del CLI mesh-review.
 *
 * Genera un evento V2, lo valida con los mismos predicados que readEvents
 * (version 2, id/thread_id UUID, body string si presente) y lo escribe
 * atómicamente (tmp+rename) en el directorio de eventos del documento.
 *
 * Sin dependencias de `vscode`. Reutiliza `getGitRoot`, `isUuid`,
 * `utcTimestampMs` de sidecar.ts.
 *
 * Salida: el UUID del evento escrito en stdout.
 * En caso de error de validación: mensaje en stderr + exit 1.
 */

import { getGitRoot, isUuid, utcTimestampMs, type EventEnvelope } from '../../sidecar.ts';

// ---------------------------------------------------------------------------
// Interno: guarda de path traversal idéntica a sidecar.ts/writeEvent
// ---------------------------------------------------------------------------
import * as path from 'node:path';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export async function runEmit(argv: string[]): Promise<void> {
  const [docArg, typeArg, ...pairs] = argv;

  if (!docArg || !typeArg) {
    process.stderr.write('Uso: mesh-review emit <doc> <tipo> [clave=valor...]\n');
    process.exit(1);
  }

  const docAbs = path.resolve(docArg);
  const gitRoot = await getGitRoot(path.dirname(docAbs));
  if (!gitRoot) {
    process.stderr.write('mesh-review: el documento no está dentro de un repositorio git\n');
    process.exit(1);
  }

  const docRelPath = path.relative(gitRoot, docAbs);
  if (docRelPath.startsWith('..')) {
    process.stderr.write('mesh-review: el documento no está dentro del git root\n');
    process.exit(1);
  }
  const eventDir = path.join(gitRoot, '.ai', 'review', docRelPath);

  const id = randomUUID();
  const created_at = utcTimestampMs();
  let kvData: Record<string, unknown>;
  try {
    kvData = parseKvPairs(pairs);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
  }

  // El id, version y created_at siempre vienen del CLI; el resto del k=v puede sobreescribir
  // otros campos (excepto id/version/created_at que son siempre autoritativos del CLI).
  const event: Record<string, unknown> = {
    dirty: false,
    ...kvData,
    id,
    version: 2,
    type: typeArg,
    created_at,
  };

  // Validación con los mismos predicados que readEvents
  if (!isUuid(event.id as string)) {
    process.stderr.write(`mesh-review emit: id no es UUID válido: ${event.id}\n`);
    process.exit(1);
  }
  if ('thread_id' in event) {
    if (typeof event.thread_id !== 'string' || !isUuid(event.thread_id)) {
      process.stderr.write(`mesh-review emit: thread_id no es UUID válido: ${event.thread_id}\n`);
      process.exit(1);
    }
  }
  if ('body' in event && typeof event.body !== 'string') {
    process.stderr.write(`mesh-review emit: body debe ser una cadena de texto\n`);
    process.exit(1);
  }

  await emitEvent(eventDir, event as unknown as EventEnvelope);
  process.stdout.write(`${id}\n`);
}

/**
 * Escribe un evento en el directorio dado de forma atómica (tmp+rename).
 *
 * Guarda de path traversal: el id se usa como nombre de fichero (`<id>.json`).
 * Se rechaza cualquier id que no sea UUID v4 para impedir que un id malicioso
 * (p. ej. `../../.ssh/evil`) escape del directorio de eventos — mismo patrón
 * que `writeEvent` en sidecar.ts.
 *
 * El fichero temporal lleva extensión `.json.tmp` para que readEvents
 * (que filtra por `.endsWith('.json')`) no lo procese a medias.
 */
export async function emitEvent(eventDir: string, event: EventEnvelope): Promise<void> {
  if (!isUuid(event.id)) {
    throw new Error(`mesh-review: id de evento inválido (no es UUID): ${event.id}`);
  }
  await mkdir(eventDir, { recursive: true });
  const final = path.join(eventDir, `${event.id}.json`);
  const tmp = `${final}.tmp`;
  await writeFile(tmp, JSON.stringify(event, null, 2) + '\n', 'utf8');
  await rename(tmp, final);
}

/**
 * Keys whose values must be coerced to a non-negative integer.
 * Derived directly from the two numeric fields in schema.json ($defs/anchor).
 * Any other key is never coerced to a number regardless of value shape.
 */
const NUMERIC_KV_PATHS = new Set(['anchor.line_hint', 'anchor.char_offset']);

/**
 * Convierte pares `clave=valor` en un objeto anidado.
 *
 * Tipos de valor reconocidos:
 *   - "null"        → null    (cualquier clave)
 *   - "true"        → true    (cualquier clave)
 *   - "false"       → false   (cualquier clave)
 *   - entero ≥ 0    → number  (solo anchor.line_hint y anchor.char_offset)
 *   - resto         → string
 *
 * Las dos claves numéricas del esquema (anchor.line_hint, anchor.char_offset)
 * solo aceptan enteros no negativos. Cualquier otro valor (float, negativo,
 * notación científica, cadena vacía) lanza un Error — el llamante debe
 * traducirlo a stderr + exit 1. Nunca se coerciona ninguna otra clave a número,
 * aunque su valor tenga forma de dígitos.
 *
 * Notación de punto para objetos anidados:
 *   author.kind=ai  →  { author: { kind: "ai" } }
 */
export function parseKvPairs(pairs: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const key = pair.slice(0, idx);
    const rawValue = pair.slice(idx + 1);

    let value: unknown;
    if (rawValue === 'null') {
      value = null;
    } else if (rawValue === 'true') {
      value = true;
    } else if (rawValue === 'false') {
      value = false;
    } else if (NUMERIC_KV_PATHS.has(key)) {
      // Numeric keys must be non-negative integers. Reject floats, negatives,
      // scientific notation, and empty strings with a hard error.
      if (!/^\d+$/.test(rawValue)) {
        throw new Error(
          `mesh-review emit: ${key} debe ser un entero no negativo, pero se recibió: "${rawValue}"`
        );
      }
      value = parseInt(rawValue, 10);
    } else {
      value = rawValue;
    }

    // Soporte de notación de punto: author.kind=ai → { author: { kind: "ai" } }
    const parts = key.split('.');
    let obj: Record<string, unknown> = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof obj[part] !== 'object' || obj[part] === null) {
        obj[part] = {};
      }
      obj = obj[part] as Record<string, unknown>;
    }
    obj[parts[parts.length - 1]] = value;
  }
  return result;
}

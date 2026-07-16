// parser.ts — parseo de chunks y bloques de salida en documentos Markdown.
// Funciones puras. Sin importaciones de VS Code ni de Node.

export interface ParsedChunk {
  id: string;
  language: string;
  code: string;
  truncate?: number;
  /** Offset del primer backtick de la valla de apertura en el texto. */
  startOffset: number;
  /**
   * Offset del \n que sigue a la línea de cierre de la valla. Si la línea
   * de cierre es la última del fichero (sin \n final), coincide con
   * text.length.
   *
   * Invariante: text[endOffset] === '\n' || endOffset === text.length
   */
  endOffset: number;
}

export interface ParsedOutput {
  chunkId: string;
  hash: string;
  content: string;
  startOffset: number;
  endOffset: number;
  warn?: boolean;   // true si la valla contiene warn=1
  seq?: number;     // valor de seq=N en la valla
  up?: string;      // valor de up=H en la valla
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

interface RawBlock {
  infoString: string;
  contentLines: string[];
  startOffset: number;
  endOffset: number;
}

/**
 * Extrae todos los bloques delimitados por vallas de backticks.
 *
 * Reglas (CommonMark §4.5):
 * - Apertura: hasta 3 espacios de sangría, luego 3 o más backticks, luego
 *   el info string en la misma línea.
 * - Cierre: hasta 3 espacios de sangría, luego ≥ backticks que la apertura,
 *   solo espacios en blanco después.
 * - Bloques sin cierre antes del fin del fichero se descartan.
 * - Solo se reconocen vallas de backticks (no tildes).
 */
function extractFencedBlocks(text: string): RawBlock[] {
  const blocks: RawBlock[] = [];
  const lines = text.split('\n');

  const RE_OPEN = /^( {0,3})(```+)(.*)$/;
  const RE_CLOSE = /^( {0,3})(```+)\s*$/;

  let offset = 0;
  let inFence = false;
  let openFenceLen = 0;
  let blockStart = 0;
  let blockInfo = '';
  let contentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!inFence) {
      const m = line.match(RE_OPEN);
      if (m) {
        inFence = true;
        openFenceLen = m[2].length;
        blockStart = offset + m[1].length; // primer backtick
        blockInfo = m[3].trim();
        contentLines = [];
      }
    } else {
      const m = line.match(RE_CLOSE);
      if (m && m[2].length >= openFenceLen) {
        blocks.push({
          infoString: blockInfo,
          contentLines,
          startOffset: blockStart,
          endOffset: offset + line.length,
        });
        inFence = false;
        openFenceLen = 0;
      } else {
        contentLines.push(line);
      }
    }

    offset += line.length + 1; // +1 por el \n implícito entre líneas
  }

  // Bloque sin cerrar al EOF → descartado
  return blocks;
}

/**
 * Extrae el id y los atributos clave=valor del bloque {#id key=val …}.
 * Devuelve null si no hay bloque de atributos.
 */
function parseAttrBlock(
  infoString: string
): { id: string; attrs: Map<string, string> } | null {
  const m = infoString.match(/\{#([^\s}]+)([^}]*)\}/);
  if (!m) return null;

  const id = m[1];
  const attrs = new Map<string, string>();
  for (const kv of m[2].matchAll(/(\w+)=(\S+)/g)) {
    attrs.set(kv[1], kv[2]);
  }
  return { id, attrs };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function parseChunks(text: string): ParsedChunk[] {
  const results: ParsedChunk[] = [];

  for (const block of extractFencedBlocks(text)) {
    const { infoString, contentLines, startOffset, endOffset } = block;

    // La primera palabra del info string es el lenguaje
    const firstSpace = infoString.indexOf(' ');
    if (firstSpace === -1) continue; // sin bloque de atributos

    const language = infoString.slice(0, firstSpace);
    if (language === 'output') continue; // bloques de salida no son chunks

    const parsed = parseAttrBlock(infoString);
    if (!parsed) continue; // sin {#id}

    const { id, attrs } = parsed;
    const truncateStr = attrs.get('truncate');
    const truncate =
      truncateStr !== undefined ? parseInt(truncateStr, 10) : undefined;

    const chunk: ParsedChunk = {
      id,
      language,
      code: contentLines.join('\n'),
      startOffset,
      endOffset,
    };
    if (truncate !== undefined) chunk.truncate = truncate;

    results.push(chunk);
  }

  return results;
}

export function parseOutputs(text: string): ParsedOutput[] {
  const results: ParsedOutput[] = [];

  for (const block of extractFencedBlocks(text)) {
    const { infoString, contentLines, startOffset, endOffset } = block;

    const firstSpace = infoString.indexOf(' ');
    if (firstSpace === -1) continue;

    const language = infoString.slice(0, firstSpace);
    if (language !== 'output') continue;

    const parsed = parseAttrBlock(infoString);
    if (!parsed) continue;

    const { id: chunkId, attrs } = parsed;
    const hash = attrs.get('hash');
    if (!hash) continue;

    const warn = attrs.get('warn') === '1' ? true : undefined;
    const seqStr = attrs.get('seq');
    const seq = seqStr !== undefined ? parseInt(seqStr, 10) : undefined;
    const up = attrs.get('up');

    const output: ParsedOutput = {
      chunkId,
      hash,
      content: contentLines.join('\n'),
      startOffset,
      endOffset,
    };
    if (warn !== undefined) output.warn = warn;
    if (seq !== undefined) output.seq = seq;
    if (up !== undefined) output.up = up;
    results.push(output);
  }

  return results;
}

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeAdornments, type AdornResult } from './adorn.ts';
import { parseChunks, parseOutputs } from './parser.ts';
import type { OutputStateResult } from './stale.ts';
import { buildOutputBlock } from './writer.ts';

// Espacio de no separación (U+00A0) — adorn.ts lo usa en lugar del espacio
// normal porque VS Code colapsa los espacios normales en el render del `before`.
const NBSP = ' ';
const ARROW = '╰─▶' + NBSP;     // texto de la primera línea de contenido
const CONT4 = NBSP.repeat(4);    // texto de las líneas de continuación

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeChunk(id: string, code: string, indent = ''): string {
  return `${indent}\`\`\`python {#${id}}\n${code}\n${indent}\`\`\``;
}

function makeOutput(id: string, hash: string, content: string): string {
  return `\`\`\`output {#${id} hash=${hash}}\n${content}\n\`\`\``;
}

/** Construye OutputStateResult[] a partir del texto ya parseado. */
function statesFor(
  text: string,
  stateMap: Record<string, 'fresh' | 'warn' | 'error' | 'stale'>
): OutputStateResult[] {
  return parseOutputs(text).map(o => ({
    chunkId: o.chunkId,
    startOffset: o.startOffset,
    endOffset: o.endOffset,
    state: stateMap[o.chunkId] ?? 'fresh',
  }));
}

// ---------------------------------------------------------------------------
// Documento vacío
// ---------------------------------------------------------------------------

test('computeAdornments: documento vacío → { conceal: [], before: [] }', () => {
  const result = computeAdornments('', [], [], [], -1);
  assert.deepStrictEqual(result, { conceal: [], before: [] });
});

// ---------------------------------------------------------------------------
// Chunk sin output — cursor fuera
// ---------------------------------------------------------------------------

test('computeAdornments: chunk sin output, cursor fuera → 2 conceal, 0 before', () => {
  const text = makeChunk('a', 'code');
  const chunks = parseChunks(text);
  const outputs = parseOutputs(text);

  const result = computeAdornments(text, chunks, outputs, [], -1);

  assert.strictEqual(result.conceal.length, 2, 'deben haber 2 rangos conceal (las dos vallas)');
  assert.strictEqual(result.before.length, 0, 'no debe haber befores sin output');

  // Valla de apertura
  const [openConceal, closeConceal] = result.conceal;
  const chunk = chunks[0];
  assert.strictEqual(openConceal.startOffset, chunk.startOffset);
  // endOffset excluye el \n
  assert.strictEqual(text[openConceal.endOffset], '\n');

  // Valla de cierre: endOffset = chunk.endOffset (el \n tras el cierre)
  assert.strictEqual(closeConceal.endOffset, chunk.endOffset);
  assert.ok(
    closeConceal.startOffset < closeConceal.endOffset,
    'la valla de cierre tiene anchura positiva'
  );
});

// ---------------------------------------------------------------------------
// Chunk sin output — cursor dentro
// ---------------------------------------------------------------------------

test('computeAdornments: chunk sin output, cursor dentro → 0 conceal, 0 before', () => {
  const text = makeChunk('a', 'code');
  const chunks = parseChunks(text);
  const cursorOffset = chunks[0].startOffset + 1; // dentro del chunk

  const result = computeAdornments(text, chunks, [], [], cursorOffset);

  assert.strictEqual(result.conceal.length, 0);
  assert.strictEqual(result.before.length, 0);
});

// ---------------------------------------------------------------------------
// Chunk con output — cursor fuera de ambos
// ---------------------------------------------------------------------------

test('computeAdornments: chunk con output, cursor fuera → 4 conceal + before completos', () => {
  // Documento con línea en blanco entre chunk y output
  const text = [
    makeChunk('a', 'code'),
    '',
    makeOutput('a', '12345678', 'result'),
  ].join('\n');

  const chunks = parseChunks(text);
  const outputs = parseOutputs(text);
  const states = statesFor(text, { a: 'fresh' });

  const result = computeAdornments(text, chunks, outputs, states, -1);

  // 4 conceal: 2 vallas del chunk + 2 vallas del output
  assert.strictEqual(result.conceal.length, 4, `esperados 4 conceal, obtenidos ${result.conceal.length}`);

  // Comprobar que los rangos conceal apuntan a las vallas correctas
  const chunk = chunks[0];
  const output = outputs[0];

  // Valla apertura chunk
  assert.strictEqual(result.conceal[0].startOffset, chunk.startOffset);
  // Valla cierre chunk
  assert.strictEqual(result.conceal[1].endOffset, chunk.endOffset);
  // Valla apertura output
  assert.strictEqual(result.conceal[2].startOffset, output.startOffset);
  // Valla cierre output
  assert.strictEqual(result.conceal[3].endOffset, output.endOffset);

  // Ningún endOffset incluye su \n
  for (const c of result.conceal) {
    const ch = text[c.endOffset];
    assert.ok(
      ch === '\n' || c.endOffset === text.length,
      `endOffset ${c.endOffset} debe apuntar al \\n o al EOF, encontrado: ${JSON.stringify(ch)}`
    );
  }

  // Before: barra horizontal + línea en blanco + apertura output + primera línea contenido
  assert.strictEqual(result.before.length, 4, `esperados 4 before, obtenidos ${result.before.length}`);

  const [barBefore, blankBefore, openBefore, contentBefore] = result.before;

  // Barra horizontal en la línea de cierre del chunk: codo ╭ + guiones ─
  assert.strictEqual(barBefore.lineEndOffset, chunk.endOffset, 'barra: lineEndOffset = chunk.endOffset');
  assert.ok(barBefore.contentText.startsWith('╭'), 'contentText de barra empieza por ╭');
  assert.ok(
    barBefore.contentText.slice(1).split('').every(c => c === '─'),
    'el resto de la barra solo contiene ─'
  );
  assert.strictEqual(barBefore.state, 'fresh');

  // Línea en blanco → '│'
  assert.strictEqual(blankBefore.contentText, '│');
  assert.strictEqual(blankBefore.state, 'fresh');

  // Apertura del output → '│'
  assert.strictEqual(openBefore.lineStartOffset, output.startOffset);
  assert.strictEqual(openBefore.contentText, '│');
  assert.strictEqual(openBefore.state, 'fresh');

  // Primera línea de contenido → '╰─▶ '
  assert.strictEqual(contentBefore.contentText, '╰─▶ ');
  assert.strictEqual(contentBefore.state, 'fresh');
});

// ---------------------------------------------------------------------------
// Chunk con output — cursor dentro del chunk
// ---------------------------------------------------------------------------

test('computeAdornments: cursor dentro del chunk → vallas del chunk no en conceal, barra desaparece', () => {
  const text = [
    makeChunk('a', 'code'),
    '',
    makeOutput('a', '12345678', 'result'),
  ].join('\n');

  const chunks = parseChunks(text);
  const outputs = parseOutputs(text);
  const states = statesFor(text, { a: 'fresh' });
  const chunk = chunks[0];

  // Cursor en la primera línea de código
  const cursorOffset = chunk.startOffset + 1;

  const result = computeAdornments(text, chunks, outputs, states, cursorOffset);

  // Solo las 2 vallas del output en conceal (las del chunk NO están)
  assert.strictEqual(result.conceal.length, 2);
  for (const c of result.conceal) {
    assert.ok(
      c.startOffset >= outputs[0].startOffset,
      `conceal.startOffset ${c.startOffset} debería ser del output (>= ${outputs[0].startOffset})`
    );
  }

  // Sin barra horizontal (cursor en chunk): solo línea en blanco, apertura, contenido.
  // Las barras ahora empiezan por '╭'; buscar por ese carácter para no pasar vacuosamente.
  const barBefore = result.before.find(b => b.contentText.startsWith('╭'));
  assert.strictEqual(barBefore, undefined, 'la barra horizontal no debe aparecer con cursor en chunk');

  // Los adornos del output permanecen
  const hasBlank = result.before.some(b => b.contentText === '│' && b.lineStartOffset < outputs[0].startOffset);
  const hasOpen = result.before.some(b => b.contentText === '│' && b.lineStartOffset === outputs[0].startOffset);
  const hasArrow = result.before.some(b => b.contentText === '╰─▶ ');
  assert.ok(hasBlank, 'debe haber │ en la línea en blanco');
  assert.ok(hasOpen, 'debe haber │ en la apertura del output');
  assert.ok(hasArrow, 'debe haber ╰─▶  en la primera línea de contenido');
});

// ---------------------------------------------------------------------------
// Chunk con output — cursor dentro del output
// ---------------------------------------------------------------------------

test('computeAdornments: cursor dentro del output → vallas del output no en conceal, no befores de output', () => {
  const text = [
    makeChunk('a', 'code'),
    '',
    makeOutput('a', '12345678', 'result'),
  ].join('\n');

  const chunks = parseChunks(text);
  const outputs = parseOutputs(text);
  const states = statesFor(text, { a: 'fresh' });
  const output = outputs[0];

  // Cursor en la línea de contenido del output
  const cursorOffset = output.startOffset + output.startOffset + 5;
  // Más simple: localizar el offset de 'result' en el texto
  const resultOffset = text.indexOf('result');
  assert.ok(resultOffset !== -1);

  const result = computeAdornments(text, chunks, outputs, states, resultOffset);

  // Solo las 2 vallas del chunk en conceal (las del output NO están)
  assert.strictEqual(result.conceal.length, 2);
  for (const c of result.conceal) {
    assert.ok(
      c.startOffset < output.startOffset,
      `conceal.startOffset ${c.startOffset} debería ser del chunk (< ${output.startOffset})`
    );
  }

  // Sin befores en absoluto (cursor en output)
  assert.strictEqual(result.before.length, 0, 'no debe haber befores con cursor en output');
});

// ---------------------------------------------------------------------------
// Output sin línea en blanco intermedia
// ---------------------------------------------------------------------------

test('computeAdornments: output sin línea en blanco → no │ en posición intermedia', () => {
  // Sin línea en blanco entre chunk y output
  const text = [
    makeChunk('a', 'code'),
    makeOutput('a', '12345678', 'result'),
  ].join('\n');

  const chunks = parseChunks(text);
  const outputs = parseOutputs(text);
  const states = statesFor(text, { a: 'fresh' });
  const output = outputs[0];

  const result = computeAdornments(text, chunks, outputs, states, -1);

  // Ningún before entre la valla de cierre del chunk y la apertura del output
  const blankBefore = result.before.find(
    b => b.lineStartOffset > chunks[0].endOffset && b.lineStartOffset < output.startOffset
  );
  assert.strictEqual(blankBefore, undefined, 'no debe haber before en la posición de línea en blanco');

  // Debe haber: barra, apertura output, primera línea contenido = 3 befores
  assert.strictEqual(result.before.length, 3);
});

// ---------------------------------------------------------------------------
// Chunk con 3 líneas de contenido en el output
// ---------------------------------------------------------------------------

test('computeAdornments: 3 líneas de contenido → primera ╰─▶ , segunda y tercera 4 nbsp', () => {
  const text = [
    makeChunk('a', 'code'),
    '',
    makeOutput('a', '12345678', 'line1\nline2\nline3'),
  ].join('\n');

  const chunks = parseChunks(text);
  const outputs = parseOutputs(text);
  const states = statesFor(text, { a: 'fresh' });

  const result = computeAdornments(text, chunks, outputs, states, -1);

  // Befores: barra + │ (blank) + │ (open) + ╰─▶  + '    ' + '    '
  assert.strictEqual(result.before.length, 6, `esperados 6 befores, obtenidos ${result.before.length}`);

  const contentBefores = result.before.slice(3); // los 3 últimos son líneas de contenido
  assert.strictEqual(contentBefores[0].contentText, '╰─▶ ');
  assert.strictEqual(contentBefores[1].contentText, CONT4);
  assert.strictEqual(contentBefores[2].contentText, CONT4);
});

// ---------------------------------------------------------------------------
// Output sin líneas de contenido
// ---------------------------------------------------------------------------

test('computeAdornments: output con 0 líneas de contenido → sin before de flecha', () => {
  // Output vacío (apertura + cierre, sin líneas de contenido).
  // Este es exactamente el formato que buildOutputBlock produce para content=''.
  const outputBlock = '```output {#a hash=12345678}\n```';
  const text = makeChunk('a', 'code') + '\n\n' + outputBlock;

  const chunks = parseChunks(text);
  const outputs = parseOutputs(text);
  assert.strictEqual(outputs.length, 1, 'debe haber exactamente un output');

  const states = statesFor(text, { a: 'fresh' });

  const result = computeAdornments(text, chunks, outputs, states, -1);

  // Solo la barra horizontal: sin │ (blank), sin │ (open), sin flecha.
  assert.strictEqual(result.before.length, 1, `esperado 1 before (solo barra), obtenidos ${result.before.length}`);
  const [barBefore] = result.before;
  assert.ok(barBefore.contentText.startsWith('╭'), 'el único before debe ser la barra horizontal');
  const arrowBefore = result.before.find(b => b.contentText === '╰─▶ ');
  assert.strictEqual(arrowBefore, undefined, 'no debe haber before de flecha con output vacío');
});

// ---------------------------------------------------------------------------
// Output vacío (0 líneas) — integración writer→adorn
// ---------------------------------------------------------------------------

test('computeAdornments: output generado por buildOutputBlock vacío — solo barra, sin │ ni flecha', () => {
  // Verifica el caso end-to-end: buildOutputBlock con contenido vacío produce
  // el bloque sin newline interior y adorn.ts lo renderiza como solo la barra.
  const outputBlock = buildOutputBlock('a', '12345678', '');
  const text = makeChunk('a', 'code') + '\n' + outputBlock;

  const chunks = parseChunks(text);
  const outputs = parseOutputs(text);
  assert.strictEqual(outputs.length, 1, 'debe haber un output');
  const states = statesFor(text, { a: 'fresh' });

  const result = computeAdornments(text, chunks, outputs, states, -1);

  assert.strictEqual(result.before.length, 1, 'solo la barra horizontal');
  assert.ok(result.before[0].contentText.startsWith('╭'), 'el before es la barra');
});

// ---------------------------------------------------------------------------
// Chunk indentado con un espacio de sangría
// ---------------------------------------------------------------------------

test('computeAdornments: chunk indentado 1 espacio → longitud de barra es BAR_WIDTH (20), no la línea de apertura', () => {
  // La barra ahora es de ancho fijo; la sangría del chunk no afecta su longitud.
  const indentedChunk = ' ```python {#a}\ncode\n```';
  const text = indentedChunk + '\n\n' + makeOutput('a', '12345678', 'result');

  const chunks = parseChunks(text);
  const outputs = parseOutputs(text);

  assert.strictEqual(chunks.length, 1, 'debe parsear 1 chunk');

  const states = statesFor(text, { a: 'fresh' });

  const result = computeAdornments(text, chunks, outputs, states, -1);

  const barBefore = result.before.find(b => b.contentText.startsWith('╭'));
  assert.ok(barBefore, 'debe haber un before de barra horizontal');

  // Longitud fija = BAR_WIDTH = 20
  assert.strictEqual(
    barBefore!.contentText.length,
    20,
    `longitud de barra (${barBefore!.contentText.length}) debe ser 20 (BAR_WIDTH)`
  );
  assert.ok(
    barBefore!.contentText.slice(1).split('').every(c => c === '─'),
    'el resto de la barra (tras el codo ╭) solo debe contener el carácter ─'
  );
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseChunks,
  parseOutputs,
  type ParsedChunk,
  type ParsedOutput,
} from './parser.ts';

// ===========================================================================
// parseChunks — casos base
// ===========================================================================

test('parseChunks: documento vacío devuelve []', () => {
  assert.deepStrictEqual(parseChunks(''), []);
});

test('parseChunks: solo prosa, sin bloques de código', () => {
  assert.deepStrictEqual(parseChunks('Título\n\nPárrafo sin código.'), []);
});

test('parseChunks: un chunk simple extrae id, language, code y offsets', () => {
  // "```python {#myid}" = 17 chars; \n en 17
  // 'print("hi")'       = 11 chars; \n en 29
  // "```"               =  3 chars → endOffset = 30 + 3 = 33
  const text = '```python {#myid}\nprint("hi")\n```';
  const chunks = parseChunks(text);

  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].id, 'myid');
  assert.strictEqual(chunks[0].language, 'python');
  assert.strictEqual(chunks[0].code, 'print("hi")');
  assert.strictEqual(chunks[0].startOffset, 0);
  assert.strictEqual(chunks[0].endOffset, text.length); // sin \n final
  assert.strictEqual(chunks[0].truncate, undefined);
});

test('parseChunks: chunk con cuerpo vacío tiene code=""', () => {
  const text = '```python {#empty}\n```';
  const chunks = parseChunks(text);

  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].code, '');
});

test('parseChunks: chunk con múltiples líneas de código', () => {
  const text = '```python {#multi}\nline1\nline2\nline3\n```';
  const chunks = parseChunks(text);

  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].code, 'line1\nline2\nline3');
});

// ===========================================================================
// parseChunks — atributos en el info string
// ===========================================================================

test('parseChunks: chunk con truncate=N expone el campo truncate', () => {
  const text = '```python {#myid truncate=10}\ncode\n```';
  const chunks = parseChunks(text);

  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].truncate, 10);
  assert.strictEqual(chunks[0].id, 'myid');
});

test('parseChunks: atributos desconocidos en el info string se ignoran sin error', () => {
  const text = '```python {#myid foo=bar baz=qux truncate=5}\ncode\n```';
  const chunks = parseChunks(text);

  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].id, 'myid');
  assert.strictEqual(chunks[0].truncate, 5);
  // foo y baz no aparecen en ParsedChunk
  assert.ok(!('foo' in chunks[0]));
});

// ===========================================================================
// parseChunks — múltiples chunks y prosa intercalada
// ===========================================================================

test('parseChunks: múltiples chunks devuelve todos en orden', () => {
  const text = [
    '```python {#a}',
    'code a',
    '```',
    '',
    'Prosa intermedia.',
    '',
    '```javascript {#b}',
    'code b',
    '```',
  ].join('\n');

  const chunks = parseChunks(text);

  assert.strictEqual(chunks.length, 2);
  assert.strictEqual(chunks[0].id, 'a');
  assert.strictEqual(chunks[0].language, 'python');
  assert.strictEqual(chunks[0].code, 'code a');
  assert.strictEqual(chunks[1].id, 'b');
  assert.strictEqual(chunks[1].language, 'javascript');
  assert.strictEqual(chunks[1].code, 'code b');
});

test('parseChunks: offsets correctos con prosa antes y después', () => {
  // "Prose\n" = 6 chars; "```python {#c1}" = 15 chars
  // Chunk empieza en offset 6
  const text = 'Prose\n```python {#c1}\ncode\n```\nEnd';
  const chunks = parseChunks(text);

  assert.strictEqual(chunks.length, 1);
  // "Prose\n" = 6 → primer backtick en 6
  assert.strictEqual(chunks[0].startOffset, 6);
  // "```python {#c1}" = 15 chars (at 6..20), \n at 21
  // "code" = 4 chars (at 22..25), \n at 26
  // "```" = 3 chars at 27..29 → endOffset = 30
  assert.strictEqual(chunks[0].endOffset, 30);
  // text.slice(startOffset, endOffset) cubre el bloque completo sin el \n final
  assert.strictEqual(text.slice(6, 30), '```python {#c1}\ncode\n```');
});

// ===========================================================================
// parseChunks — edge cases
// ===========================================================================

test('parseChunks: bloque sin {#id} no se reconoce como chunk', () => {
  const text = '```python\ncode\n```';
  assert.deepStrictEqual(parseChunks(text), []);
});

test('parseChunks: bloque "output" no se reconoce como chunk', () => {
  const text = '```output {#myid hash=deadbeef}\ncontent\n```';
  assert.deepStrictEqual(parseChunks(text), []);
});

test('parseChunks: bloque indentado con 4 o más espacios no es chunk (CommonMark §4.5)', () => {
  // 4 espacios → la valla no es un bloque delimitado válido (código indentado)
  const text = '    ```python {#ind}\ncode\n    ```';
  assert.deepStrictEqual(parseChunks(text), []);
});

test('parseChunks: bloque con 3 espacios de sangría sí es chunk (CommonMark §4.5)', () => {
  const text = '   ```python {#ind}\ncode\n   ```';
  const chunks = parseChunks(text);

  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].id, 'ind');
  // startOffset apunta al primer backtick (después de los 3 espacios)
  assert.strictEqual(chunks[0].startOffset, 3);
});

test('parseChunks: chunk sin cierre al final del fichero se descarta', () => {
  // Documento en edición: la valla no está cerrada todavía
  const text = '```python {#myid}\ncode sin cerrar';
  assert.deepStrictEqual(parseChunks(text), []);
});

test('parseChunks: valla de 4 backticks se reconoce correctamente', () => {
  // Útil cuando el código contiene ``` en el cuerpo
  const text = '````python {#myid}\ncode\n````';
  const chunks = parseChunks(text);

  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].id, 'myid');
  assert.strictEqual(chunks[0].code, 'code');
});

test('parseChunks: cierre de 3 backticks no cierra apertura de 4 (son contenido)', () => {
  const text = '````python {#myid}\ncode\n```\nmas codigo\n````';
  const chunks = parseChunks(text);

  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0].code, 'code\n```\nmas codigo');
});

// ===========================================================================
// parseOutputs — casos base
// ===========================================================================

test('parseOutputs: documento vacío devuelve []', () => {
  assert.deepStrictEqual(parseOutputs(''), []);
});

test('parseOutputs: solo prosa, sin bloques de salida', () => {
  assert.deepStrictEqual(parseOutputs('Texto sin salidas.'), []);
});

test('parseOutputs: un bloque de salida simple extrae todos los campos', () => {
  // "```output {#myid hash=abc12345}" = 3+6+1+21 = 31 chars
  // "{#myid hash=abc12345}" = {,#,m,y,i,d,' ',h,a,s,h,'=',a,b,c,1,2,3,4,5,} = 21 chars
  const text = '```output {#myid hash=abc12345}\noutput line\n```';
  const outputs = parseOutputs(text);

  assert.strictEqual(outputs.length, 1);
  assert.strictEqual(outputs[0].chunkId, 'myid');
  assert.strictEqual(outputs[0].hash, 'abc12345');
  assert.strictEqual(outputs[0].content, 'output line');
  assert.strictEqual(outputs[0].startOffset, 0);
  assert.strictEqual(outputs[0].endOffset, text.length);
});

test('parseOutputs: bloque de salida sin atributo hash se descarta', () => {
  const text = '```output {#myid}\noutput\n```';
  assert.deepStrictEqual(parseOutputs(text), []);
});

test('parseOutputs: bloques que no son "output" no se incluyen', () => {
  const text = '```python {#myid}\ncode\n```';
  assert.deepStrictEqual(parseOutputs(text), []);
});

test('parseOutputs: lenguaje "output_data" no confundido con "output"', () => {
  const text = '```output_data {#myid hash=abc12345}\ndata\n```';
  assert.deepStrictEqual(parseOutputs(text), []);
});

// ===========================================================================
// parseOutputs — edge cases
// ===========================================================================

test('parseOutputs: bloque de salida sin chunk previo en el texto se parsea igualmente', () => {
  // El orden es irrelevante; parseOutputs no necesita ver el chunk antes
  const text = '```output {#myid hash=deadbeef}\nout\n```\n\n```python {#myid}\ncode\n```';
  const outputs = parseOutputs(text);

  assert.strictEqual(outputs.length, 1);
  assert.strictEqual(outputs[0].chunkId, 'myid');
});

test('parseOutputs: múltiples bloques de salida devuelve todos en orden', () => {
  const text = [
    '```output {#a hash=aaaaaaaa}',
    'out a',
    '```',
    '',
    '```output {#b hash=bbbbbbbb}',
    'out b',
    '```',
  ].join('\n');

  const outputs = parseOutputs(text);

  assert.strictEqual(outputs.length, 2);
  assert.strictEqual(outputs[0].chunkId, 'a');
  assert.strictEqual(outputs[0].hash, 'aaaaaaaa');
  assert.strictEqual(outputs[1].chunkId, 'b');
  assert.strictEqual(outputs[1].hash, 'bbbbbbbb');
});

// ===========================================================================
// Interleaved: chunks y outputs mezclados con prosa
// ===========================================================================

test('parseChunks y parseOutputs sobre documento con chunks, outputs y prosa intercalados', () => {
  const text = [
    '```python {#a}',  // offset 0, 14 chars → blockStart=0
    'code a',          // 6 chars
    '```',             // close → endOffset=25 (22+3)
    '',
    'Some prose',
    '',
    '```output {#a hash=deadbeef}',  // offset 39, 28 chars → blockStart=39
    'out a',           // 5 chars
    '```',             // close → endOffset=77 (74+3)
    '',
    '```python {#b}',  // offset 79, 14 chars → blockStart=79
    'code b',          // 6 chars
    '```',             // close → endOffset=104 (101+3)
  ].join('\n');

  const chunks = parseChunks(text);
  const outputs = parseOutputs(text);

  // Chunks
  assert.strictEqual(chunks.length, 2);
  assert.strictEqual(chunks[0].id, 'a');
  assert.strictEqual(chunks[0].code, 'code a');
  assert.strictEqual(chunks[0].startOffset, 0);
  assert.strictEqual(chunks[0].endOffset, 25);

  assert.strictEqual(chunks[1].id, 'b');
  assert.strictEqual(chunks[1].code, 'code b');
  assert.strictEqual(chunks[1].startOffset, 79);
  assert.strictEqual(chunks[1].endOffset, 104);

  // Outputs
  assert.strictEqual(outputs.length, 1);
  assert.strictEqual(outputs[0].chunkId, 'a');
  assert.strictEqual(outputs[0].hash, 'deadbeef');
  assert.strictEqual(outputs[0].content, 'out a');
  assert.strictEqual(outputs[0].startOffset, 39);
  assert.strictEqual(outputs[0].endOffset, 77);
});

// ===========================================================================
// Verificación de que text.slice(startOffset, endOffset) cubre el bloque exacto
// ===========================================================================

test('text.slice(startOffset, endOffset) reconstruye el bloque de chunk sin \n final', () => {
  const text = 'Intro\n```python {#myid}\ncode\n```\nOutro';
  const chunks = parseChunks(text);

  assert.strictEqual(chunks.length, 1);
  const { startOffset, endOffset } = chunks[0];
  const slice = text.slice(startOffset, endOffset);
  assert.strictEqual(slice, '```python {#myid}\ncode\n```');
  // El carácter en endOffset es \n (la línea siguiente empieza después)
  assert.strictEqual(text[endOffset], '\n');
});

// ===========================================================================
// parseOutputs — campos opcionales warn, seq, up
// ===========================================================================

test('parseOutputs: bloque con warn=1 seq=3 up=e3b0c442 → campos correctos', () => {
  const text = '```output {#myid hash=abc12345 warn=1 seq=3 up=e3b0c442}\ncontent\n```';
  const outputs = parseOutputs(text);

  assert.strictEqual(outputs.length, 1);
  assert.strictEqual(outputs[0].warn, true);
  assert.strictEqual(outputs[0].seq, 3);
  assert.strictEqual(outputs[0].up, 'e3b0c442');
});

test('parseOutputs: bloque sin warn/seq/up → campos ausentes (undefined)', () => {
  const text = '```output {#myid hash=abc12345}\ncontent\n```';
  const outputs = parseOutputs(text);

  assert.strictEqual(outputs.length, 1);
  assert.strictEqual(outputs[0].warn, undefined);
  assert.strictEqual(outputs[0].seq, undefined);
  assert.strictEqual(outputs[0].up, undefined);
});

test('parseOutputs: seq no numérico → campo ausente (undefined), nunca NaN', () => {
  const text = '```output {#myid hash=abc12345 seq=basura}\ncontent\n```';
  const outputs = parseOutputs(text);

  assert.strictEqual(outputs.length, 1);
  assert.strictEqual(outputs[0].seq, undefined);
});

test('text.slice(startOffset, endOffset) reconstruye el bloque de output sin \n final', () => {
  const text = 'Intro\n```output {#myid hash=abc12345}\ncontent\n```\nOutro';
  const outputs = parseOutputs(text);

  assert.strictEqual(outputs.length, 1);
  const { startOffset, endOffset } = outputs[0];
  const slice = text.slice(startOffset, endOffset);
  assert.strictEqual(slice, '```output {#myid hash=abc12345}\ncontent\n```');
  assert.strictEqual(text[endOffset], '\n');
});

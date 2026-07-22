/**
 * Tests unitarios para scribe-bridge-utils.ts.
 *
 * Sin importaciones de VS Code: módulo puro testeable con node:test.
 * Cubre buildLaunchCommand, buildSendAllPrompt y buildFocusPrompt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLaunchCommand,
  buildSendAllPrompt,
  buildFocusPrompt,
} from './scribe-bridge-utils.ts';

// UUID canónico de prueba
const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// ---------------------------------------------------------------------------
// buildLaunchCommand
// ---------------------------------------------------------------------------

test('buildLaunchCommand incluye --style en el comando', () => {
  const cmd = buildLaunchCommand('scribe');
  assert.ok(cmd.includes('--style'), 'el comando debe incluir --style');
});

test('buildLaunchCommand incluye el estilo indicado', () => {
  const cmd = buildLaunchCommand('scribe');
  assert.ok(cmd.includes('scribe'), 'el comando debe incluir el estilo "scribe"');
});

test('buildLaunchCommand con estilo diferente lo refleja en el resultado', () => {
  const cmd = buildLaunchCommand('maker');
  assert.ok(cmd.includes('maker'), 'el comando debe incluir el estilo pasado');
});

// ---------------------------------------------------------------------------
// buildSendAllPrompt
// ---------------------------------------------------------------------------

test('buildSendAllPrompt incluye la ruta del documento', () => {
  const prompt = buildSendAllPrompt('docs/informe.md');
  assert.ok(prompt.includes('docs/informe.md'), 'el prompt debe incluir la ruta del documento');
});

test('buildSendAllPrompt incluye mesh-review project --pending', () => {
  const prompt = buildSendAllPrompt('docs/informe.md');
  assert.ok(prompt.includes('mesh-review project --pending'), 'el prompt debe incluir el comando con --pending');
});

test('buildSendAllPrompt es una sola línea (sin saltos internos)', () => {
  const prompt = buildSendAllPrompt('docs/informe.md');
  assert.ok(!prompt.includes('\n'), 'el prompt no debe contener saltos de línea internos');
});

// ---------------------------------------------------------------------------
// buildFocusPrompt
// ---------------------------------------------------------------------------

test('buildFocusPrompt incluye el thread_id', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42');
  assert.ok(prompt.includes(UUID), 'el prompt debe incluir el thread_id');
});

test('buildFocusPrompt incluye el tipo de comentario', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42');
  assert.ok(prompt.includes('edita'), 'el prompt debe incluir el commentType');
});

test('buildFocusPrompt incluye la etiqueta de línea', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42');
  assert.ok(prompt.includes('L42'), 'el prompt debe incluir el lineLabel');
});

test('buildFocusPrompt incluye mesh-review project sin --pending', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42');
  assert.ok(prompt.includes('mesh-review project'), 'el prompt debe incluir mesh-review project');
  assert.ok(!prompt.includes('--pending'), 'el prompt de foco no debe incluir --pending');
});

test('buildFocusPrompt es una sola línea (sin saltos internos)', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42');
  assert.ok(!prompt.includes('\n'), 'el prompt no debe contener saltos de línea internos');
});

// ---------------------------------------------------------------------------
// Saneado (endurecimiento post-review)
// ---------------------------------------------------------------------------

test('buildLaunchCommand rechaza estilos con metacaracteres de shell', () => {
  assert.throws(() => buildLaunchCommand('scribe; rm -rf ~'), TypeError);
  assert.throws(() => buildLaunchCommand('scribe $(whoami)'), TypeError);
  assert.throws(() => buildLaunchCommand(''), TypeError);
});

test('buildSendAllPrompt entrecomilla la ruta con comillas simples POSIX', () => {
  const prompt = buildSendAllPrompt('docs/$(rm -rf ~).md');
  assert.ok(
    prompt.includes(`'docs/$(rm -rf ~).md'`),
    'la ruta debe ir entre comillas simples para neutralizar $(…) en una shell'
  );
});

test('buildSendAllPrompt escapa comillas simples internas de la ruta', () => {
  const prompt = buildSendAllPrompt(`docs/o'hara.md`);
  assert.ok(
    prompt.includes(`'docs/o'\\''hara.md'`),
    'una comilla simple interna debe escaparse como \'\\\'\''
  );
});

test('buildSendAllPrompt colapsa saltos de línea de la ruta a una sola línea', () => {
  const prompt = buildSendAllPrompt('docs/eco\npwned.md');
  assert.ok(!prompt.includes('\n'), 'el prompt debe seguir siendo una sola línea');
});

test('buildFocusPrompt sustituye un commentType fuera de la lista blanca', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, '$(whoami)', 'L42');
  assert.ok(!prompt.includes('$(whoami)'), 'un commentType desconocido no debe interpolarse crudo');
  assert.ok(prompt.includes('comentario'), 'debe usarse la etiqueta neutra de fallback');
});

test('buildFocusPrompt conserva un commentType de la lista blanca', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'sugerencia', 'L42');
  assert.ok(prompt.includes('sugerencia'), 'un commentType válido debe conservarse');
});

test('buildFocusPrompt colapsa caracteres de control en lineLabel', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42\ninyección');
  assert.ok(!prompt.includes('\n'), 'el prompt debe seguir siendo una sola línea');
});

test('buildFocusPrompt entrecomilla lineLabel para neutralizar separadores de comandos', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42; rm -rf ~ #');
  assert.ok(
    prompt.includes(`'L42; rm -rf ~ #'`),
    'un lineLabel inesperado debe quedar inerte dentro de comillas simples'
  );
});

test('buildFocusPrompt elimina caracteres de control C1 (CSI) de los valores', () => {
  const prompt = buildFocusPrompt('docs/informe.md', UUID, 'edita', 'L42\x9b31m');
  assert.ok(!prompt.includes('\x9b'), 'los caracteres C1 no deben llegar al terminal');
});

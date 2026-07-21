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

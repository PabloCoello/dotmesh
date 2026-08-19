#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const read = (path) => readFileSync(join(root, path), 'utf8');

const requireIncludes = (path, snippets) => {
  const content = read(path);
  const missing = snippets.filter((snippet) => !content.includes(snippet));
  if (missing.length > 0) {
    throw new Error(`${path} is missing: ${missing.join(', ')}`);
  }
};

const requireMatches = (path, checks) => {
  const content = read(path);
  const missing = checks.filter(({ pattern }) => !pattern.test(content));
  if (missing.length > 0) {
    throw new Error(`${path} is missing contract rule(s): ${missing.map(({ name }) => name).join(', ')}`);
  }
};

const requireNotMatches = (path, checks) => {
  const content = read(path);
  const present = checks.filter(({ pattern }) => pattern.test(content));
  if (present.length > 0) {
    throw new Error(`${path} has contradictory wording: ${present.map(({ name }) => name).join(', ')}`);
  }
};

const requireNoPositiveMutationRetry = (path) => {
  const forbidden = /(?:retry|reintent(?:a|ar|an))[^\n]*(?:writes|escrituras|mutations|mutaciones|mutable MCP|MCP mutables|authenticated network|red autenticada|destructive Git|Git\/Stow destructivo|Stow)/i;
  const negated = /(?:Never|Do not|No reintentes|no se reintentan)/i;
  const offenders = read(path)
    .split('\n')
    .filter((line) => forbidden.test(line) && !negated.test(line));
  if (offenders.length > 0) {
    throw new Error(`${path} has positive mutation retry wording: ${offenders.join(' | ')}`);
  }
};

const walk = (dir) => {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(join(root, path));
    return stats.isDirectory() ? walk(path) : [path];
  });
};

const canonicalSkill = 'agents/.agents/skills/tool-error-recovery/SKILL.md';

requireMatches(canonicalSkill, [
  { name: 'one retry maximum', pattern: /(?:at most one retry|Make at most one retry)/i },
  { name: 'idempotent reads only', pattern: /clearly idempotent (?:local )?reads?[^\n|]*\|\s*1/i },
  { name: 'zero retries for writes', pattern: /Writes or edits\s*\|\s*0/i },
  { name: 'zero retries for destructive Git or Stow', pattern: /Git or Stow operations that can change state\s*\|\s*0/i },
  { name: 'zero retries for authenticated network', pattern: /Authenticated network calls\s*\|\s*0/i },
  { name: 'zero retries for mutable MCP', pattern: /Mutable MCP calls\s*\|\s*0/i },
  { name: 'preserve exit or status', pattern: /exit code, status, or exception class/i },
  { name: 'summarise stderr without secrets', pattern: /stderr\/error summary[\s\S]*redacted[\s\S]*secrets|without leaking secrets[\s\S]*stderr\/error summary/i },
  { name: 'stop after repeated failure', pattern: /(?:Stop after a repeated failure|If the retry also fails, stop|stopped after a repeated failure)/i },
  { name: 'no wait-for-user or reflect', pattern: /Do not use `wait-for-user`, `reflect`/i },
  { name: 'no retry plugin or hook by default', pattern: /Do not add a plugin, hook, wrapper, daemon, or retry framework/i },
]);

requireNotMatches(canonicalSkill, [
  { name: 'multiple retries', pattern: /(?:two|three|multiple|unlimited) retries/i },
]);
requireNoPositiveMutationRetry(canonicalSkill);

for (const path of [
  'AGENTS.md',
  'agents/.agents/skills/README.md',
  'opencode/.config/opencode/AGENTS.md',
  'claude/.claude/AGENTS.md',
  'codex/.codex/AGENTS.md',
  'opencode/.config/opencode/agents/maker.md',
  'claude/.claude/output-styles/maker.md',
  'opencode/.config/opencode/agents/build.md',
  'claude/.claude/agents/build.md',
  'README.md',
]) {
  requireIncludes(path, ['tool-error-recovery']);
  requireNotMatches(path, [
    { name: 'Spanish ambiguous redaction wording', pattern: /resumen redactado/i },
    { name: 'multiple retries', pattern: /(?:dos|múltiples|multiple|unlimited) reintentos|(?:two|multiple|unlimited) retries/i },
  ]);
  requireNoPositiveMutationRetry(path);
}

const opencodeConfig = JSON.parse(read('opencode/.config/opencode/opencode.json'));
const opencodePlugins = JSON.stringify(opencodeConfig.plugin ?? []);
if (/tool-error|retry/i.test(opencodePlugins)) {
  throw new Error('opencode config must not add a retry plugin');
}

const unexpectedHookOrPlugin = [
  ...walk('claude/.claude/hooks'),
  ...walk('opencode/.config/opencode/plugins'),
].filter((path) => path.toLowerCase().includes('tool-error') || path.toLowerCase().includes('retry'));

if (unexpectedHookOrPlugin.length > 0) {
  throw new Error(`unexpected retry hook/plugin: ${unexpectedHookOrPlugin.join(', ')}`);
}

console.log('tool-error-recovery instructions are consistent');

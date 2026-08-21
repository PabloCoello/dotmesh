#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const read = (path) => readFileSync(join(root, path), 'utf8');

const textOf = (pathOrText) => (existsSync(join(root, pathOrText)) ? read(pathOrText) : pathOrText);

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
  const forbidden = /(?:retry|reintent(?:a|ar|an))[^.;\n]*(?:writes|escrituras|mutations|mutaciones|mutable MCP|MCP mutables|authenticated network|red autenticada|destructive Git|Git\/Stow destructivo|Stow)/gi;
  const offenders = textOf(path)
    .split('\n')
    .filter((line) => [...line.matchAll(forbidden)].some((match) => {
      const prefix = line.slice(Math.max(0, match.index - 18), match.index).toLowerCase();
      return !/(never\s+|do not\s+|no\s+|no se\s+)$/.test(prefix);
    }));
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

const integrationContract = [
  { name: 'one retry maximum for idempotent reads', pattern: /(?:at most once|at most one retry|un solo reintento|máximo hay un reintento|un reintento como máximo)[\s\S]{0,140}(?:clearly idempotent reads|lecturas claramente idempotentes)|(?:clearly idempotent reads|lecturas claramente idempotentes)[\s\S]{0,140}(?:at most once|at most one retry|un solo reintento|máximo hay un reintento|un reintento como máximo)/i },
  { name: 'zero retries for mutation categories', pattern: /(?:Do not retry|No reintentes|No se reintentan|no retries for)[\s\S]{0,180}(?:writes|escrituras)[\s\S]{0,180}(?:destructive Git or Stow|Git\/Stow destructivo|destructive Git\/Stow)[\s\S]{0,180}(?:authenticated network|red autenticada)[\s\S]{0,180}(?:mutable MCP|MCP mutables)/i },
  { name: 'preserve status and stderr without secrets', pattern: /(?:Preserve|Conserva|preserve)[\s\S]{0,80}(?:exit\/status|status)[\s\S]{0,120}(?:redacted|sin datos sensibles)?[\s\S]{0,80}stderr/i },
  { name: 'stop after second failure', pattern: /(?:stop after a repeated failure|if the retry also fails, stop|si el fallo se repite[\s\S]{0,20}para|se detiene si el fallo se repite)/i },
];

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
  'opencode/.config/opencode/AGENTS.md',
  'claude/.claude/AGENTS.md',
  'codex/.codex/AGENTS.md',
  'README.md',
]) {
  requireIncludes(path, ['tool-error-recovery']);
  requireMatches(path, integrationContract);
  requireNotMatches(path, [
    { name: 'Spanish ambiguous redaction wording', pattern: /resumen redactado/i },
    { name: 'multiple retries', pattern: /(?:dos|múltiples|multiple|unlimited) reintentos|(?:two|multiple|unlimited) retries/i },
  ]);
  requireNoPositiveMutationRetry(path);
}

for (const path of [
  'agents/.agents/skills/README.md',
  'opencode/.config/opencode/agents/maker.md',
  'claude/.claude/output-styles/maker.md',
  'opencode/.config/opencode/agents/build.md',
  'claude/.claude/agents/build.md',
]) {
  requireIncludes(path, ['tool-error-recovery']);
  requireNotMatches(path, [
    { name: 'Spanish ambiguous redaction wording', pattern: /resumen redactado/i },
    { name: 'multiple retries', pattern: /(?:dos|múltiples|multiple|unlimited) reintentos|(?:two|multiple|unlimited) retries/i },
  ]);
  requireNoPositiveMutationRetry(path);
}

for (const phrase of [
  'Do not call extra tools. You may retry writes once.',
  'Do not retry writes. Retry mutable MCP calls after a timeout.',
  'No hagas cambios destructivos. Reintenta la red autenticada si falla.',
]) {
  try {
    requireNoPositiveMutationRetry(phrase);
  } catch {
    continue;
  }
  throw new Error(`positive mutation retry fixture was not rejected: ${phrase}`);
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

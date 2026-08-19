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

const walk = (dir) => {
  const absolute = join(root, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(join(root, path));
    return stats.isDirectory() ? walk(path) : [path];
  });
};

requireIncludes('agents/.agents/skills/tool-error-recovery/SKILL.md', [
  'Retry only when the failed operation is a clearly idempotent read',
  'Make at most one retry',
  'Never retry writes, destructive Git or Stow operations, authenticated network calls, or mutable MCP calls',
  'preserve enough evidence to debug without leaking secrets',
  'Do not use `wait-for-user`, `reflect`, or another synthetic tool as a recovery crutch',
  'Do not add a plugin, hook, wrapper, daemon, or retry framework',
]);

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

#!/usr/bin/env node
// Measures how much of the maker flow actually happened, from Claude Code's own
// transcripts. Reads ~/.claude/projects/ only: it spawns no agent and spends no
// tokens.
//
// Usage: node scripts/maker-flow-stats.mjs [--project <name|substring>] [--dir <path>]
//
// Two observable measures, neither of them interpreted:
//
//   1. Orchestrator delegation — Agent tool calls in the main transcripts,
//      grouped by subagent. This is the contract the maker persona defines
//      (claude/.claude/output-styles/maker.md).
//   2. Build self-check — of the subagents that commit, how many loaded the
//      skills build.md mandates BEFORE their first commit. Only
//      code-review-and-quality is unconditional; the other three depend on the
//      surface of the change, so a low number does not prove non-compliance
//      on its own.
//
// Transcript layout (verified 2026-08-30 against ~/.claude/projects/<slug>/):
//   <session>.jsonl                            main conversation
//   <session>/subagents/agent-<id>.jsonl       one file per subagent
//   <session>/subagents/agent-<id>.meta.json   {"agentType":"build",...}
// Hook output is not persisted in the subagent file, so nothing about hooks can
// be measured here.
//
// Exits 0 unless arguments or the projects directory are unusable: this is a
// measurement, not a test.

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Skills claude/.claude/agents/build.md tells build to load. The boolean marks
// the unconditional one; only that row can be read directly as non-compliance.
const BUILD_SKILLS = [
  ['code-review-and-quality', true],
  ['incremental-implementation', false],
  ['test-driven-development', false],
  ['security-and-hardening', false],
];

// Matches a real `git commit` invocation anywhere in a Bash command.
// The separator class includes the newline because subagents chain `cd <repo>`
// and the commit on separate lines of one command, not only with `&&`.
// The flag group covers `-C <path>` and `-c <key>=<value>`, which take a value
// token, as well as plain global flags such as `--no-pager`.
const GIT_COMMIT =
  /(^|[;|&(\n])\s*(\w+=\S+\s+)*(sudo\s+|env\s+)*(\/\S*\/)?git\s+((-[cC]\s+\S+|-\S+)\s+)*commit\b/;

function parseArgs(argv) {
  const opts = { project: null, dir: join(homedir(), '.claude', 'projects') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project') opts.project = argv[++i];
    else if (argv[i] === '--dir') opts.dir = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') opts.help = true;
    else {
      process.stderr.write(`argumento no reconocido: ${argv[i]}\n`);
      process.exit(2);
    }
  }
  return opts;
}

function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => {
    try {
      return statSync(join(dir, n)).isDirectory();
    } catch {
      return false;
    }
  });
}

// Tool calls of one transcript, in order of appearance. Tolerates broken lines:
// a half-written transcript must not break the measurement.
function toolCalls(file) {
  const calls = [];
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return calls;
  }
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    const content = rec?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'tool_use') calls.push({ name: block.name, input: block.input || {} });
    }
  }
  return calls;
}

function agentTypeOf(jsonlPath) {
  const meta = jsonlPath.replace(/\.jsonl$/, '.meta.json');
  try {
    return JSON.parse(readFileSync(meta, 'utf8')).agentType || 'desconocido';
  } catch {
    return 'desconocido';
  }
}

function selectProjects(all, filter) {
  if (!filter) return all;
  // Exact match wins: project slugs nest by prefix (…-dotmesh and
  // …-dotmesh-watch), and a substring would merge them into one figure.
  if (all.includes(filter)) return [filter];
  return all.filter((n) => n.includes(filter));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      'uso: maker-flow-stats.mjs [--project <nombre|substring>] [--dir <ruta a ~/.claude/projects>]\n'
    );
    return;
  }
  if (!existsSync(opts.dir)) {
    process.stderr.write(`no existe el directorio de proyectos: ${opts.dir}\n`);
    process.exit(1);
  }

  const projects = selectProjects(listDirs(opts.dir), opts.project);
  if (projects.length === 0) {
    // Not an error: a project with no sessions yet is a valid result.
    process.stdout.write(`Sin sesiones para "${opts.project}" en ${opts.dir}. Nada que medir.\n`);
    return;
  }

  const delegations = new Map(); // subagent_type -> Agent calls
  const byType = new Map(); // agentType -> {total, commit}
  const compliant = new Map(BUILD_SKILLS.map(([s]) => [s, 0]));
  let sessions = 0;
  let subagents = 0;
  let committing = 0;

  for (const project of projects) {
    const root = join(opts.dir, project);

    for (const entry of readdirSync(root)) {
      if (!entry.endsWith('.jsonl')) continue;
      sessions++;
      for (const call of toolCalls(join(root, entry))) {
        if (call.name !== 'Agent') continue;
        const type = call.input.subagent_type || 'sin tipo';
        delegations.set(type, (delegations.get(type) || 0) + 1);
      }
    }

    for (const session of listDirs(root)) {
      const subDir = join(root, session, 'subagents');
      if (!existsSync(subDir)) continue;
      for (const entry of readdirSync(subDir)) {
        if (!entry.endsWith('.jsonl')) continue;
        subagents++;
        const path = join(subDir, entry);
        const type = agentTypeOf(path);
        const seen = byType.get(type) || { total: 0, commit: 0 };
        seen.total++;

        // Skills loaded BEFORE the first commit: build.md requires them before
        // committing, not at some point during the session.
        const before = new Set();
        let committed = false;
        for (const call of toolCalls(path)) {
          if (call.name === 'Skill' && call.input.skill) before.add(call.input.skill);
          if (call.name === 'Bash' && GIT_COMMIT.test(call.input.command || '')) {
            committed = true;
            break;
          }
        }
        if (committed) {
          committing++;
          seen.commit++;
          for (const [skill] of BUILD_SKILLS) {
            if (before.has(skill)) compliant.set(skill, compliant.get(skill) + 1);
          }
        }
        byType.set(type, seen);
      }
    }
  }

  const out = ['Flujo maker — medición sobre transcripts reales', ''];
  out.push(`Proyectos: ${projects.length}${opts.project ? ` (filtro "${opts.project}")` : ''}`);
  for (const p of projects) out.push(`  ${p}`);
  out.push(`Sesiones: ${sessions} · subagentes: ${subagents} · con commit: ${committing}`);

  out.push('', '1. Delegación del orquestador (llamadas a Agent)');
  if (delegations.size === 0) {
    out.push('  ninguna');
  } else {
    for (const [type, n] of [...delegations].sort((a, b) => b[1] - a[1])) {
      out.push(`  ${type.padEnd(24)} ${String(n).padStart(4)}`);
    }
  }

  out.push('', '2. Subagentes por tipo');
  for (const [type, s] of [...byType].sort((a, b) => b[1].total - a[1].total)) {
    out.push(`  ${type.padEnd(24)} ${String(s.total).padStart(4)}  con commit: ${s.commit}`);
  }

  out.push('', '3. Autocomprobación antes del primer commit');
  if (committing === 0) {
    out.push('  ningún subagente commiteó: nada que medir');
  } else {
    for (const [skill, required] of BUILD_SKILLS) {
      const n = compliant.get(skill);
      const pct = Math.round((n / committing) * 100);
      const mark = required ? 'exigida siempre' : 'condicional';
      out.push(
        `  ${skill.padEnd(28)} ${String(n).padStart(3)}/${committing}  ${String(pct).padStart(3)}%  ${mark}`
      );
    }
  }

  process.stdout.write(out.join('\n') + '\n');
}

main();

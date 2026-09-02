#!/usr/bin/env bash
# dotmesh skill-loading reminder — Claude Code PreToolUse hook.
# Fires once per agent, on its first write, to remind it to load the skill that
# owns the implementation phase BEFORE it shapes the artifact. It targets a
# recurring failure: executing the flow's shape while working from memory
# instead of invoking the Skill tool (see the dotmesh AGENTS.md flow).
#
# "Its first write" covers Edit/Write/MultiEdit/NotebookEdit and the Bash
# commands that write a file (redirection, tee, an in-place editor). A read-only
# Bash command is ignored.
#
# Why the FIRST edit and not the commit: authoring skills (anti-ai-style,
# castellano-peninsular, the code-simplification YAGNI gate) shape the work as
# it is written. Catching the miss at commit time would force a rewrite — double
# cost. Catching it before the first edit costs only loading the skill, which
# was owed anyway.
#
# It never blocks: it injects a non-blocking reminder via additionalContext and
# exits 0. Any failure (no jq, bad input, unwritable tmp) fails open so Edit is
# never broken. Deduped once per agent via a marker keyed on a sanitised
# session_id plus agent_id (no path traversal).
#
# Stowed by claude/ to ~/.claude/hooks/ and registered in settings.json under
# hooks.PreToolUse, in both the "Write|Edit|MultiEdit|NotebookEdit" and the
# "Bash" matchers.
set -euo pipefail

# Without jq we cannot parse the tool input; fail open rather than break Edit.
# Warn once per day so a fresh install notices the guardrail is sleeping.
if ! command -v jq >/dev/null 2>&1; then
  _jqw="${TMPDIR:-/tmp}/dotmesh-nojq-$(basename "$0" .sh)-$(date +%Y%m%d)"
  # Honour the marker only if it belongs to the current UID (prevents a
  # world-writable /tmp pre-creation from silently suppressing the warning).
  # Anything at that path counts as already warned, and the marker is a
  # directory: mkdir never follows a symlink in the final component, so a marker
  # pre-seeded in a shared TMPDIR cannot make this hook create or truncate a file
  # elsewhere. Audited 2026-09-02.
  { [ -e "$_jqw" ] || [ -L "$_jqw" ]; } && exit 0
  printf 'dotmesh hook: jq no encontrado; guardarraíl desactivado (fail-open). Instala jq.\n' >&2
  mkdir "$_jqw" 2>/dev/null || true
  exit 0
fi

input=$(cat)

# A Bash call only counts when it actually writes a file. Registering the hook
# on the Bash matcher is what covers heredocs, tee and sed -i, which is how a
# session writes files when the harness steers it away from Edit and Write.
# Reading is not implementing, so `ls` or `git status` must not burn the single
# reminder this session gets.
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
if [ "$tool" = "Bash" ]; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
  [ -z "$cmd" ] && exit 0
  # Drop quoted substrings first, as block-dangerous-git.sh does, so a commit
  # message or a grep pattern containing > does not look like a redirection.
  scan=$(printf '%s' "$cmd" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")
  # Drop redirections to /dev/… one by one, so `mkdir -p x >/dev/null && cat > f`
  # still counts as a write.
  scan=$(printf '%s' "$scan" | sed -E 's#>{1,2}[[:space:]]*/dev/[^[:space:];|&)]*##g')
  writes=0
  # Redirection to a path. The &1/&2 duplications do not match the class.
  printf '%s' "$scan" | grep -qE '>{1,2}[[:space:]]*(\.|/|[A-Za-z0-9_$~])' && writes=1
  # In-place editors and tee.
  printf '%s' "$scan" | grep -qE '(^|[[:space:]])tee([[:space:]]|$)' && writes=1
  printf '%s' "$scan" | grep -qE '(^|[[:space:]])(sed|perl|ruby)([[:space:]]+-[^[:space:]]+)*[[:space:]]+-[A-Za-z]*i' && writes=1
  [ "$writes" -eq 1 ] || exit 0
fi

# Dedupe once per agent, not once per session. Subagents inherit the parent's
# session_id (measured 2026-08-31), so keying the marker on it alone means the
# orchestrator's first edit silences every `build` that follows, which is the
# agent that writes almost all the code. agent_id separates them.
# Both ids are sanitised so a crafted value cannot escape the tmp dir.
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' | tr -cd 'A-Za-z0-9_-')
aid=$(printf '%s' "$input" | jq -r '.agent_id // empty' | tr -cd 'A-Za-z0-9_-')
[ -z "$sid" ] && sid="nosession"
[ -z "$aid" ] && aid="main"
marker="${TMPDIR:-/tmp}/dotmesh-skill-reminder-${sid}-${aid}"
# mkdir, not a redirection: a marker pre-seeded as a symlink in a shared TMPDIR
# would otherwise make this hook create or truncate a file elsewhere.
{ [ -e "$marker" ] || [ -L "$marker" ]; } && exit 0
mkdir "$marker" 2>/dev/null || true

read -r -d '' msg <<'EOF' || true
Recordatorio dotmesh (una vez por agente): vas a implementar. Carga la skill que
posee esta fase con la herramienta Skill ANTES de escribir, no de memoria:
- prosa en español -> anti-ai-style y castellano-peninsular
- antes de escribir código -> la puerta YAGNI de code-simplification
- comportamiento ligado a docs/APIs externas -> source-driven-development
Haber leído el fichero no sustituye a cargar la skill.
EOF

jq -nc --arg ctx "$msg" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
exit 0

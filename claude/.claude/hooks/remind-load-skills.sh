#!/usr/bin/env bash
# dotmesh skill-loading reminder — Claude Code PreToolUse hook.
# Fires once per session, on the first Edit/Write, to remind the agent to load
# the skill that owns the implementation phase BEFORE it shapes the artifact.
# It targets a recurring failure: executing the flow's shape while working from
# memory instead of invoking the Skill tool (see the dotmesh AGENTS.md flow).
#
# Why the FIRST edit and not the commit: authoring skills (anti-ai-style,
# castellano-peninsular, the code-simplification YAGNI gate) shape the work as
# it is written. Catching the miss at commit time would force a rewrite — double
# cost. Catching it before the first edit costs only loading the skill, which
# was owed anyway.
#
# It never blocks: it injects a non-blocking reminder via additionalContext and
# exits 0. Any failure (no jq, bad input, unwritable tmp) fails open so Edit is
# never broken. Deduped once per session via a marker keyed on a sanitised
# session_id (no path traversal).
#
# Stowed by claude/ to ~/.claude/hooks/ and registered in settings.json under
# hooks.PreToolUse (matcher "Write|Edit|MultiEdit|NotebookEdit").
set -euo pipefail

# Without jq we cannot parse the tool input; fail open rather than break Edit.
# Warn once per day so a fresh install notices the guardrail is sleeping.
if ! command -v jq >/dev/null 2>&1; then
  _jqw="${TMPDIR:-/tmp}/dotmesh-nojq-$(basename "$0" .sh)-$(date +%Y%m%d)"
  [ -f "$_jqw" ] || { printf 'dotmesh hook: jq no encontrado; guardarraíl desactivado (fail-open). Instala jq.\n' >&2; : > "$_jqw" 2>/dev/null || true; }
  exit 0
fi

input=$(cat)

# Dedupe once per session. Sanitise session_id to a safe filename fragment so a
# crafted value cannot escape the tmp dir.
sid=$(printf '%s' "$input" | jq -r '.session_id // empty')
safe_sid=$(printf '%s' "$sid" | tr -cd 'A-Za-z0-9_-')
[ -z "$safe_sid" ] && safe_sid="nosession"
marker="${TMPDIR:-/tmp}/dotmesh-skill-reminder-${safe_sid}"
[ -e "$marker" ] && exit 0
: > "$marker" 2>/dev/null || true

read -r -d '' msg <<'EOF' || true
Recordatorio dotmesh (una vez por sesión): vas a implementar. Carga la skill que
posee esta fase con la herramienta Skill ANTES de escribir, no de memoria:
- prosa en español -> anti-ai-style y castellano-peninsular
- antes de escribir código -> la puerta YAGNI de code-simplification
- comportamiento ligado a docs/APIs externas -> source-driven-development
Haber leído el fichero no sustituye a cargar la skill.
EOF

jq -nc --arg ctx "$msg" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
exit 0

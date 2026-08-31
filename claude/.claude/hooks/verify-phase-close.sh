#!/usr/bin/env bash
# dotmesh phase-close check — Claude Code SubagentStop hook (matcher "build").
#
# The orchestrator takes a phase as committed by reading the subagent's summary.
# Nothing checks it: a `build` that leaves the tree dirty, or that returns a
# commit range it did not create, is indistinguishable from one that closed the
# phase cleanly. This hook looks at the repository the subagent worked in and
# hands the orchestrator what it needs to contrast against that summary.
#
# It never blocks. Exit 2 here would prevent the subagent from stopping, and by
# the time it runs the work is already done: the decision belongs to the
# orchestrator, so this only supplies evidence.
#
# additionalContext on SubagentStop reaches the parent session, not the
# subagent. Stowed by claude/ to ~/.claude/hooks/.
set -euo pipefail

# Without jq we cannot parse the input; fail open rather than break the flow.
# Warn once per day so a fresh install notices the check is sleeping.
if ! command -v jq >/dev/null 2>&1; then
  _jqw="${TMPDIR:-/tmp}/dotmesh-nojq-$(basename "$0" .sh)-$(date +%Y%m%d)"
  if [ -f "$_jqw" ] && [ "$(stat -c %u "$_jqw" 2>/dev/null)" = "$(id -u)" ]; then
    exit 0
  fi
  printf 'dotmesh hook: jq no encontrado; cierre de fase sin verificar (fail-open). Instala jq.\n' >&2
  : > "$_jqw" 2>/dev/null || true
  exit 0
fi

input=$(cat)
agent_type=$(printf '%s' "$input" | jq -r '.agent_type // empty')
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')

# The matcher should already narrow this to `build`, but a hook that assumes its
# registration is a hook that misfires when the registration drifts.
[ "$agent_type" = build ] || exit 0
[ -d "$cwd" ] || exit 0
command -v git >/dev/null 2>&1 || exit 0
git -C "$cwd" rev-parse --git-dir >/dev/null 2>&1 || exit 0

dirty=$(git -C "$cwd" status --porcelain 2>/dev/null || true)
commits=$(git -C "$cwd" log --oneline -3 2>/dev/null | tr '\n' '\t' | sed 's/\t$//' || true)

if [ -n "$dirty" ]; then
  count=$(printf '%s\n' "$dirty" | grep -c . || true)
  paths=$(printf '%s\n' "$dirty" | head -5 | sed -E 's/^.{3}//' | tr '\n' ', ' | sed 's/,$//')
  [ "$count" -gt 5 ] && paths="$paths, …"
  estado="$count fichero(s) sin commitear: $paths"
else
  estado="árbol de trabajo limpio"
fi

msg="Cierre de fase (build) en $cwd: $estado."
[ -n "$commits" ] && msg="$msg Últimos commits: $commits."
msg="$msg Contrástalo con el rango que el subagente dice haber creado antes de dar la fase por cerrada."

jq -nc --arg m "$msg" \
  '{hookSpecificOutput:{hookEventName:"SubagentStop",additionalContext:$m}}'

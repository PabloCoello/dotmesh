#!/usr/bin/env bash
# dotmesh review-gate reminder — Claude Code PreToolUse hook.
# Fires before a `git commit` and reminds the agent to run the review gate over
# the diff if no evidence of it is found in the session transcript. Running
# review on a finished diff is its natural place, so a commit-time nudge is not
# rework: it adds the review that was meant to happen, it does not redo the work.
#
# It detects a real git-commit invocation with the same two defences as
# block-dangerous-git.sh: strip quoted substrings (so a commit MESSAGE that says
# "git commit" does not trip it) and only inspect command segments that actually
# start with git. Then it greps the transcript for a review subagent or the
# code-review-and-quality skill; absent both, it injects a reminder.
#
# The reminder is agent-aware. A delegated subagent has no Agent tool, so asking
# it to launch `review` asks for something it cannot do; it is asked to load the
# skill over its own diff instead.
#
# It never blocks: non-blocking additionalContext + exit 0. No jq, no transcript,
# or any error fails open so commits are never broken. The check is per-session
# and lenient by design (once review has run, later commits pass) to avoid
# nagging the per-slice commit flow.
#
# Stowed by claude/ to ~/.claude/hooks/ and registered in settings.json under
# hooks.PreToolUse (matcher "Bash"), after block-dangerous-git.sh.
set -euo pipefail

# Without jq we cannot parse the tool input; fail open rather than break Bash.
# Warn once per day so a fresh install notices the guardrail is sleeping.
if ! command -v jq >/dev/null 2>&1; then
  _jqw="${TMPDIR:-/tmp}/dotmesh-nojq-$(basename "$0" .sh)-$(date +%Y%m%d)"
  # Honour the marker only if it belongs to the current UID (prevents a
  # world-writable /tmp pre-creation from silently suppressing the warning).
  if [ -f "$_jqw" ] && [ "$(stat -c %u "$_jqw" 2>/dev/null)" = "$(id -u)" ]; then
    exit 0
  fi
  printf 'dotmesh hook: jq no encontrado; guardarraíl desactivado (fail-open). Instala jq.\n' >&2
  : > "$_jqw" 2>/dev/null || true
  exit 0
fi

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# Strip quoted substrings, then split on command separators so each line is one
# command. Mirrors block-dangerous-git.sh.
# tr instead of sed \n: portable across GNU and BSD sed (macOS).
scan=$(printf '%s' "$cmd" \
  | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g" \
  | tr ';|&(){}' '\n')

is_commit=0
while IFS= read -r seg; do
  seg=$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//')
  printf '%s' "$seg" | grep -qE '^((sudo|env|command|nice)[[:space:]]+)*git([[:space:]]|$)' || continue
  if printf '%s' "$seg" | grep -qE '(^|[[:space:]])commit([[:space:]]|$)'; then
    is_commit=1
  fi
done <<< "$scan"
[ "$is_commit" -eq 1 ] || exit 0

# Look for evidence the review gate ran. Fail open if we cannot read the
# transcript.
tp=$(printf '%s' "$input" | jq -r '.transcript_path // empty')
[ -z "$tp" ] && exit 0
[ -f "$tp" ] || exit 0

# Inside a subagent, transcript_path points at the PARENT session, not at the
# subagent's own transcript. Measured 2026-08-31: a PreToolUse fired by a `build`
# subagent carries agent_id and agent_type, and transcript_path is the parent's.
# Reading the parent there is wrong in both directions. If the orchestrator ran
# the gate once, every later subagent commit passes unchecked; if it did not, the
# subagent is told to launch `review`, which is not in its allowlist.
#
# The subagent's own transcript is derivable, exists when the hook runs and is
# written incrementally, so a skill loaded earlier in the same subagent is
# already visible by the time it commits. agent_id is sanitised because it ends
# up in a filesystem path.
aid=$(printf '%s' "$input" | jq -r '.agent_id // empty' | tr -cd 'A-Za-z0-9_-')
own=""
[ -n "$aid" ] && own="${tp%.jsonl}/subagents/agent-${aid}.jsonl"

# Degrade to the orchestrator branch when the subagent transcript is not where
# it is expected, rather than going quiet. A silent check aimed at the wrong
# file is exactly the defect this fixes, and it would come back unnoticed if the
# layout ever changes.
if [ -n "$own" ] && [ -f "$own" ]; then
  tp="$own"
  # A subagent cannot delegate, so only the skill counts as evidence here.
  evidence='"skill"[[:space:]]*:[[:space:]]*"code-review-and-quality"'
  read -r -d '' msg <<'EOF' || true
Recordatorio dotmesh: vas a commitear y no consta que hayas cargado
code-review-and-quality en esta tarea. Cárgala con la herramienta Skill sobre tu
propio diff antes de commitear, y security-and-hardening si la superficie lo
pide. No puedes delegar: el gate bloqueante lo corre el orquestador después.
EOF
else
  # The bare string "code-review-and-quality" appears in the session from the
  # start (skill list, AGENTS.md). Only a real Skill tool invocation or a review
  # subagent proves the gate ran. Match the JSON key emitted by the Skill tool.
  evidence='("subagent_type"[[:space:]]*:[[:space:]]*"review")|("skill"[[:space:]]*:[[:space:]]*"code-review-and-quality")'
  read -r -d '' msg <<'EOF' || true
Recordatorio dotmesh: vas a commitear y no consta que el gate de revisión haya
corrido esta sesión. Antes de merge, lanza el subagente review sobre el diff (y
security si la superficie lo pide); no des un veredicto propio. Si ya lo lanzaste
y este aviso persiste, ignóralo.
EOF
fi

if grep -qEm 1 "$evidence" "$tp" 2>/dev/null; then
  exit 0
fi

jq -nc --arg ctx "$msg" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
exit 0

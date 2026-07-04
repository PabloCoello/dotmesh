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
  [ -f "$_jqw" ] || { printf 'dotmesh hook: jq no encontrado; guardarraíl desactivado (fail-open). Instala jq.\n' >&2; : > "$_jqw" 2>/dev/null || true; }
  exit 0
fi

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# Strip quoted substrings, then split on command separators so each line is one
# command. Mirrors block-dangerous-git.sh.
scan=$(printf '%s' "$cmd" \
  | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g" \
  | sed -E 's/(\|\||&&|[;|&(){}])/\n/g')

is_commit=0
while IFS= read -r seg; do
  seg=$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//')
  printf '%s' "$seg" | grep -qE '^((sudo|env|command|nice)[[:space:]]+)*git([[:space:]]|$)' || continue
  if printf '%s' "$seg" | grep -qE '(^|[[:space:]])commit([[:space:]]|$)'; then
    is_commit=1
  fi
done <<< "$scan"
[ "$is_commit" -eq 1 ] || exit 0

# Look for evidence the review gate ran this session. Fail open if we cannot read
# the transcript.
tp=$(printf '%s' "$input" | jq -r '.transcript_path // empty')
[ -z "$tp" ] && exit 0
[ -f "$tp" ] || exit 0
if grep -qEm 1 '("subagent_type"[[:space:]]*:[[:space:]]*"review")|code-review-and-quality' "$tp" 2>/dev/null; then
  exit 0
fi

read -r -d '' msg <<'EOF' || true
Recordatorio dotmesh: vas a commitear y no consta que el gate de revisión haya
corrido esta sesión. Antes de merge, lanza el subagente review sobre el diff (y
security si la superficie lo pide); no des un veredicto propio. Si ya lo lanzaste
y este aviso persiste, ignóralo.
EOF

jq -nc --arg ctx "$msg" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
exit 0

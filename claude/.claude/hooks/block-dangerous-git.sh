#!/usr/bin/env bash
# dotmesh git guardrail — Claude Code PreToolUse hook.
# Blocks irreversible git commands before they run, even under
# bypassPermissions. It enforces at the harness level what /super-git already
# forbids by policy. Plain `git push` is intentionally allowed: /super-git
# pushes feature branches (never --force, never the default branch).
#
# Stowed by claude/ to ~/.claude/hooks/ and registered in settings.json under
# hooks.PreToolUse (matcher "Bash"). Exit 2 + stderr message blocks the call.
set -euo pipefail

# Without jq we cannot parse the tool input; fail open (don't block) rather
# than break every Bash call.
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# Irreversible / history-destroying operations. Force-push is blocked; ordinary
# push is not (super-git owns push policy).
dangerous_patterns=(
  "push .*--force"
  "push .*-f([[:space:]]|$)"
  "reset .*--hard"
  "clean .*-[A-Za-z]*f"
  "branch .*-D"
  "checkout +\."
  "restore +\."
)

for pattern in "${dangerous_patterns[@]}"; do
  if printf '%s' "$cmd" | grep -qE "$pattern"; then
    printf 'BLOCKED: "%s" matches the destructive pattern "%s". dotmesh guardrail: this command is not permitted. If you genuinely need it, run it yourself.\n' \
      "$cmd" "$pattern" >&2
    exit 2
  fi
done

exit 0

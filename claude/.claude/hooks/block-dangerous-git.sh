#!/usr/bin/env bash
# dotmesh git guardrail — Claude Code PreToolUse hook.
# Blocks irreversible git commands before they run, even under
# bypassPermissions. It enforces at the harness level what /super-git already
# forbids by policy. Plain `git push` is intentionally allowed: /super-git
# pushes feature branches (never --force, never the default branch).
#
# It fires only when the command actually INVOKES the destructive git op, not
# when a string merely mentions it. Two defences:
#   1. Strip quoted substrings, so `echo "git reset --hard"`, `commit -m "..."`
#      and PR/heredoc bodies don't trip it.
#   2. Split on command separators and only inspect segments that start with
#      `git` (optionally behind sudo/env/command/nice), so `echo git ...` and
#      `--exec git ...` are left alone.
# This is a safety net against accidents, not an adversarial sandbox — exotic
# obfuscation can slip through; the user can always run the command themselves.
#
# Stowed by claude/ to ~/.claude/hooks/ and registered in settings.json under
# hooks.PreToolUse (matcher "Bash"). Exit 2 + stderr message blocks the call.
set -euo pipefail

# Without jq we cannot parse the tool input; fail open rather than break Bash.
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# 1) Drop quoted substrings (single then double), then 2) normalise command
# separators (; && || | & ( ) { }) to newlines so each line is one command.
scan=$(printf '%s' "$cmd" \
  | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g" \
  | sed -E 's/(\|\||&&|[;|&(){}])/\n/g')

# Destructive operations, checked only against a segment already known to be a
# git invocation. Force-push is blocked; ordinary push is not.
dangerous_patterns=(
  'push.*(--force|--force-with-lease)'
  'push.*[[:space:]]-f([[:space:]]|$)'
  'push.*[[:space:]]\+[^[:space:]]'
  'reset.*--hard'
  'clean.*-[A-Za-z]*f'
  'branch.*-D'
  '(checkout|restore)([[:space:]]+--)?[[:space:]]+\.([[:space:]]|$)'
)

while IFS= read -r seg; do
  # Trim leading whitespace.
  seg=$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//')
  # Only inspect segments that actually invoke git (allow sudo/env-style wrappers).
  printf '%s' "$seg" | grep -qE '^((sudo|env|command|nice)[[:space:]]+)*git([[:space:]]|$)' || continue
  # Normalise destructive aliases from git/.gitconfig to their canonical form so
  # the patterns below reach them: co->checkout, discard->checkout --, ps/psu->push.
  # These mirror git/.gitconfig; if you change those aliases, update this mapping.
  seg=$(printf '%s' "$seg" | sed -E \
    -e 's/^((sudo|env|command|nice)[[:space:]]+)*git[[:space:]]+discard([[:space:]]|$)/git checkout -- /' \
    -e 's/^((sudo|env|command|nice)[[:space:]]+)*git[[:space:]]+co([[:space:]]|$)/git checkout /' \
    -e 's/^((sudo|env|command|nice)[[:space:]]+)*git[[:space:]]+psu?([[:space:]]|$)/git push /')
  # `git clean` in dry-run mode (-n / --dry-run) deletes nothing: allow it even with -f.
  if printf '%s' "$seg" | grep -qE '(^|[[:space:]])clean([[:space:]]|$)' \
     && printf '%s' "$seg" | grep -qE '[[:space:]](-[A-Za-z]*n|--dry-run)'; then
    continue
  fi
  for pattern in "${dangerous_patterns[@]}"; do
    if printf '%s' "$seg" | grep -qE "$pattern"; then
      printf 'BLOCKED: "%s" is a destructive git command (matched "%s"). dotmesh guardrail: not permitted. If you genuinely need it, run it yourself.\n' \
        "$seg" "$pattern" >&2
      exit 2
    fi
  done
done <<< "$scan"

exit 0

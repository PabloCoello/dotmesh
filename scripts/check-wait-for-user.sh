#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

require_file() {
  local file="$1"
  if [ ! -f "$ROOT/$file" ]; then
    printf 'missing required file: %s\n' "$file" >&2
    exit 1
  fi
}

require_text() {
  local file="$1"
  local text="$2"
  if ! grep -Fq "$text" "$ROOT/$file"; then
    printf 'missing required text in %s: %s\n' "$file" "$text" >&2
    exit 1
  fi
}

require_file "agents/.agents/skills/wait-for-user/SKILL.md"
require_file "opencode/.config/opencode/commands/wait-for-user.md"

require_text "agents/.agents/skills/wait-for-user/SKILL.md" 'WAIT_FOR_USER: <concrete decision>'
require_text "agents/.agents/skills/wait-for-user/SKILL.md" 'No tool calls happen after the wait request until the human answers.'
require_text "agents/.agents/skills/wait-for-user/SKILL.md" 'OpenCode used `question` when available.'
require_text "agents/.agents/skills/wait-for-user/SKILL.md" 'No secrets are requested, printed, committed, or logged.'

require_text "opencode/.config/opencode/commands/wait-for-user.md" 'Use the native OpenCode `question` tool when it is available.'
require_text "opencode/.config/opencode/README.md" '/wait-for-user'
require_text "agents/.agents/skills/README.md" '`wait-for-user`'
require_text "AGENTS.md" 'WAIT_FOR_USER: <decisión concreta>'
require_text "opencode/.config/opencode/AGENTS.md" 'WAIT_FOR_USER: <decisión concreta>'
require_text "claude/.claude/AGENTS.md" 'WAIT_FOR_USER: <decisión concreta>'
require_text "codex/.codex/AGENTS.md" 'WAIT_FOR_USER: <concrete decision>'

printf 'ok wait-for-user contract\n'

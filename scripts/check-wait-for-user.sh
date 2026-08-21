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
  if ! grep -Fq -- "$text" "$ROOT/$file"; then
    printf 'missing required text in %s: %s\n' "$file" "$text" >&2
    exit 1
  fi
}

require_file "agents/.agents/skills/wait-for-user/SKILL.md"
require_file "opencode/.config/opencode/commands/wait-for-user.md"

agent_frontmatter() {
  local file="$1"
  awk '
    NR == 1 && $0 == "---" { in_frontmatter = 1; next }
    in_frontmatter && $0 == "---" { exit }
    in_frontmatter { print }
  ' "$ROOT/$file"
}

agent_field() {
  local file="$1"
  local field="$2"
  agent_frontmatter "$file" | awk -F': ' -v field="$field" '$1 == field { print $2; exit }'
}

check_agent_question_permission() {
  local file="$1"
  local mode question expected

  mode="$(agent_field "$file" mode)"
  question="$(agent_field "$file" '  question')"

  case "$mode" in
    primary) expected="allow" ;;
    subagent) expected="deny" ;;
    *)
      printf 'unsupported or missing mode in %s: %s\n' "$file" "$mode" >&2
      exit 1
      ;;
  esac

  if [ "$question" != "$expected" ]; then
    printf 'invalid question permission in %s: got %s, expected %s\n' "$file" "${question:-<missing>}" "$expected" >&2
    exit 1
  fi
}

for agent in "$ROOT"/opencode/.config/opencode/agents/*.md; do
  check_agent_question_permission "${agent#"$ROOT/"}"
done

# The temporary home is global on purpose: bash discards the function scope
# before running the EXIT trap, so a `local` would already be gone by the time
# cleanup needs it.
RUNTIME_HOME=""

cleanup_runtime_home() {
  trap - EXIT
  if [ -n "$RUNTIME_HOME" ]; then
    rm -rf "$RUNTIME_HOME"
    RUNTIME_HOME=""
  fi
}

check_runtime_question_permissions() {
  local tmp_base

  if ! command -v opencode >/dev/null 2>&1; then
    printf 'skip runtime question permissions: opencode not found\n'
    return 0
  fi

  tmp_base="${TMPDIR:-/tmp}"
  RUNTIME_HOME="$(mktemp -d "$tmp_base/dotmesh-wait-runtime.XXXXXX")"
  case "$RUNTIME_HOME" in
    "$tmp_base"/dotmesh-wait-runtime.*) ;;
    *)
      printf 'unsafe runtime temp path: %s\n' "$RUNTIME_HOME" >&2
      exit 1
      ;;
  esac

  # EXIT, not RETURN: with `set -e` a failing check exits the shell without
  # ever returning from this function, so a RETURN trap never fires and the
  # temporary home survives the run.
  trap cleanup_runtime_home EXIT

  mkdir -p "$RUNTIME_HOME/.config"
  ln -s "$ROOT/opencode/.config/opencode" "$RUNTIME_HOME/.config/opencode"

  HOME="$RUNTIME_HOME" opencode agent list | awk '
    BEGIN {
      expected["maker"] = "allow"
      expected["scribe"] = "allow"
      expected["build"] = "deny"
      expected["plan"] = "deny"
      expected["review"] = "deny"
      expected["security"] = "deny"
      expected["editor"] = "deny"
      expected["maths"] = "deny"
      expected["reviser"] = "deny"
    }
    $0 ~ /^[[:alnum:]_-]+ \((primary|subagent)\)/ {
      agent = $1
    }
    agent in expected && $0 ~ /"permission": "question"/ {
      pending = agent
      next
    }
    pending != "" && $0 ~ /"action":/ {
      action = $0
      sub(/^.*"action": "/, "", action)
      sub(/".*$/, "", action)
      actual[pending] = action
      pending = ""
    }
    END {
      for (agent in expected) {
        if (!(agent in actual)) {
          printf "missing runtime question permission for %s\n", agent > "/dev/stderr"
          failed = 1
        } else if (actual[agent] != expected[agent]) {
          printf "invalid runtime question permission for %s: got %s, expected %s\n", agent, actual[agent], expected[agent] > "/dev/stderr"
          failed = 1
        }
      }
      exit failed
    }
  '
  cleanup_runtime_home
  printf 'ok runtime question permissions\n'
}

check_runtime_question_permissions

require_text "agents/.agents/skills/wait-for-user/SKILL.md" 'WAIT_FOR_USER: <concrete decision>'
require_text "agents/.agents/skills/wait-for-user/SKILL.md" 'No tool calls happen after the wait request until the human answers.'
require_text "agents/.agents/skills/wait-for-user/SKILL.md" 'OpenCode primary agents used `question` when available.'
require_text "agents/.agents/skills/wait-for-user/SKILL.md" 'No secrets are requested, printed, committed, or logged.'

require_text "opencode/.config/opencode/commands/wait-for-user.md" 'Use the native OpenCode `question` tool when the active agent is a primary agent.'
require_text "opencode/.config/opencode/commands/check-last.md" 'agent: maker'
require_text "opencode/.config/opencode/commands/check-last.md" 'ask one closed native `question` because this command runs with `maker`'
require_text "opencode/.config/opencode/commands/check-last.md" 'WAIT_FOR_USER: choose whether to fix the blocking review/security issues now or stop before committing'
require_text "opencode/.config/opencode/commands/check-last.md" 'Do not loop, rerun the gates, or call more tools after asking until the user answers.'
require_text "opencode/.config/opencode/agents/plan.md" 'As a subagent, do not call a native question tool.'
require_text "opencode/.config/opencode/agents/build.md" 'As a subagent, never call a native question tool.'
require_text "claude/.claude/agents/plan.md" 'As a subagent, do not call a native question tool.'
require_text "claude/.claude/agents/build.md" 'As a subagent, never call a native question tool.'
require_text "opencode/.config/opencode/README.md" '/wait-for-user'
require_text "opencode/.config/opencode/README.md" 'Solo los agentes `primary` (`maker` y `scribe`) tienen `question: allow`.'
require_text "agents/.agents/skills/README.md" '`wait-for-user`'
require_text "agents/.agents/skills/README.md" 'Estas skills forman el conjunto base de ingeniería:'
require_text "README.md" 'El core pack diario incluye estas skills de ingeniería:'
require_text "README.md" '- `wait-for-user`'
require_text "README.md" '2 personas (`maker`, `scribe`) + 7 subagentes en `~/.config/opencode/agents/`'
require_text "README.md" '5 comandos: `/setup`, `/super-git`, `/checkpoint`, `/check-last`, `/wait-for-user`'
require_text "AGENTS.md" '**Seven subagents**'
require_text "AGENTS.md" 'Keep this 2 + 7 shape in sync'
require_text "AGENTS.md" '5 commands: `/setup`, `/super-git`, `/checkpoint`, `/check-last`, `/wait-for-user`'
require_text "docs/INSTALL.md" 'opencode agent list                         # debe listar 2 primary + 7 subagentes'
require_text "docs/INSTALL.md" 'ls ~/.claude/agents/                        # debe listar 7 subagentes de Claude Code'
require_text "AGENTS.md" 'WAIT_FOR_USER: <decisión concreta>'
require_text "opencode/.config/opencode/AGENTS.md" 'WAIT_FOR_USER: <decisión concreta>'
require_text "claude/.claude/AGENTS.md" 'WAIT_FOR_USER: <decisión concreta>'
require_text "codex/.codex/AGENTS.md" 'WAIT_FOR_USER: <concrete decision>'

printf 'ok wait-for-user contract and permissions\n'

#!/usr/bin/env bash
# Static, non-destructive diagnostics for dotmesh's OpenCode configuration.
# It validates repository files and reports local install symlink state without
# starting OpenCode, MCP servers, Stow, Docker, npx, or uvx.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${DOTMESH_DOCTOR_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
HOME_DIR="${DOTMESH_DOCTOR_HOME:-$HOME}"

OPENCODE_DIR="$REPO_ROOT/opencode/.config/opencode"
AGENTS_DIR="$OPENCODE_DIR/agents"
COMMANDS_DIR="$OPENCODE_DIR/commands"
CONFIG_FILE="$OPENCODE_DIR/opencode.json"
SKILLS_DIR="$REPO_ROOT/agents/.agents/skills"

EXPECTED_PRIMARY_AGENTS=(maker scribe)
EXPECTED_SUBAGENTS=(build editor maths plan review reviser security)
EXPECTED_COMMANDS=(check-last checkpoint setup super-git)
EXPECTED_MCP=(github notion openalex tavily zotero)

PASS=0
WARN=0
FAIL=0

say() { printf '%s\n' "$*"; }
pass() { say "  ok  $*"; PASS=$((PASS + 1)); }
warn() { say "  --  $*"; WARN=$((WARN + 1)); }
fail() { say "  !!  $*"; FAIL=$((FAIL + 1)); }

frontmatter_value() {
  local file_path="$1"
  local key="$2"

  awk -v key="$key" '
    NR == 1 && $0 != "---" { exit }
    NR > 1 {
      if ($0 == "---") { exit }
      if (index($0, key ":") == 1) {
        sub(key ":[[:space:]]*", "")
        print
        exit
      }
    }
  ' "$file_path"
}

check_file() {
  local file_path="$1"
  local label="$2"

  if [ -f "$file_path" ]; then
    pass "$label"
  else
    fail "$label falta"
  fi
}

check_json() {
  if command -v jq >/dev/null 2>&1; then
    pass "jq disponible"
  else
    fail "jq no está en PATH"
    return
  fi

  if [ ! -f "$CONFIG_FILE" ]; then
    fail "opencode.json falta"
    return
  fi

  if jq empty "$CONFIG_FILE" >/dev/null 2>&1; then
    pass "opencode.json es JSON válido"
  else
    fail "opencode.json no es JSON válido"
    return
  fi

  local actual_keys expected_count actual_count key
  expected_count="${#EXPECTED_MCP[@]}"
  actual_count="$(jq '.mcp // {} | keys | length' "$CONFIG_FILE")"

  if [ "$actual_count" -eq "$expected_count" ]; then
    pass "MCP declara $expected_count servidores"
  else
    fail "MCP declara $actual_count servidores, esperado $expected_count"
  fi

  for key in "${EXPECTED_MCP[@]}"; do
    if jq -e --arg key "$key" '.mcp[$key]' "$CONFIG_FILE" >/dev/null; then
      pass "MCP $key existe"
    else
      fail "MCP $key falta"
      continue
    fi

    if jq -e --arg key "$key" '.mcp[$key].enabled == true' "$CONFIG_FILE" >/dev/null; then
      pass "MCP $key habilitado"
    else
      fail "MCP $key no está habilitado"
    fi

    if jq -e --arg key "$key" '.mcp[$key].type == "local"' "$CONFIG_FILE" >/dev/null; then
      pass "MCP $key usa type local"
    else
      fail "MCP $key no usa type local"
    fi

    if jq -e --arg key "$key" '.mcp[$key].command | type == "array" and length > 0 and all(.[]; type == "string")' "$CONFIG_FILE" >/dev/null; then
      pass "MCP $key declara command estático"
    else
      fail "MCP $key no declara command como array de cadenas"
    fi
  done

  actual_keys="$(jq -r '.mcp // {} | keys[]' "$CONFIG_FILE")"
  while IFS= read -r key; do
    [ -z "$key" ] && continue
    case " ${EXPECTED_MCP[*]} " in
      *" $key "*) ;;
      *) fail "MCP inesperado: $key" ;;
    esac
  done <<< "$actual_keys"

  if jq -e '
    def suspicious_key: test("(?i)(password|secret|token|api[_-]?key|pat)");
    [paths(scalars) as $path
      | select(($path | map(tostring) | join(".") | suspicious_key)
          and (getpath($path) | type == "string")
          and ((getpath($path) | test("^\\{env:[A-Z0-9_]+\\}$")) | not))]
    | length == 0
  ' "$CONFIG_FILE" >/dev/null; then
    pass "MCP no contiene valores secretos literales"
  else
    fail "MCP contiene un valor sensible literal; usa {env:VARIABLE}"
  fi
}

check_agent_mode() {
  local agent_name="$1"
  local expected_mode="$2"
  local file_path="$AGENTS_DIR/$agent_name.md"
  local mode

  check_file "$file_path" "agente $agent_name.md"
  [ -f "$file_path" ] || return

  mode="$(frontmatter_value "$file_path" mode)"
  if [ "$mode" = "$expected_mode" ]; then
    pass "agente $agent_name mode=$expected_mode"
  else
    fail "agente $agent_name mode=$mode, esperado $expected_mode"
  fi

  if [ -n "$(frontmatter_value "$file_path" description)" ]; then
    pass "agente $agent_name tiene description"
  else
    fail "agente $agent_name no tiene description"
  fi
}

check_agents() {
  local agent_name file_name seen_names=""

  if [ ! -d "$AGENTS_DIR" ]; then
    fail "directorio de agentes falta"
    return
  fi

  for agent_name in "${EXPECTED_PRIMARY_AGENTS[@]}"; do
    check_agent_mode "$agent_name" primary
  done
  for agent_name in "${EXPECTED_SUBAGENTS[@]}"; do
    check_agent_mode "$agent_name" subagent
  done

  while IFS= read -r file_name; do
    [ -z "$file_name" ] && continue
    agent_name="${file_name%.md}"
    seen_names="$seen_names $agent_name"
    case " ${EXPECTED_PRIMARY_AGENTS[*]} ${EXPECTED_SUBAGENTS[*]} " in
      *" $agent_name "*) ;;
      *) fail "agente inesperado: $file_name" ;;
    esac
  done < <(find "$AGENTS_DIR" -maxdepth 1 -type f -name '*.md' -exec basename {} \; | sort)
}

check_commands() {
  local command_name file_name

  if [ ! -d "$COMMANDS_DIR" ]; then
    fail "directorio de comandos falta"
    return
  fi

  for command_name in "${EXPECTED_COMMANDS[@]}"; do
    local file_path="$COMMANDS_DIR/$command_name.md"
    check_file "$file_path" "comando $command_name.md"
    [ -f "$file_path" ] || continue

    if [ -n "$(frontmatter_value "$file_path" description)" ]; then
      pass "comando $command_name tiene description"
    else
      fail "comando $command_name no tiene description"
    fi
  done

  while IFS= read -r file_name; do
    [ -z "$file_name" ] && continue
    command_name="${file_name%.md}"
    case " ${EXPECTED_COMMANDS[*]} " in
      *" $command_name "*) ;;
      *) fail "comando inesperado: $file_name" ;;
    esac
  done < <(find "$COMMANDS_DIR" -maxdepth 1 -type f -name '*.md' -exec basename {} \; | sort)
}

check_skills() {
  local skill_dir skill_name

  if [ ! -d "$SKILLS_DIR" ]; then
    fail "directorio canónico de skills falta"
    return
  fi
  pass "directorio canónico de skills existe"

  while IFS= read -r skill_dir; do
    [ -z "$skill_dir" ] && continue
    skill_name="$(basename "$skill_dir")"
    if [ -f "$skill_dir/SKILL.md" ]; then
      pass "skill $skill_name tiene SKILL.md"
    else
      fail "skill $skill_name no tiene SKILL.md"
    fi
  done < <(find "$SKILLS_DIR" -mindepth 1 -maxdepth 1 -type d | sort)
}

check_install_symlink() {
  local path="$1"
  local label="$2"

  if [ -L "$path" ] && [ -e "$path" ]; then
    pass "$label"
  elif [ -L "$path" ]; then
    warn "$label roto"
  elif [ -e "$path" ]; then
    warn "$label existe, pero no es symlink"
  else
    warn "$label ausente"
  fi
}

check_local_install() {
  local name

  check_install_symlink "$HOME_DIR/.config/opencode/opencode.json" "instalación ~/.config/opencode/opencode.json"

  for name in "${EXPECTED_PRIMARY_AGENTS[@]}" "${EXPECTED_SUBAGENTS[@]}"; do
    check_install_symlink "$HOME_DIR/.config/opencode/agents/$name.md" "instalación agente $name"
  done

  for name in "${EXPECTED_COMMANDS[@]}"; do
    check_install_symlink "$HOME_DIR/.config/opencode/commands/$name.md" "instalación comando $name"
  done

  if [ -d "$HOME_DIR/.agents/skills" ]; then
    pass "instalación ~/.agents/skills existe"
  else
    warn "instalación ~/.agents/skills ausente"
  fi

  if [ -L "$HOME_DIR/.claude/skills" ] && [ -e "$HOME_DIR/.claude/skills" ]; then
    pass "instalación ~/.claude/skills symlink válido"
  elif [ -L "$HOME_DIR/.claude/skills" ]; then
    warn "instalación ~/.claude/skills symlink roto"
  elif [ -e "$HOME_DIR/.claude/skills" ]; then
    warn "instalación ~/.claude/skills existe, pero no es symlink"
  else
    warn "instalación ~/.claude/skills ausente"
  fi
}

main() {
  say "OpenCode doctor:"
  say ""

  say "JSON y MCP"
  check_json
  say ""

  say "Agentes"
  check_agents
  say ""

  say "Comandos"
  check_commands
  say ""

  say "Skills"
  check_skills
  say ""

  say "Symlinks locales"
  check_local_install
  say ""

  say "Resumen: $PASS ok, $WARN avisos, $FAIL fallos"
  [ "$FAIL" -eq 0 ]
}

main "$@"

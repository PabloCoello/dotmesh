#!/usr/bin/env bash
# Tests for scripts/opencode-doctor.sh. They use temporary repositories and a
# fake HOME, so they do not inspect or modify the user's live configuration.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCTOR="$REPO_ROOT/scripts/opencode-doctor.sh"

PASS=0
FAIL=0
CLEANUP_DIRS=()

pass() { printf 'PASS: %s\n' "$*"; PASS=$((PASS + 1)); }
fail() { printf 'FAIL: %s\n' "$*"; FAIL=$((FAIL + 1)); }

cleanup() {
  local dir
  for dir in "${CLEANUP_DIRS[@]}"; do
    [ -d "$dir" ] && rm -rf "$dir"
  done
}
trap cleanup EXIT

make_fixture_repo() {
  local tmp_root="$1"

  mkdir -p "$tmp_root/opencode/.config" "$tmp_root/agents/.agents"
  cp -R "$REPO_ROOT/opencode/.config/opencode" "$tmp_root/opencode/.config/"
  cp -R "$REPO_ROOT/agents/.agents/skills" "$tmp_root/agents/.agents/"
}

make_fake_home() {
  local fake_home="$1"
  local fixture_repo="$2"

  mkdir -p "$fake_home/.config/opencode/agents" \
    "$fake_home/.config/opencode/commands" \
    "$fake_home/.agents"

  ln -s "$fixture_repo/opencode/.config/opencode/opencode.json" \
    "$fake_home/.config/opencode/opencode.json"
  ln -s "$fixture_repo/opencode/.config/opencode/agents/maker.md" \
    "$fake_home/.config/opencode/agents/maker.md"
  ln -s "$fixture_repo/opencode/.config/opencode/commands/setup.md" \
    "$fake_home/.config/opencode/commands/setup.md"
  ln -s "$fixture_repo/agents/.agents/skills" "$fake_home/.agents/skills"
  mkdir -p "$fake_home/.claude"
  ln -s "$fake_home/.agents/skills" "$fake_home/.claude/skills"
}

run_doctor() {
  local fixture_repo="$1"
  local fake_home="$2"
  DOTMESH_DOCTOR_ROOT="$fixture_repo" DOTMESH_DOCTOR_HOME="$fake_home" \
    bash "$DOCTOR" 2>&1
}

assert_sensitive_literal_fails() {
  local fixture_repo="$1"
  local fake_home="$2"
  local forbidden_value="$3"
  local label="$4"

  if output="$(run_doctor "$fixture_repo" "$fake_home")"; then
    fail "$label no falla"
  else
    if printf '%s\n' "$output" | grep -q "$forbidden_value"; then
      fail "$label imprime el valor literal"
    elif printf '%s\n' "$output" | grep -q 'valor sensible literal'; then
      pass "$label se detecta sin imprimirlo"
    else
      fail "$label no deja mensaje claro"
    fi
  fi
}

tmp_dir="$(mktemp -d)"
CLEANUP_DIRS+=("$tmp_dir")

# Good fixture: repository invariants pass, and fake HOME symlinks are valid.
fixture_good="$tmp_dir/good-repo"
home_good="$tmp_dir/good-home"
make_fixture_repo "$fixture_good"
make_fake_home "$home_good" "$fixture_good"
if output="$(run_doctor "$fixture_good" "$home_good")"; then
  if printf '%s\n' "$output" | grep -q '0 fallos'; then
    pass "configuración válida termina sin fallos"
  else
    fail "configuración válida no informa 0 fallos"
  fi
else
  fail "configuración válida devuelve error"
fi

# Missing expected agent: repository diagnostics must fail.
fixture_missing_agent="$tmp_dir/missing-agent-repo"
home_missing_agent="$tmp_dir/missing-agent-home"
make_fixture_repo "$fixture_missing_agent"
make_fake_home "$home_missing_agent" "$fixture_missing_agent"
rm "$fixture_missing_agent/opencode/.config/opencode/agents/review.md"
if output="$(run_doctor "$fixture_missing_agent" "$home_missing_agent")"; then
  fail "agente esperado ausente no falla"
else
  if printf '%s\n' "$output" | grep -q 'agente review.md falta'; then
    pass "agente esperado ausente se detecta"
  else
    fail "agente esperado ausente no deja mensaje claro"
  fi
fi

# Literal values in sensitive MCP fields: fail without printing the value.
fixture_literal="$tmp_dir/literal-repo"
home_literal="$tmp_dir/literal-home"
make_fixture_repo "$fixture_literal"
make_fake_home "$home_literal" "$fixture_literal"
jq '.mcp.github.environment.GITHUB_PERSONAL_ACCESS_TOKEN = "DO_NOT_PRINT_THIS_VALUE"' \
  "$fixture_literal/opencode/.config/opencode/opencode.json" \
  > "$fixture_literal/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_literal/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_literal/opencode/.config/opencode/opencode.json"
assert_sensitive_literal_fails "$fixture_literal" "$home_literal" \
  'DO_NOT_PRINT_THIS_VALUE' "valor sensible literal"

# Secrets embedded in command/args: fail without printing the argument.
fixture_command="$tmp_dir/command-repo"
home_command="$tmp_dir/command-home"
make_fixture_repo "$fixture_command"
make_fake_home "$home_command" "$fixture_command"
jq '.mcp.notion.command += ["--token=DO_NOT_PRINT_ARG_123456789"]' \
  "$fixture_command/opencode/.config/opencode/opencode.json" \
  > "$fixture_command/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_command/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_command/opencode/.config/opencode/opencode.json"
assert_sensitive_literal_fails "$fixture_command" "$home_command" \
  'DO_NOT_PRINT_ARG_123456789' "secreto en command/args"

# Secrets embedded in headers: fail without printing the header value.
fixture_header="$tmp_dir/header-repo"
home_header="$tmp_dir/header-home"
make_fixture_repo "$fixture_header"
make_fake_home "$home_header" "$fixture_header"
jq '.mcp.tavily.headers.Authorization = "Bearer DO_NOT_PRINT_HEADER_123456789"' \
  "$fixture_header/opencode/.config/opencode/opencode.json" \
  > "$fixture_header/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_header/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_header/opencode/.config/opencode/opencode.json"
assert_sensitive_literal_fails "$fixture_header" "$home_header" \
  'DO_NOT_PRINT_HEADER_123456789' "secreto en header"

# Env placeholders in sensitive fields are allowed.
fixture_env="$tmp_dir/env-repo"
home_env="$tmp_dir/env-home"
make_fixture_repo "$fixture_env"
make_fake_home "$home_env" "$fixture_env"
jq '.mcp.tavily.headers.Authorization = "{env:DOTMESH_AUTH_HEADER}"' \
  "$fixture_env/opencode/.config/opencode/opencode.json" \
  > "$fixture_env/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_env/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_env/opencode/.config/opencode/opencode.json"
if output="$(run_doctor "$fixture_env" "$home_env")"; then
  if printf '%s\n' "$output" | grep -q '0 fallos'; then
    pass "placeholder env en campo sensible se permite"
  else
    fail "placeholder env permitido no informa 0 fallos"
  fi
else
  fail "placeholder env permitido devuelve error"
fi

printf '\nResumen: %s PASS, %s FAIL\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

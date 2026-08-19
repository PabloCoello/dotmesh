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
if output="$(run_doctor "$fixture_literal" "$home_literal")"; then
  fail "valor literal en MCP no falla"
else
  if printf '%s\n' "$output" | grep -q 'DO_NOT_PRINT_THIS_VALUE'; then
    fail "el diagnóstico imprime el valor literal"
  elif printf '%s\n' "$output" | grep -q 'valor sensible literal'; then
    pass "valor sensible literal se detecta sin imprimirlo"
  else
    fail "valor sensible literal no deja mensaje claro"
  fi
fi

printf '\nResumen: %s PASS, %s FAIL\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

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
  local name

  mkdir -p "$fake_home/.config/opencode/agents" \
    "$fake_home/.config/opencode/commands" \
    "$fake_home/.agents"

  ln -s "$fixture_repo/opencode/.config/opencode/opencode.json" \
    "$fake_home/.config/opencode/opencode.json"
  for name in maker scribe build editor maths plan review reviser security; do
    ln -s "$fixture_repo/opencode/.config/opencode/agents/$name.md" \
      "$fake_home/.config/opencode/agents/$name.md"
  done
  for name in check-last checkpoint setup super-git; do
    ln -s "$fixture_repo/opencode/.config/opencode/commands/$name.md" \
      "$fake_home/.config/opencode/commands/$name.md"
  done
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
    if printf '%s\n' "$output" | grep -q -- "$forbidden_value"; then
      fail "$label imprime el valor literal"
    elif printf '%s\n' "$output" | grep -q 'valor sensible literal'; then
      pass "$label se detecta sin imprimirlo"
    else
      fail "$label no deja mensaje claro"
    fi
  fi
}

assert_mcp_type_fails_without_value() {
  local fixture_repo="$1"
  local fake_home="$2"
  local forbidden_value="$3"
  local label="$4"

  if output="$(run_doctor "$fixture_repo" "$fake_home")"; then
    fail "$label no falla"
  else
    if [ -n "$forbidden_value" ] && printf '%s\n' "$output" | grep -q -- "$forbidden_value"; then
      fail "$label imprime contenido de mcp"
    elif printf '%s\n' "$output" | grep -q 'MCP debe ser un objeto JSON'; then
      pass "$label se informa sin volcar contenido"
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
  if printf '%s\n' "$output" | grep -q '0 avisos, 0 fallos'; then
    pass "fixture completo termina sin avisos ni fallos"
  else
    fail "fixture completo no informa 0 avisos y 0 fallos"
  fi
else
  fail "fixture completo devuelve error"
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

# Invalid MCP top-level types fail in a controlled way without dumping values.
fixture_mcp_string="$tmp_dir/mcp-string-repo"
home_mcp_string="$tmp_dir/mcp-string-home"
make_fixture_repo "$fixture_mcp_string"
make_fake_home "$home_mcp_string" "$fixture_mcp_string"
jq '.mcp = "DO_NOT_PRINT_MCP_STRING"' \
  "$fixture_mcp_string/opencode/.config/opencode/opencode.json" \
  > "$fixture_mcp_string/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_mcp_string/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_mcp_string/opencode/.config/opencode/opencode.json"
assert_mcp_type_fails_without_value "$fixture_mcp_string" "$home_mcp_string" \
  'DO_NOT_PRINT_MCP_STRING' "MCP string"

fixture_mcp_array="$tmp_dir/mcp-array-repo"
home_mcp_array="$tmp_dir/mcp-array-home"
make_fixture_repo "$fixture_mcp_array"
make_fake_home "$home_mcp_array" "$fixture_mcp_array"
jq '.mcp = ["DO_NOT_PRINT_MCP_ARRAY"]' \
  "$fixture_mcp_array/opencode/.config/opencode/opencode.json" \
  > "$fixture_mcp_array/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_mcp_array/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_mcp_array/opencode/.config/opencode/opencode.json"
assert_mcp_type_fails_without_value "$fixture_mcp_array" "$home_mcp_array" \
  'DO_NOT_PRINT_MCP_ARRAY' "MCP array"

fixture_mcp_null="$tmp_dir/mcp-null-repo"
home_mcp_null="$tmp_dir/mcp-null-home"
make_fixture_repo "$fixture_mcp_null"
make_fake_home "$home_mcp_null" "$fixture_mcp_null"
jq '.mcp = null' \
  "$fixture_mcp_null/opencode/.config/opencode/opencode.json" \
  > "$fixture_mcp_null/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_mcp_null/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_mcp_null/opencode/.config/opencode/opencode.json"
assert_mcp_type_fails_without_value "$fixture_mcp_null" "$home_mcp_null" \
  '' "MCP null"

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

# Sensitive flag assignments are rejected even at the end of command arrays.
fixture_assignment_final="$tmp_dir/assignment-final-repo"
home_assignment_final="$tmp_dir/assignment-final-home"
make_fixture_repo "$fixture_assignment_final"
make_fake_home "$home_assignment_final" "$fixture_assignment_final"
jq '.mcp.notion.command += ["--token=x"]' \
  "$fixture_assignment_final/opencode/.config/opencode/opencode.json" \
  > "$fixture_assignment_final/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_assignment_final/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_assignment_final/opencode/.config/opencode/opencode.json"
assert_sensitive_literal_fails "$fixture_assignment_final" "$home_assignment_final" \
  '--token=x' "flag sensible con asignación final"

# Sensitive flags split from their value in command arrays are rejected.
fixture_split_flag="$tmp_dir/split-flag-repo"
home_split_flag="$tmp_dir/split-flag-home"
make_fixture_repo "$fixture_split_flag"
make_fake_home "$home_split_flag" "$fixture_split_flag"
jq '.mcp.notion.command += ["--token", "DO_NOT_PRINT_SPLIT_ARG_123456789"]' \
  "$fixture_split_flag/opencode/.config/opencode/opencode.json" \
  > "$fixture_split_flag/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_split_flag/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_split_flag/opencode/.config/opencode/opencode.json"
assert_sensitive_literal_fails "$fixture_split_flag" "$home_split_flag" \
  'DO_NOT_PRINT_SPLIT_ARG_123456789' "flag sensible con valor separado"

# Common auth-token flags split from their value are rejected.
fixture_auth_token="$tmp_dir/auth-token-repo"
home_auth_token="$tmp_dir/auth-token-home"
make_fixture_repo "$fixture_auth_token"
make_fake_home "$home_auth_token" "$fixture_auth_token"
jq '.mcp.notion.command += ["--auth-token", "DO_NOT_PRINT_AUTH_TOKEN_123456789"]' \
  "$fixture_auth_token/opencode/.config/opencode/opencode.json" \
  > "$fixture_auth_token/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_auth_token/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_auth_token/opencode/.config/opencode/opencode.json"
assert_sensitive_literal_fails "$fixture_auth_token" "$home_auth_token" \
  'DO_NOT_PRINT_AUTH_TOKEN_123456789' "flag auth-token con valor separado"

# Header flags carrying credential headers are rejected.
fixture_header_arg="$tmp_dir/header-arg-repo"
home_header_arg="$tmp_dir/header-arg-home"
make_fixture_repo "$fixture_header_arg"
make_fake_home "$home_header_arg" "$fixture_header_arg"
jq '.mcp.notion.command += ["--header", "X-API-Key: DO_NOT_PRINT_X_API_KEY_123456789"]' \
  "$fixture_header_arg/opencode/.config/opencode/opencode.json" \
  > "$fixture_header_arg/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_header_arg/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_header_arg/opencode/.config/opencode/opencode.json"
assert_sensitive_literal_fails "$fixture_header_arg" "$home_header_arg" \
  'DO_NOT_PRINT_X_API_KEY_123456789' "flag header con API key"

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

# Env placeholders embedded in bearer headers are allowed.
fixture_bearer_env="$tmp_dir/bearer-env-repo"
home_bearer_env="$tmp_dir/bearer-env-home"
make_fixture_repo "$fixture_bearer_env"
make_fake_home "$home_bearer_env" "$fixture_bearer_env"
jq '.mcp.tavily.headers.Authorization = "Bearer {env:DOTMESH_AUTH_HEADER}"' \
  "$fixture_bearer_env/opencode/.config/opencode/opencode.json" \
  > "$fixture_bearer_env/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_bearer_env/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_bearer_env/opencode/.config/opencode/opencode.json"
if output="$(run_doctor "$fixture_bearer_env" "$home_bearer_env")"; then
  if printf '%s\n' "$output" | grep -q '0 avisos, 0 fallos'; then
    pass "placeholder env embebido se permite"
  else
    fail "placeholder env embebido no informa 0 avisos y 0 fallos"
  fi
else
  fail "placeholder env embebido devuelve error"
fi

# Env placeholders embedded in command flag assignments are allowed.
fixture_flag_env="$tmp_dir/flag-env-repo"
home_flag_env="$tmp_dir/flag-env-home"
make_fixture_repo "$fixture_flag_env"
make_fake_home "$home_flag_env" "$fixture_flag_env"
jq '.mcp.notion.command += ["--token={env:DOTMESH_MCP_TOKEN}"]' \
  "$fixture_flag_env/opencode/.config/opencode/opencode.json" \
  > "$fixture_flag_env/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_flag_env/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_flag_env/opencode/.config/opencode/opencode.json"
if output="$(run_doctor "$fixture_flag_env" "$home_flag_env")"; then
  if printf '%s\n' "$output" | grep -q '0 avisos, 0 fallos'; then
    pass "placeholder env en flag se permite"
  else
    fail "placeholder env en flag no informa 0 avisos y 0 fallos"
  fi
else
  fail "placeholder env en flag devuelve error"
fi

# Env placeholders in flag assignments remain allowed with following args.
fixture_flag_env_more="$tmp_dir/flag-env-more-repo"
home_flag_env_more="$tmp_dir/flag-env-more-home"
make_fixture_repo "$fixture_flag_env_more"
make_fake_home "$home_flag_env_more" "$fixture_flag_env_more"
jq '.mcp.notion.command += ["--token={env:DOTMESH_MCP_TOKEN}", "--verbose"]' \
  "$fixture_flag_env_more/opencode/.config/opencode/opencode.json" \
  > "$fixture_flag_env_more/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_flag_env_more/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_flag_env_more/opencode/.config/opencode/opencode.json"
if output="$(run_doctor "$fixture_flag_env_more" "$home_flag_env_more")"; then
  if printf '%s\n' "$output" | grep -q '0 avisos, 0 fallos'; then
    pass "placeholder env en flag con argumentos posteriores se permite"
  else
    fail "placeholder env en flag con argumentos posteriores no informa 0 avisos y 0 fallos"
  fi
else
  fail "placeholder env en flag con argumentos posteriores devuelve error"
fi

# Env placeholders embedded in command header flags are allowed.
fixture_header_env="$tmp_dir/header-env-repo"
home_header_env="$tmp_dir/header-env-home"
make_fixture_repo "$fixture_header_env"
make_fake_home "$home_header_env" "$fixture_header_env"
jq '.mcp.notion.command += ["--header", "X-API-Key: {env:DOTMESH_MCP_TOKEN}"]' \
  "$fixture_header_env/opencode/.config/opencode/opencode.json" \
  > "$fixture_header_env/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_header_env/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_header_env/opencode/.config/opencode/opencode.json"
if output="$(run_doctor "$fixture_header_env" "$home_header_env")"; then
  if printf '%s\n' "$output" | grep -q '0 avisos, 0 fallos'; then
    pass "placeholder env en flag header se permite"
  else
    fail "placeholder env en flag header no informa 0 avisos y 0 fallos"
  fi
else
  fail "placeholder env en flag header devuelve error"
fi

# Non-sensitive names containing PAT as part of another word are allowed.
fixture_data_path="$tmp_dir/data-path-repo"
home_data_path="$tmp_dir/data-path-home"
make_fixture_repo "$fixture_data_path"
make_fake_home "$home_data_path" "$fixture_data_path"
jq '.mcp.zotero.environment.DATA_PATH = "/tmp/dotmesh-data"' \
  "$fixture_data_path/opencode/.config/opencode/opencode.json" \
  > "$fixture_data_path/opencode/.config/opencode/opencode.json.tmp"
mv "$fixture_data_path/opencode/.config/opencode/opencode.json.tmp" \
  "$fixture_data_path/opencode/.config/opencode/opencode.json"
if output="$(run_doctor "$fixture_data_path" "$home_data_path")"; then
  if printf '%s\n' "$output" | grep -q '0 avisos, 0 fallos'; then
    pass "DATA_PATH se permite"
  else
    fail "DATA_PATH permitido no informa 0 avisos y 0 fallos"
  fi
else
  fail "DATA_PATH permitido devuelve error"
fi

# Symlinks must point to dotmesh's canonical targets, not merely to any file.
fixture_wrong_link="$tmp_dir/wrong-link-repo"
home_wrong_link="$tmp_dir/wrong-link-home"
make_fixture_repo "$fixture_wrong_link"
make_fake_home "$home_wrong_link" "$fixture_wrong_link"
mkdir -p "$tmp_dir/other-target"
touch "$tmp_dir/other-target/maker.md"
rm "$home_wrong_link/.config/opencode/agents/maker.md"
ln -s "$tmp_dir/other-target/maker.md" "$home_wrong_link/.config/opencode/agents/maker.md"
if output="$(run_doctor "$fixture_wrong_link" "$home_wrong_link")"; then
  if printf '%s\n' "$output" | grep -q 'instalación agente maker apunta a otro destino'; then
    pass "symlink a target erróneo se detecta"
  else
    fail "symlink a target erróneo no deja mensaje claro"
  fi
else
  fail "symlink a target erróneo no debe ser fallo fatal"
fi

printf '\nResumen: %s PASS, %s FAIL\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

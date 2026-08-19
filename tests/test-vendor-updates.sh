#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

write_git_stub() {
  local mode="$1"
  mkdir -p "$TMP_DIR/bin"
  cat >"$TMP_DIR/bin/git" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail

mode="${VENDOR_TEST_MODE:?}"
if [ "${GIT_TERMINAL_PROMPT:-}" != "0" ] || [ "${GIT_ALLOW_PROTOCOL:-}" != "https" ]; then
  echo "unsafe git environment" >&2
  exit 97
fi

if [ "${GIT_CONFIG_NOSYSTEM:-}" != "1" ] || [ "${GIT_CONFIG_SYSTEM:-}" != "/dev/null" ]; then
  echo "unsafe system git config" >&2
  exit 95
fi

if [ "${GIT_CONFIG_GLOBAL:-}" != "/dev/null" ] || [ "${GIT_CONFIG_COUNT:-}" != "0" ]; then
  echo "unsafe user git config" >&2
  exit 94
fi

if [ "$1" != "-C" ] || [ "$2" != "/" ]; then
  echo "neutral working directory not set" >&2
  exit 92
fi
shift 2

if [ "$1" != "-c" ] || [ "$2" != "credential.helper=" ]; then
  echo "credential helper not disabled" >&2
  exit 93
fi
shift 2

if [ "$1" != "ls-remote" ]; then
  echo "unexpected git command: $*" >&2
  exit 99
fi

case "$mode" in
  current)
    printf '%s\tHEAD\n' '6cbdba434fd15fc3818302a5843593da47db2eb4'
    ;;
  updated)
    printf '%s\tHEAD\n' 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    ;;
  network-fail)
    echo 'network unavailable' >&2
    exit 128
    ;;
  *)
    echo "unknown mode: $mode" >&2
    exit 98
    ;;
esac
STUB
  chmod +x "$TMP_DIR/bin/git"
  export VENDOR_TEST_MODE="$mode"
  export PATH="$TMP_DIR/bin:$PATH"
}

run_check() {
  local mode="$1"
  write_git_stub "$mode"
  export GIT_CONFIG_COUNT=1
  export GIT_CONFIG_KEY_0=url.https://evil.example/.insteadOf
  export GIT_CONFIG_VALUE_0=https://github.com/
  "$ROOT_DIR/scripts/check-vendor-updates.sh" "$ROOT_DIR/scripts/vendor/upstreams.tsv"
}

run_check_with_manifest() {
  local manifest="$1"
  mkdir -p "$TMP_DIR/bin"
  cat >"$TMP_DIR/bin/git" <<'STUB'
#!/usr/bin/env bash
echo 'git must not run for blocked manifests' >&2
exit 96
STUB
  chmod +x "$TMP_DIR/bin/git"
  export PATH="$TMP_DIR/bin:$PATH"
  "$ROOT_DIR/scripts/check-vendor-updates.sh" "$manifest"
}

output="$(run_check current)"
grep -Fq 'herdr-skill' <<<"$output"
grep -Fq 'current' <<<"$output"
grep -Fq 'mattpocock-skills-adapted' <<<"$output"
grep -Fq 'manual/unknown' <<<"$output"

output="$(run_check updated)"
grep -Fq 'update_available' <<<"$output"
grep -Fq 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' <<<"$output"

set +e
output="$(run_check network-fail 2>&1)"
status=$?
set -e
[ "$status" -eq 0 ]
grep -Fq 'network_unavailable' <<<"$output"

repo_with_local_config="$TMP_DIR/repo-with-local-config"
mkdir -p "$repo_with_local_config/.git"
cat >"$repo_with_local_config/.git/config" <<'EOF'
[url "https://evil.example/"]
	insteadOf = https://github.com/
EOF
output="$(cd "$repo_with_local_config" && run_check current)"
grep -Fq 'current' <<<"$output"

malicious_manifest="$TMP_DIR/malicious.tsv"

cat >"$malicious_manifest" <<'EOF'
herdr-skill	agents/.agents/skills/herdr	--upload-pack=evil	HEAD	6cbdba434fd1	Option-like URL.
EOF
output="$(run_check_with_manifest "$malicious_manifest")"
grep -Fq 'blocked_value' <<<"$output"

cat >"$malicious_manifest" <<'EOF'
herdr-skill	agents/.agents/skills/herdr	https://example.com/ogulcancelik/herdr.git	HEAD	6cbdba434fd1	Wrong host.
EOF
output="$(run_check_with_manifest "$malicious_manifest")"
grep -Fq 'blocked_upstream' <<<"$output"

cat >"$malicious_manifest" <<'EOF'
herdr-skill	agents/.agents/skills/herdr	ssh://github.com/ogulcancelik/herdr.git	HEAD	6cbdba434fd1	Wrong protocol.
EOF
output="$(run_check_with_manifest "$malicious_manifest")"
grep -Fq 'blocked_upstream' <<<"$output"

cat >"$malicious_manifest" <<'EOF'
herdr-skill	agents/.agents/skills/herdr	https://github.com/ogulcancelik/herdr.git	--upload-pack=evil	6cbdba434fd1	Option-like ref.
EOF
output="$(run_check_with_manifest "$malicious_manifest")"
grep -Fq 'blocked_value' <<<"$output"

cat >"$malicious_manifest" <<'EOF'
herdr-skill	agents/.agents/skills/herdr	https://github.com/ogulcancelik/herdr.git	refs/heads/main..evil	6cbdba434fd1	Invalid ref.
EOF
output="$(run_check_with_manifest "$malicious_manifest")"
grep -Fq 'invalid_ref' <<<"$output"

cat >"$malicious_manifest" <<'EOF'
herdr-skill	agents/.agents/skills/herdr	https://github.com/ogulcancelik/herdr.git	refs/tags/v1.0.0	6cbdba434fd15fc3818302a5843593da47db2eb4	Tags are not needed by the inventory.
EOF
output="$(run_check_with_manifest "$malicious_manifest")"
grep -Fq 'invalid_ref' <<<"$output"

cat >"$malicious_manifest" <<'EOF'
herdr-skill	agents/.agents/skills/herdr	https://github.com/ogulcancelik/herdr.git	HEAD	6cbdba434fd1	Short hash.
EOF
output="$(run_check_with_manifest "$malicious_manifest")"
grep -Fq 'invalid_local_ref' <<<"$output"

echo "ok vendor update checks"

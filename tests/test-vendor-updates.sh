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
if [ "$1" != "ls-remote" ]; then
  echo "unexpected git command: $*" >&2
  exit 99
fi

if [ "${GIT_TERMINAL_PROMPT:-}" != "0" ] || [ "${GIT_ALLOW_PROTOCOL:-}" != "https" ]; then
  echo "unsafe git environment" >&2
  exit 97
fi

case "$mode" in
  current)
    printf '%s\tHEAD\n' '6cbdba434fd10000000000000000000000000000'
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

echo "ok vendor update checks"

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

echo "ok vendor update checks"

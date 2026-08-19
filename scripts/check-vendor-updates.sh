#!/usr/bin/env bash
set -euo pipefail

MANIFEST="${1:-scripts/vendor/upstreams.tsv}"

is_allowed_upstream() {
  case "$1 $2" in
    'herdr-skill https://github.com/ogulcancelik/herdr.git') return 0 ;;
    'mattpocock-skills-adapted https://github.com/mattpocock/skills.git') return 0 ;;
    *) return 1 ;;
  esac
}

is_safe_ref() {
  local ref="$1"
  [[ "$ref" =~ ^(HEAD|refs/heads/[A-Za-z0-9._/-]+)$ ]] || return 1
  case "$ref" in
    -*|*..*|*@{*|*//*|*/|*.) return 1 ;;
  esac
  return 0
}

is_full_hash() {
  [[ "$1" =~ ^[0-9a-fA-F]{40}$ ]]
}

starts_with_dash() {
  case "$1" in
    -*) return 0 ;;
    *) return 1 ;;
  esac
}

if [ ! -f "$MANIFEST" ]; then
  echo "vendor check: manifest not found: $MANIFEST" >&2
  exit 1
fi

printf '%s\t%s\t%s\t%s\t%s\n' "component" "status" "local_ref" "upstream_ref" "path"

while IFS=$'\t' read -r component local_path upstream_url upstream_ref local_ref notes; do
  case "${component:-}" in
    ''|'#'*) continue ;;
  esac

  if [ -z "${upstream_url:-}" ] || [ "${upstream_ref:-}" = "manual" ] || [ "${local_ref:-}" = "unknown" ]; then
    printf '%s\t%s\t%s\t%s\t%s\n' "$component" "manual/unknown" "${local_ref:-unknown}" "${upstream_ref:-unknown}" "$local_path"
    continue
  fi

  if starts_with_dash "$upstream_url" || starts_with_dash "$upstream_ref"; then
    printf '%s\t%s\t%s\t%s\t%s\n' "$component" "blocked_value" "$local_ref" "$upstream_ref" "$local_path"
    continue
  fi

  if ! is_allowed_upstream "$component" "$upstream_url"; then
    printf '%s\t%s\t%s\t%s\t%s\n' "$component" "blocked_upstream" "$local_ref" "$upstream_ref" "$local_path"
    continue
  fi

  if ! is_safe_ref "$upstream_ref"; then
    printf '%s\t%s\t%s\t%s\t%s\n' "$component" "invalid_ref" "$local_ref" "$upstream_ref" "$local_path"
    continue
  fi

  if ! is_full_hash "$local_ref"; then
    printf '%s\t%s\t%s\t%s\t%s\n' "$component" "invalid_local_ref" "$local_ref" "$upstream_ref" "$local_path"
    continue
  fi

  if ! output="$(GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_SYSTEM=/dev/null GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_COUNT=0 GIT_TERMINAL_PROMPT=0 GIT_ALLOW_PROTOCOL=https git -c credential.helper= ls-remote --quiet "$upstream_url" "$upstream_ref" 2>/dev/null)"; then
    printf '%s\t%s\t%s\t%s\t%s\n' "$component" "network_unavailable" "$local_ref" "$upstream_ref" "$local_path"
    continue
  fi

  remote_ref="$(printf '%s\n' "$output" | while IFS=$'\t' read -r oid ref; do
    if [ "$ref" = "$upstream_ref" ]; then
      printf '%s' "$oid"
      break
    fi
  done)"

  if [ -z "$remote_ref" ]; then
    printf '%s\t%s\t%s\t%s\t%s\n' "$component" "upstream_ref_missing" "$local_ref" "$upstream_ref" "$local_path"
  elif [ "$remote_ref" = "$local_ref" ]; then
    printf '%s\t%s\t%s\t%s\t%s\n' "$component" "current" "$local_ref" "$remote_ref" "$local_path"
  else
    printf '%s\t%s\t%s\t%s\t%s\n' "$component" "update_available" "$local_ref" "$remote_ref" "$local_path"
  fi
done <"$MANIFEST"

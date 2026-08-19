#!/usr/bin/env bash
set -euo pipefail

MANIFEST="${1:-scripts/vendor/upstreams.tsv}"

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

  if ! output="$(git ls-remote --quiet "$upstream_url" "$upstream_ref" 2>/dev/null)"; then
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
  elif [ "${remote_ref#"$local_ref"}" != "$remote_ref" ]; then
    printf '%s\t%s\t%s\t%s\t%s\n' "$component" "current" "$local_ref" "$remote_ref" "$local_path"
  else
    printf '%s\t%s\t%s\t%s\t%s\n' "$component" "update_available" "$local_ref" "$remote_ref" "$local_path"
  fi
done <"$MANIFEST"

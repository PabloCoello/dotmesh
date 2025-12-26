#!/usr/bin/env bash
# Install commit-msg hook for the Obsidian vault to enforce commit tags.
# Usage:
#   scripts/install-obsidian-hooks.sh [vault_path]
# Defaults to: ${OBSIDIAN_VAULT:-$HOME/Documents/Pandora}

set -euo pipefail

VAULT_PATH="${1:-${OBSIDIAN_VAULT:-$HOME/Documents/Pandora}}"
HOOK_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/obsidian/hooks/commit-msg"
HOOK_DST="$VAULT_PATH/.git/hooks/commit-msg"

if [ ! -d "$VAULT_PATH/.git" ]; then
  echo "No .git found in $VAULT_PATH. Init git there before installing hook." >&2
  exit 1
fi

mkdir -p "$(dirname "$HOOK_DST")"
if [ -e "$HOOK_DST" ]; then
  cp "$HOOK_DST" "$HOOK_DST.bak.$(date +%Y%m%d%H%M%S)"
  echo "Backed up existing hook to $HOOK_DST.bak.*"
fi

cp "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST"
echo "Installed commit-msg hook to $HOOK_DST"

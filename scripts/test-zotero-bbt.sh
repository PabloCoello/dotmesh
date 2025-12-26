#!/usr/bin/env bash
# Quick check that BetterBibTeX auto-export exists and is readable.
# Usage: scripts/test-zotero-bbt.sh [path]
# Defaults to ${ZOTERO_BBT_PATH:-$HOME/Documents/Zotero/betterbibtex.bib}

set -euo pipefail

BBT_PATH="${1:-${ZOTERO_BBT_PATH:-$HOME/Documents/Zotero/betterbibtex.bib}}"

if [ ! -f "$BBT_PATH" ]; then
  echo "Missing file: $BBT_PATH" >&2
  exit 1
fi

echo "BBT export found: $BBT_PATH"
echo "Sample entries:"
head -n 20 "$BBT_PATH"

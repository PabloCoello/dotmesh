#!/usr/bin/env bash
# Optional helper: convert BetterBibTeX JSON to BibTeX using pandoc (if needed).
# Usage:
#   obsidian/hooks/post-export-convert.sh input.json output.bib
# Requires: pandoc

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 input.json output.bib" >&2
  exit 1
fi

INPUT="$1"
OUTPUT="$2"

if ! command -v pandoc >/dev/null 2>&1; then
  echo "pandoc is required to convert JSON to BibTeX" >&2
  exit 1
fi

pandoc "$INPUT" -f csljson -t biblatex -o "$OUTPUT"
echo "Converted $INPUT -> $OUTPUT"

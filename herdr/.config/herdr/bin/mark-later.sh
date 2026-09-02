#!/usr/bin/env bash
# Toggle the "later" mark on the focused agent pane.
#
# Bound from [[keys.command]] in config.toml, which runs this detached and
# injects HERDR_ACTIVE_PANE_ID with the pane that had focus when the chord
# fired. Run from a pane's own shell there is no such variable, so fall back to
# HERDR_PANE_ID, which every herdr shell carries.
#
# The mark is display-only metadata: herdr keeps it in memory and never writes
# it to session.json, so it survives closing the terminal but not restarting
# the server. That is a deliberate trade-off — see the block comment next to
# the $later token in config.toml.

set -euo pipefail

readonly SOURCE="dotmesh.later"
readonly TOKEN="later"
# U+258C. The token is placed first on both rows of the agent entry, so two
# stacked half-blocks read as one continuous rail down the left edge of the
# card — the closest thing to marking the whole component, since herdr styles
# tokens with fg/bold/dim only and has no per-row background.
readonly GLYPH="▌"

# Same dependency and guard as claude/.claude/hooks/herdr-agent-state.sh: the
# herdr surface already parses its JSON with python3. Unlike that hook this one
# is user-triggered, so a missing interpreter says so instead of exiting quiet —
# a chord that does nothing without explaining itself is worse than an error.
if ! command -v python3 >/dev/null 2>&1; then
  echo "mark-later: python3 is required to read the pane metadata" >&2
  exit 1
fi

herdr="${HERDR_BIN_PATH:-herdr}"
pane="${HERDR_ACTIVE_PANE_ID:-${HERDR_PANE_ID:-}}"

if [ -z "$pane" ]; then
  echo "mark-later: no focused pane (HERDR_ACTIVE_PANE_ID and HERDR_PANE_ID are unset)" >&2
  exit 1
fi

# `pane get` fails if the pane vanished between the keypress and this call.
if ! pane_json=$("$herdr" pane get "$pane" 2>/dev/null); then
  echo "mark-later: pane $pane not found" >&2
  exit 1
fi

marked=$(printf '%s' "$pane_json" | LATER_TOKEN="$TOKEN" python3 -c '
import json, os, sys
try:
    pane = json.load(sys.stdin)["result"]["pane"]
except (ValueError, KeyError):
    sys.exit(1)
print("yes" if pane.get("tokens", {}).get(os.environ["LATER_TOKEN"]) else "no")
') || {
  echo "mark-later: could not read pane metadata" >&2
  exit 1
}

if [ "$marked" = "yes" ]; then
  "$herdr" pane report-metadata "$pane" --source "$SOURCE" --clear-token "$TOKEN" >/dev/null
else
  "$herdr" pane report-metadata "$pane" --source "$SOURCE" --token "$TOKEN=$GLYPH" >/dev/null
fi

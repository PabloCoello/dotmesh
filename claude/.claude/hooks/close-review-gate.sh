#!/usr/bin/env bash
# dotmesh close-review-gate — Claude Code Stop hook.
#
# The review gate fails at closing, not at diagnosing. Measured on 2026-09-01
# with the seeded bench (I1 of the maker-flow exam): `review` flagged a defect as
# `blocker`, with the mechanism spelled out, and the principal applied the other
# findings and closed the turn without ever mentioning it — while claiming the
# review had been applied. In another run it launched the gate as a background
# agent and closed the turn without waiting for it.
#
# Both are closing failures, so the check belongs at Stop. Two independent
# conditions, each blocking once per session:
#
#   1. A `review`/`security` subagent was launched asynchronously and its
#      completion notification never arrived. Measured 2026-09-02 on real
#      transcripts: every Agent launch in this install returns
#      status "async_launched", so an unharvested gate is the default outcome of
#      not waiting, not a rare slip.
#   2. A gate notification carried a `blocker` and no later assistant text names
#      it. Surfacing it is the contract ("if it returns blocking issues, stop and
#      surface them"); staying silent is what was measured.
#
# Stop only fires for the principal — subagents stop through SubagentStop — which
# is exactly who owns closing the turn. Exit 2 prevents the stop and hands stderr
# back to the agent. Everything unexpected fails open: no jq, no transcript,
# unreadable JSON or stop_hook_active leave the turn alone. Blocking twice in a
# row would be worse than not blocking, so each condition spends a marker.
#
# Stowed by claude/ to ~/.claude/hooks/ and registered in settings.json under
# hooks.Stop.
set -euo pipefail

# Without jq we cannot parse the input; fail open rather than trap the session.
# Warn once per day so a fresh install notices the check is sleeping.
if ! command -v jq >/dev/null 2>&1; then
  _jqw="${TMPDIR:-/tmp}/dotmesh-nojq-$(basename "$0" .sh)-$(date +%Y%m%d)"
  { [ -e "$_jqw" ] || [ -L "$_jqw" ]; } && exit 0
  printf 'dotmesh hook: jq no encontrado; cierre del gate sin verificar (fail-open). Instala jq.\n' >&2
  mkdir "$_jqw" 2>/dev/null || true
  exit 0
fi

input=$(cat)

# Already blocked once in this stop cycle: chaining another block on top is how
# a hook deadlocks a session.
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = true ] && exit 0

tp=$(printf '%s' "$input" | jq -r '.transcript_path // empty')
[ -z "$tp" ] && exit 0
[ -f "$tp" ] || exit 0

# One pass over the transcript, flattened to tagged lines. Newlines inside text
# are folded so one record stays one line.
#
#   GATE  <tool_use id>   a review/security subagent was launched
#   ASYNC <tool_use id>   that launch returned without a report
#   STR   <content>       a string-content record (task notifications live here)
#   TEXT  <text>          assistant prose, where a blocker has to surface
#
# A task notification reaches the transcript in more than one record shape: as a
# `user` record with the string under `.message.content`, and as a
# `queue-operation` record with it under a top-level `.content`. Measured on real
# transcripts (2026-09-02), some notifications exist *only* in the second shape,
# so reading `.message.content` alone leaves those gates forever unharvested and
# loses their blocker. Both are read, and a duplicate costs nothing.
#
# jq stops at a malformed line, and its partial output cannot be trusted: GATE
# and ASYNC are emitted before the notification that clears them, so acting on a
# truncated stream produces a false pending block. A jq failure gives up instead.
stream=$(jq -rc '
  ((.message.content? // .content?) // empty) as $c
  | if ($c | type) == "array" then
      ( $c[]
        | if .type == "tool_use" and .name == "Agent"
             and ((.input.subagent_type? // "") | test("^(review|security)$"))
            then "GATE\t\(.id // "")"
          elif .type == "text" then "TEXT\t\(.text | gsub("[\n\r]"; " "))"
          else empty end ),
      ( if (.toolUseResult.status? // "") == "async_launched"
          then ($c[] | select(.type == "tool_result") | "ASYNC\t\(.tool_use_id // "")")
          else empty end )
    elif ($c | type) == "string" then "STR\t\($c | gsub("[\n\r]"; " "))"
    else empty end
' "$tp" 2>/dev/null) || exit 0
[ -z "$stream" ] && exit 0

# True when the text names a blocker rather than denying one. A clean verdict
# names the severity in order to deny it ("sin blockers, dos nits"), so the
# negated forms are stripped before looking for what is left. Folding is
# ASCII-only and under LC_ALL=C so the accented forms survive untouched; both
# `ningún` and `ningun` are listed for that reason.
#
# The same predicate reads the report and the closing text. Using a bare grep on
# the closing text would let "revisión aplicada, sin blockers" discharge a real
# blocker, which is the exact sentence the measured failure produced.
#
# Residual: the stripping is adjacency-only, so "sin hallazgos blocker" still
# counts as a blocker. Erring towards one extra block is the cheap direction.
names_blocker() {
  printf '%s' "$1" \
    | LC_ALL=C tr 'A-Z' 'a-z' \
    | sed -E 's/(no|sin|ningún|ningun|cero|0)[[:space:]]+(hay[[:space:]]+)?(blockers?|bloqueantes?)//g;
              s/(blockers?|bloqueantes?)[[:space:]]*:?[[:space:]]*(ninguno|ninguna|none|0)//g' \
    | grep -qE 'blocker|bloqueante'
}

gates=""
async=""
notified=""
blocker_open=0

while IFS=$'\t' read -r tag rest; do
  case "$tag" in
    GATE)  [ -n "$rest" ] && gates="$gates$rest"$'\n' ;;
    ASYNC) [ -n "$rest" ] && async="$async$rest"$'\n' ;;
    STR)
      case "$rest" in
        *"<task-notification>"*) ;;
        *) continue ;;
      esac
      id=$(printf '%s' "$rest" | sed -nE 's|.*<tool-use-id>([^<]*)</tool-use-id>.*|\1|p')
      status=$(printf '%s' "$rest" | sed -nE 's|.*<status>([^<]*)</status>.*|\1|p')
      [ -n "$id" ] || continue
      printf '%s' "$gates" | grep -qxF "$id" || continue
      # Any notification takes the gate out of flight, whatever it says. Telling
      # the agent to wait for a report that already arrived saying the subagent
      # failed is an instruction it cannot satisfy.
      notified="$notified$id"$'\n'
      [ "$status" = completed ] || continue
      names_blocker "$rest" && blocker_open=1
      ;;
    TEXT)
      # The principal naming it discharges the duty; the notification itself
      # cannot, since it arrives as STR.
      if [ "$blocker_open" -eq 1 ] && names_blocker "$rest"; then
        blocker_open=0
      fi
      ;;
  esac
done <<< "$stream"

# A gate is pending when it was launched, came back async, and never notified.
pending=""
while IFS= read -r id; do
  [ -n "$id" ] || continue
  printf '%s' "$async" | grep -qxF "$id" || continue
  printf '%s' "$notified" | grep -qxF "$id" && continue
  pending="$id"
  break
done <<< "$gates"

sid=$(printf '%s' "$input" | jq -r '.session_id // empty' | tr -cd 'A-Za-z0-9_-')
[ -z "$sid" ] && sid="nosession"

# Anything already sitting at the marker path counts as spent, whoever put it
# there. In a shared TMPDIR a third party can pre-seed it and skip one nudge;
# treating a foreign marker as unspent would instead block every turn with no way
# out, which is the worse failure.
spent() {
  [ -e "$1" ] || [ -L "$1" ]
}

block() {
  # A directory, not a file: mkdir never follows a symlink in the final
  # component, so a marker pre-seeded as a link cannot make this hook create or
  # truncate a file somewhere else. Audited 2026-09-02.
  mkdir "$1" 2>/dev/null || true
  printf '%s\n' "$2" >&2
  exit 2
}

if [ -n "$pending" ]; then
  m="${TMPDIR:-/tmp}/dotmesh-close-gate-pending-${sid}"
  if ! spent "$m"; then
    read -r -d '' msg <<'EOF' || true
Bloqueado por dotmesh: lanzaste el gate (review o security) en segundo plano y
vas a cerrar el turno sin su resultado. Espera su notificación, lee el informe y
trata sus hallazgos antes de cerrar; un gate que nadie cosecha no es un gate.
Este bloqueo ocurre una sola vez por sesión.
EOF
    block "$m" "$msg"
  fi
fi

if [ "$blocker_open" -eq 1 ]; then
  m="${TMPDIR:-/tmp}/dotmesh-close-gate-blocker-${sid}"
  if ! spent "$m"; then
    read -r -d '' msg <<'EOF' || true
Bloqueado por dotmesh: el gate devolvió al menos un hallazgo `blocker` y no lo
has nombrado al cerrar. Arréglalo, o dilo al usuario de forma explícita con la
razón de no aplicarlo. Un blocker no se cierra en silencio.
Este bloqueo ocurre una sola vez por sesión.
EOF
    block "$m" "$msg"
  fi
fi

exit 0

#!/usr/bin/env bash
# dotmesh slice-commit check — Claude Code Stop hook.
#
# `incremental-implementation` says each completed, green slice is committed on
# the working branch as you go, and AGENTS.md says it explicitly does not need
# the user to ask first. Measured on 2026-09-01/02 (I1 and I2 of the maker-flow
# exam): zero commits across the six I1 runs and the three inline I2 runs. The
# only arm that committed was the orchestrated one, where verify-phase-close.sh
# was watching. The prose has been written all along and does not carry; the
# hook does.
#
# The check is what this session actually touched: the file paths from its own
# Write/Edit tool calls, contrasted against git. Looking at the whole tree would
# fire on dirt that predates the session and belongs to somebody else. Anything
# git ignores — plans, scratch, AI artefacts — is not a slice.
#
# Blocks once per session (additionalContext on Stop reaches an agent that has
# already decided to stop, so it changes nothing) and fails open everywhere else.
#
# Stowed by claude/ to ~/.claude/hooks/ and registered in settings.json under
# hooks.Stop.
set -euo pipefail

# Without jq we cannot parse the input; fail open rather than trap the session.
# Warn once per day so a fresh install notices the check is sleeping.
if ! command -v jq >/dev/null 2>&1; then
  _jqw="${TMPDIR:-/tmp}/dotmesh-nojq-$(basename "$0" .sh)-$(date +%Y%m%d)"
  { [ -e "$_jqw" ] || [ -L "$_jqw" ]; } && exit 0
  printf 'dotmesh hook: jq no encontrado; commit por slice sin verificar (fail-open). Instala jq.\n' >&2
  mkdir "$_jqw" 2>/dev/null || true
  exit 0
fi

command -v git >/dev/null 2>&1 || exit 0

input=$(cat)

# Already blocked once in this stop cycle: chaining another block on top is how
# a hook deadlocks a session.
[ "$(printf '%s' "$input" | jq -r '.stop_hook_active // false')" = true ] && exit 0

tp=$(printf '%s' "$input" | jq -r '.transcript_path // empty')
[ -z "$tp" ] && exit 0
[ -f "$tp" ] || exit 0

# The repository this session works in. A transcript can name a file anywhere on
# the machine, and a path outside this repository is not this session's slice:
# reporting it would leak the name of somebody else's file into the agent's
# context and block the turn over state the session never touched.
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
[ -n "$cwd" ] && [ -d "$cwd" ] || exit 0
root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || true)
[ -n "$root" ] || exit 0

# Absolute paths this session wrote to, deduplicated, newest last. A malformed
# line stops jq; what came before is still emitted, which errs towards fail-open.
paths=$(jq -rc '
  (.message.content? // empty)
  | select(type == "array")
  | .[]
  | select(.type == "tool_use"
           and (.name | test("^(Write|Edit|MultiEdit|NotebookEdit)$"))
           and (.input.file_path? // "") != "")
  | .input.file_path
' "$tp" 2>/dev/null | awk '!seen[$0]++' || true)
[ -z "$paths" ] && exit 0

# git status reports nothing for an ignored path, so plans under .ai/ and
# scratch outside the repo drop out without a list of exceptions to maintain.
dirty=""
count=0
while IFS= read -r p; do
  [ -n "$p" ] || continue
  d=$(dirname "$p")
  [ -d "$d" ] || continue
  [ "$(git -C "$d" rev-parse --show-toplevel 2>/dev/null || true)" = "$root" ] || continue
  st=$(git -C "$d" status --porcelain -- "$p" 2>/dev/null || true)
  [ -n "$st" ] || continue
  count=$((count + 1))
  [ "$count" -le 5 ] && dirty="$dirty$(basename "$p"), "
done <<< "$paths"

[ "$count" -eq 0 ] && exit 0

dirty=${dirty%, }
[ "$count" -gt 5 ] && dirty="$dirty, …"

sid=$(printf '%s' "$input" | jq -r '.session_id // empty' | tr -cd 'A-Za-z0-9_-')
[ -z "$sid" ] && sid="nosession"
marker="${TMPDIR:-/tmp}/dotmesh-slice-commit-${sid}"

# Anything already sitting at the marker path counts as spent, whoever put it
# there. In a shared TMPDIR a third party can pre-seed it and skip one nudge;
# treating a foreign marker as unspent would instead block every turn with no way
# out, which is the worse failure.
{ [ -e "$marker" ] || [ -L "$marker" ]; } && exit 0
# A directory, not a file: mkdir never follows a symlink in the final component,
# so a marker pre-seeded as a link cannot make this hook create or truncate a
# file somewhere else. Audited 2026-09-02.
mkdir "$marker" 2>/dev/null || true

cat >&2 <<EOF
Bloqueado por dotmesh: cierras el turno con $count fichero(s) que has editado en
esta sesión y siguen sin commitear: $dirty
El commit por slice es automático en una rama de trabajo, no algo que el usuario
tenga que pedir. Commitea el slice verde (si estás en la rama por defecto, crea
antes una rama de trabajo), o di explícitamente por qué no procede commitear.
Este bloqueo ocurre una sola vez por sesión.
EOF
exit 2

#!/usr/bin/env bash
# dotmesh handoff-signal hook — Claude Code PreToolUse hook on the Skill tool.
# Fires when bait-close-day or bait-open-day is invoked and injects the list of
# handoff documents written in the last few days, with their mtime.
#
# Why: the BAIT day-close flow reconstructs a day from four signals (the Jira
# "Trabajando hoy" field, git commits, Jira activity, and what the person
# remembers). None of them sees work that produced no commit — a Notion page, a
# proposal, a review — yet /handoff writes a dated document describing exactly
# that, including three of the four things the close-day grill asks per ticket:
# what got done, what blocked it, what is left. This hook puts those documents
# in front of the agent as data instead of leaving them to be remembered.
#
# What it deliberately does NOT do: infer durations. An mtime is an instant, not
# an interval, so the injected list is only good for proposing rows and for the
# "what got done" text. The rule that time is never invented still holds.
#
# It filters out the flow's OWN handoffs (handoff-jornada-*, handoff-open-day-*):
# those are written from the result of a close, so reading them back as evidence
# would let the close cite itself.
#
# It never blocks: non-blocking additionalContext + exit 0. No jq, no matching
# skill, or no handoffs found all exit silently, so invoking a skill is never
# broken.
#
# Stowed by claude/ to ~/.claude/hooks/ and registered in settings.json under
# hooks.PreToolUse (matcher "Skill").
set -euo pipefail

# Where handoffs live. Widen this list if work moves outside these trees; the
# rest of the script does not care how many roots there are.
HANDOFF_ROOTS=(
  "$HOME/Documents/BAIT/.ai"
  "$HOME"/Documents/BAIT/*/.ai
  "$HOME"/Documents/GitHub/*/.ai
)

# Days back to scan. Three covers the catch-up case (close-day walks every
# pending day since the last close), not just yesterday.
DAYS_BACK=3

# Without jq we cannot read which skill is being invoked; fail open rather than
# break the Skill tool. Warn once per day so a fresh install notices.
if ! command -v jq >/dev/null 2>&1; then
  _jqw="${TMPDIR:-/tmp}/dotmesh-nojq-$(basename "$0" .sh)-$(date +%Y%m%d)"
  # mkdir is the check and the write in one step: it succeeds only for the first
  # caller of the day, and it never follows a symlink in the final component, so
  # a marker pre-seeded in a shared TMPDIR cannot make this hook create or
  # truncate a file elsewhere. Anyone able to pre-seed that path silences the
  # day's warning; the UID check this replaces traded that for re-warning on
  # every single call, which is noisier for no gain. Audited 2026-09-02.
  if mkdir "$_jqw" 2>/dev/null; then
    printf 'dotmesh hook: jq no encontrado; señal de handoffs desactivada (fail-open). Instala jq.\n' >&2
  fi
  exit 0
fi

input=$(cat)
skill=$(printf '%s' "$input" | jq -r '.tool_input.skill // empty')
[ -z "$skill" ] && exit 0

# Only the two day-flow skills. Plugin-qualified names arrive as
# "bait-skills:bait-close-day", so match on the suffix.
case "$skill" in
  *bait-close-day | *bait-open-day) ;;
  *) exit 0 ;;
esac

# Cutoff date for find. BSD date first (this is a Mac), GNU as the fallback.
since=$(date -v-${DAYS_BACK}d +%Y-%m-%d 2>/dev/null || date -d "${DAYS_BACK} days ago" +%Y-%m-%d 2>/dev/null || true)
[ -z "$since" ] && exit 0

# Only roots that exist — an unmatched glob would make find fail under set -e.
roots=()
for r in "${HANDOFF_ROOTS[@]}"; do
  [ -d "$r" ] && roots+=("$r")
done
[ ${#roots[@]} -eq 0 ] && exit 0

found=$(find "${roots[@]}" -iname 'handoff*.md' -newermt "$since" \
          ! -name 'handoff-jornada-*' ! -name 'handoff-open-day-*' \
          -exec stat -f '%Sm  %N' -t '%Y-%m-%d %H:%M' {} \; 2>/dev/null \
        | sort || true)

# Nothing written in the window: stay quiet rather than inject an empty section.
[ -z "$found" ] && exit 0

read -r -d '' preamble <<EOF || true
Señal dotmesh de handoffs (últimos ${DAYS_BACK} días). Documentos de trabajo escritos
en disco, con la hora en que se cerraron. Cubren el trabajo que no dejó commits
(páginas de Notion, propuestas, revisiones), que ninguna otra señal del cierre ve.

Cómo usarlos:
- El apartado de estado dice QUÉ se hizo, los stoppers y lo pendiente: eso alimenta
  el comentario de cierre. El apartado de siguientes pasos es intención, NO actividad;
  no imputes tiempo por él.
- La hora acota el bloque, no la duración. El tiempo lo sigue fijando el usuario.
- Dedupa contra los commits y contra "Trabajando hoy" por clave de Jira antes de
  proponer filas nuevas.

EOF

jq -nc --arg ctx "${preamble}
${found}" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
exit 0

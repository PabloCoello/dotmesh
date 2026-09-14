#!/usr/bin/env bash
# dotmesh skill-loading reminder — Claude Code PreToolUse hook.
# Fires once per agent and class (prose, code), on its first write of each, to
# remind it to load the skill that owns the phase BEFORE it shapes the artifact. It targets a
# recurring failure: executing the flow's shape while working from memory
# instead of invoking the Skill tool (see the dotmesh AGENTS.md flow).
#
# "Its first write" covers Edit/Write/MultiEdit/NotebookEdit and the Bash
# commands that write a file (redirection, tee, an in-place editor). A read-only
# Bash command is ignored.
#
# Why the FIRST edit and not the commit: authoring skills (anti-ai-style,
# castellano-peninsular, the code-simplification YAGNI gate) shape the work as
# it is written. Catching the miss at commit time would force a rewrite — double
# cost. Catching it before the first edit costs only loading the skill, which
# was owed anyway.
#
# What it names depends on the target, not on the language of the conversation:
# a prose file gets the writing pair, anything else gets the code gates. Before
# 2026-09-12 every first write got all three lines, and it showed: of the 251
# sessions that had loaded anti-ai-style, 77 never wrote a prose file.
#
# It never blocks: it injects a non-blocking reminder via additionalContext and
# exits 0. Any failure (no jq, bad input, unwritable tmp) fails open so Edit is
# never broken. Deduped once per agent AND class via a marker keyed on a
# sanitised session_id plus agent_id (no path traversal), so an agent that
# writes code and later a document earns both reminders.
#
# Stowed by claude/ to ~/.claude/hooks/ and registered in settings.json under
# hooks.PreToolUse, in both the "Write|Edit|MultiEdit|NotebookEdit" and the
# "Bash" matchers.
set -euo pipefail

# Without jq we cannot parse the tool input; fail open rather than break Edit.
# Warn once per day so a fresh install notices the guardrail is sleeping.
if ! command -v jq >/dev/null 2>&1; then
  _jqw="${TMPDIR:-/tmp}/dotmesh-nojq-$(basename "$0" .sh)-$(date +%Y%m%d)"
  # mkdir is the check and the write in one step: it succeeds only for the first
  # caller of the day, and it never follows a symlink in the final component, so
  # a marker pre-seeded in a shared TMPDIR cannot make this hook create or
  # truncate a file elsewhere. Anyone able to pre-seed that path silences the
  # day's warning; the UID check this replaces traded that for re-warning on
  # every single call, which is noisier for no gain. Audited 2026-09-02.
  if mkdir "$_jqw" 2>/dev/null; then
    printf 'dotmesh hook: jq no encontrado; guardarraíl desactivado (fail-open). Instala jq.\n' >&2
  fi
  exit 0
fi

input=$(cat)

# A Bash call only counts when it actually writes a file. Registering the hook
# on the Bash matcher is what covers heredocs, tee and sed -i, which is how a
# session writes files when the harness steers it away from Edit and Write.
# Reading is not implementing, so `ls` or `git status` must not burn the single
# reminder this session gets.
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')
cmd=""
if [ "$tool" = "Bash" ]; then
  cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
  [ -z "$cmd" ] && exit 0
  # Drop quoted substrings first, as block-dangerous-git.sh does, so a commit
  # message or a grep pattern containing > does not look like a redirection.
  scan=$(printf '%s' "$cmd" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")
  # Drop redirections to /dev/… one by one, so `mkdir -p x >/dev/null && cat > f`
  # still counts as a write.
  scan=$(printf '%s' "$scan" | sed -E 's#>{1,2}[[:space:]]*/dev/[^[:space:];|&)]*##g')
  writes=0
  # Redirection to a path. The &1/&2 duplications do not match the class.
  printf '%s' "$scan" | grep -qE '>{1,2}[[:space:]]*(\.|/|[A-Za-z0-9_$~])' && writes=1
  # In-place editors and tee.
  printf '%s' "$scan" | grep -qE '(^|[[:space:]])tee([[:space:]]|$)' && writes=1
  printf '%s' "$scan" | grep -qE '(^|[[:space:]])(sed|perl|ruby)([[:space:]]+-[^[:space:]]+)*[[:space:]]+-[A-Za-z]*i' && writes=1
  [ "$writes" -eq 1 ] || exit 0
fi

# Which skills the reminder names depends on what is being written, not on the
# language of the conversation. Measured 2026-09-12 over 756 transcripts: of the
# 251 sessions that loaded anti-ai-style, 77 never wrote a prose file. Naming the
# writing pair on every first write is what put it there, so the target decides.
#
# What decides is the DESTINATION, never the whole command: `cat > hook.sh <<EOF`
# with a heredoc that mentions AGENTS.md writes code, and matching the command
# text would call it prose — the exact defect this branch exists to remove.
es_prosa() {
  case "${1,,}" in
    *.md | *.markdown | *.mdx | *.txt | *.rst | *.adoc | *.asciidoc | *.qmd | *.html | *.htm)
      return 0 ;;
  esac
  return 1
}

clase="codigo"
if [ "$tool" = "Bash" ]; then
  # $scan already has the quoted substrings and the /dev/… redirections dropped.
  # Redirection targets first; tee and the in-place editors leave their file as
  # the last word, which is the fallback. A case glob, not a pipe into grep, so
  # a heredoc bigger than the pipe buffer cannot make pipefail lose the match.
  destinos=$(printf '%s' "$scan" | sed -E 's/>{1,2}[[:space:]]*/\n/g' | sed -E 's/[[:space:];|&)<].*$//' | tail -n +2)
  [ -z "$destinos" ] && destinos=${scan##* }
  while IFS= read -r destino; do
    if [ -n "$destino" ] && es_prosa "$destino"; then clase="prosa"; break; fi
  done <<EOF
$destinos
EOF
else
  ruta=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
  es_prosa "$ruta" && clase="prosa"
fi

# Dedupe once per agent, not once per session. Subagents inherit the parent's
# session_id (measured 2026-08-31), so keying the marker on it alone means the
# orchestrator's first edit silences every `build` that follows, which is the
# agent that writes almost all the code. agent_id separates them.
# Both ids are sanitised so a crafted value cannot escape the tmp dir.
sid=$(printf '%s' "$input" | jq -r '.session_id // empty' | tr -cd 'A-Za-z0-9_-')
aid=$(printf '%s' "$input" | jq -r '.agent_id // empty' | tr -cd 'A-Za-z0-9_-')
[ -z "$sid" ] && sid="nosession"
[ -z "$aid" ] && aid="main"
# El marcador lleva la clase: un agente que escribe código y luego un documento
# merece los dos avisos, y sin la clase el primero silenciaba al segundo.
marker="${TMPDIR:-/tmp}/dotmesh-skill-reminder-${sid}-${aid}-${clase}"
# mkdir is the check and the write in one step: it never follows a symlink in the
# final component, so a marker pre-seeded in a shared TMPDIR cannot make this
# hook create or truncate a file elsewhere, and it succeeds for exactly one
# caller. When it fails the reminder is skipped, which is the cheap direction for
# a hook that only nudges. Audited 2026-09-02.
mkdir "$marker" 2>/dev/null || exit 0

if [ "$clase" = "prosa" ]; then
  read -r -d '' msg <<'EOF' || true
Recordatorio dotmesh (uno por agente y tipo de fichero): vas a redactar un documento. Carga la
skill que posee esta fase con la herramienta Skill ANTES de escribir, no de
memoria:
- prosa que se entrega -> anti-ai-style, en el idioma que sea
- si el documento va en español -> además castellano-peninsular
Haber leído el fichero no sustituye a cargar la skill.
EOF
else
  read -r -d '' msg <<'EOF' || true
Recordatorio dotmesh (uno por agente y tipo de fichero): vas a implementar. Carga la skill que
posee esta fase con la herramienta Skill ANTES de escribir, no de memoria:
- antes de escribir código -> la puerta YAGNI de code-simplification
- comportamiento ligado a docs/APIs externas -> source-driven-development
Haber leído el fichero no sustituye a cargar la skill.
EOF
fi

jq -nc --arg ctx "$msg" \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$ctx}}'
exit 0

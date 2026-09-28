#!/bin/sh
# PostToolUse hook on Artifact: after the first publish of an artifact, inside a
# herdr pane with terminal-browser installed, it tells the agent to offer opening
# the artifact in a pane beside the conversation. It only offers: opening is the
# user's call.
#
# The Artifact tool only publishes to artifacts the user owns, so a publish is
# already one of their own pages. The response's `audience` field is who can
# view the artifact (owner, users, org, public), not who wrote it, and it is
# optional, so the hook does not look at it.
#
# Silent whenever a condition fails: outside herdr, without terminal-browser or
# jq, on a republish (an open view refreshes by itself), or on a URL that is not
# a claude.ai artifact. It never blocks.
set -eu

[ "${HERDR_ENV:-}" = "1" ] || exit 0
command -v terminal-browser >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0

# Only a URL of that exact shape reaches the context, so nothing else in the
# tool response can ride into it. \A and \z anchor the whole string: $ would
# let a trailing newline through. Both the long form (code/artifact/<uuid>)
# and the short one (artifact/<id>) are accepted.
url=$(jq -r '
  .tool_response
  | select(type == "object" and .updated != true)
  | .url
  | select(type == "string" and test("\\Ahttps://claude\\.ai/(code/)?artifact/[A-Za-z0-9_-]+\\z"))
' 2>/dev/null) || exit 0
[ -n "$url" ] || exit 0

jq -nc --arg url "$url" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: (
  "Señal dotmesh: acabas de publicar un artefacto y esta sesión corre en un pane de herdr con Terminal Browser instalado. "
  + "Al dar el enlace, ofrece al usuario abrirlo en un pane junto a la conversación. "
  + "Si acepta, lanza solo este comando fuera del sandbox de Bash, porque dentro falla al escribir su estado: "
  + "terminal-browser open " + $url + " --split right")}}'
exit 0

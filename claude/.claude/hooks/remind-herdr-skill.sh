#!/bin/sh
# SessionStart hook: when the session runs inside a herdr pane, remind the
# agent that the `herdr` skill owns pane orchestration. stdout from a
# SessionStart hook is injected into the session context.
set -eu

[ "${HERDR_ENV:-}" = "1" ] || exit 0

cat <<'EOF'
Recordatorio dotmesh: esta sesión corre dentro de un pane de herdr
(HERDR_ENV=1). La skill `herdr` posee la orquestación de panes: cárgala con la
herramienta Skill antes de lanzar procesos largos (servidores, tests) en panes
hermanos, leer o esperar la salida de otros panes (`herdr wait`) o coordinarte
con otros agentes de la sesión.
EOF
exit 0

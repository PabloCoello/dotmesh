#!/usr/bin/env bash
# dotmesh statusline para Claude Code.
# Muestra: modelo · barra de contexto · % · rama de git · coste de sesión.
# Filosofía dotmesh (docs/DESIGN.md): cromo monocromo en grafito, el color solo
# donde significa estado. La barra de contexto escala sage → gold → rose por
# umbral de llenado; la rama lleva el glifo en sage como el prompt.
#
# Claude Code invoca este script pasándole el estado de la sesión como JSON por
# stdin. Lo stowa claude/ a ~/.claude/statusline.sh y lo activa settings.json.
set -euo pipefail

input=$(cat)

# --- Paleta dotmesh (truecolor ANSI) ---
RESET=$'\033[0m'
TXT=$'\033[38;2;206;206;206m'   # #cecece  texto primario
DIM=$'\033[38;2;110;110;110m'   # #6e6e6e  atenuado (cromo)
SEC=$'\033[38;2;158;158;158m'   # #9e9e9e  secundario
EMPTY=$'\033[38;2;66;66;66m'    # #424242  hueco de la barra
SAGE=$'\033[38;2;168;203;160m'  # #A8CBA0  ok / git
GOLD=$'\033[38;2;227;197;138m'  # #E3C58A  aviso
ROSE=$'\033[38;2;229;154;154m'  # #E59A9A  alerta

# Sin jq no parseamos el JSON con garantías: degradamos a una línea mínima.
if ! command -v jq >/dev/null 2>&1; then
  printf '%sclaude%s %s(instala jq para la statusline dotmesh)%s' \
    "$TXT" "$RESET" "$DIM" "$RESET"
  exit 0
fi

model=$(printf '%s' "$input" | jq -r '.model.display_name // "claude"')
pct=$(printf '%s' "$input" | jq -r '.context_window.used_percentage // 0' | cut -d. -f1)
cwd=$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty')
cost=$(printf '%s' "$input" | jq -r '.cost.total_cost_usd // 0')

# Color de la barra según el llenado del contexto.
if   [ "$pct" -ge 85 ]; then fill="$ROSE"
elif [ "$pct" -ge 60 ]; then fill="$GOLD"
else                         fill="$SAGE"
fi

# Barra de 10 caracteres: ▓ lleno, ░ hueco.
filled=$(( pct / 10 ))
[ "$filled" -gt 10 ] && filled=10
bar=""
i=0
while [ "$i" -lt 10 ]; do
  if [ "$i" -lt "$filled" ]; then bar="${bar}▓"; else bar="${bar}░"; fi
  i=$(( i + 1 ))
done

# Rama de git (solo si el cwd está dentro de un repo).
branch=""
if [ -n "$cwd" ] && git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  branch=$(git -C "$cwd" branch --show-current 2>/dev/null || true)
fi

# Coste a 2 decimales.
cost_fmt=$(printf '%.2f' "$cost" 2>/dev/null || printf '0.00')

# --- Ensamblado ---
out="${TXT}${model}${RESET} ${fill}${bar}${RESET} ${SEC}${pct}%${RESET}"
[ -n "$branch" ] && out="${out}  ${SAGE}⎇${RESET} ${DIM}${branch}${RESET}"
out="${out}  ${DIM}\$${cost_fmt}${RESET}"

printf '%s' "$out"

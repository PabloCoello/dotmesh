#!/usr/bin/env bash
# dotmesh statusline para Claude Code.
# Muestra: modelo · barra de contexto · tokens absolutos · rama de git · coste.
# Filosofía dotmesh (docs/DESIGN.md): cromo monocromo en grafito, el color solo
# donde significa estado. La barra de contexto escala sage → gold → rose por
# tokens absolutos en uso; la rama lleva el glifo en sage como el prompt.
#
# Mide tokens ABSOLUTOS, no el % contra la ventana: con modelos de 1M, 100k se
# verían como ~10% y nunca avisarían, pero la calidad cae mucho antes de llenar
# la ventana. Los umbrales marcan la zona real de degradación, no el techo.
#
# Claude Code invoca este script pasándole el estado de la sesión como JSON por
# stdin. Lo stowa claude/ a ~/.claude/statusline.sh y lo activa settings.json.
set -euo pipefail

# Umbrales en miles de tokens (ajustables): aviso, alerta y techo de la barra.
WARN_K=90; ALERT_K=160; CEIL_K=200

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
tokens=$(printf '%s' "$input" | jq -r '.context_window.total_input_tokens // ((.context_window.current_usage.input_tokens // 0) + (.context_window.current_usage.cache_creation_input_tokens // 0) + (.context_window.current_usage.cache_read_input_tokens // 0)) // 0')
cwd=$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty')
cost=$(printf '%s' "$input" | jq -r '.cost.total_cost_usd // 0')

# Saneado: entero o 0.
tokens=${tokens%%.*}
[[ "$tokens" =~ ^[0-9]+$ ]] || tokens=0

# Color de la barra por tokens absolutos en uso.
if   [ "$tokens" -ge $((ALERT_K * 1000)) ]; then fill="$ROSE"
elif [ "$tokens" -ge $((WARN_K * 1000)) ];  then fill="$GOLD"
else                                             fill="$SAGE"
fi

# Barra de 10 caracteres contra el techo práctico (CEIL_K), no contra la ventana.
filled=$(( tokens * 10 / (CEIL_K * 1000) ))
[ "$filled" -gt 10 ] && filled=10
[ "$filled" -lt 0 ] && filled=0
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

# Tokens legibles: "118k" a partir de 1000, si no el valor crudo.
if [ "$tokens" -ge 1000 ]; then used="$(( tokens / 1000 ))k"; else used="$tokens"; fi

# --- Ensamblado ---
out="${TXT}${model}${RESET} ${fill}${bar}${RESET} ${SEC}${used}${RESET}"
[ -n "$branch" ] && out="${out}  ${SAGE}⎇${RESET} ${DIM}${branch}${RESET}"
out="${out}  ${DIM}\$${cost_fmt}${RESET}"

printf '%s' "$out"

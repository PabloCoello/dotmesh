#!/usr/bin/env bash
#
# Instala el Assistant de dotmesh (ADR 0004): el herdr-task vendorizado, el lanzador
# `assistant`, las plantillas del worker y del revisor y los ajustes iniciales.
#
# - Enlaza ~/.local/bin/herdr-task y ~/.local/bin/assistant con este checkout.
# - Enlaza worker.md y reviewer.md en ~/.config/herdr-core/templates, donde herdr-task
#   los lee. Una plantilla que no sea este enlace se copia antes a ~/dotfiles-backup.
# - Siembra ~/.herdr/shepherdr.json solo si falta: fusión local con confirmación,
#   revisor claude, una ronda de revisión, sin proof y sin Autopilot.
# - Se niega si hay un shepherdr instalado o un ~/.herdr que no creó él: esta copia no
#   convive con otra (assistant/vendor/PATCHES.md). La marca ~/.herdr/.dotmesh-assistant
#   guarda la ruta del checkout; si el checkout se mueve, los enlaces viejos se rehacen.
#
# No usa sudo, no toca ~/.claude/settings.json ni ~/.codex/hooks.json y no arranca nada.
# Idempotente: la segunda ejecución no cambia ningún fichero.
#
# Uso: install.sh            instala
#      install.sh --status   informa de la deriva (salida 1 si falta algo)
#
# Códigos de salida: 1 requisito, plataforma o uso · 3 instalación ajena.
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BIN="$HOME/.local/bin"
TEMPLATES="$HOME/.config/herdr-core/templates"
STORE="$HOME/.herdr"
MARKER="$STORE/.dotmesh-assistant"
SETTINGS="$STORE/shepherdr.json"
# Lo que se enlaza: ruta dentro del checkout y destino, en paralelo.
SRCS=(assistant/vendor/herdr-task/herdr-task assistant/bin/assistant
      assistant/templates/worker.md assistant/templates/reviewer.md)
DSTS=("$BIN/herdr-task" "$BIN/assistant" "$TEMPLATES/worker.md" "$TEMPLATES/reviewer.md")
# Solo los binarios se niegan si son ajenos; una plantilla ajena se guarda y se sustituye.
GUARDED=2

ok()   { echo "  ok  $*"; }
warn() { echo "  --  $*"; }
die()  { echo "  --  $1" >&2; exit "${2:-1}"; }

old_root() { [ -f "$MARKER" ] && head -n 1 "$MARKER" || true; }
# El destino ya apunta a este checkout, o al checkout que registró la marca.
linked() { [ -L "$2" ] && [ "$(readlink "$2")" = "$REPO_ROOT/$1" ]; }
ours() {
  local old; old="$(old_root)"
  linked "$1" "$2" || { [ -n "$old" ] && [ -L "$2" ] && [ "$(readlink "$2")" = "$old/$1" ]; }
}

status() {
  local bad=0 i
  if command -v hc >/dev/null 2>&1; then ok "assistant: hc"; else warn "assistant: falta hc (instala herdr-core)"; bad=1; fi
  if command -v shepherdr >/dev/null 2>&1; then
    warn "assistant: hay un shepherdr instalado; esta copia no convive con él (assistant/vendor/PATCHES.md)"; bad=1
  fi
  for i in "${!SRCS[@]}"; do
    if linked "${SRCS[$i]}" "${DSTS[$i]}"; then ok "assistant: $(basename "${DSTS[$i]}") enlazado a dotmesh"
    else warn "assistant: $(basename "${DSTS[$i]}") sin enlazar (corre 'make assistant-install')"; bad=1; fi
  done
  if [ -f "$SETTINGS" ]; then ok "assistant: ajustes en ~/.herdr/shepherdr.json"
  else warn "assistant: faltan los ajustes ~/.herdr/shepherdr.json (corre 'make assistant-install')"; bad=1; fi
  # Una tarea con pull request o un main_watch reactivan gh y git fetch (PATCHES.md).
  if [ -d "$STORE/tasks" ] && grep -rlqE '"(pr|main_watch)"[[:space:]]*:' "$STORE/tasks" 2>/dev/null; then
    warn "assistant: el almacén tiene tareas con pull request o main_watch; no son de esta copia"; bad=1
  fi
  # Los enlaces apuntan a este checkout: un cambio sin confirmar ahí corre fuera del sandbox.
  if ! git -c core.fsmonitor=false --no-optional-locks -C "$REPO_ROOT" status --porcelain \
        -- assistant/vendor assistant/bin assistant/templates 2>/dev/null | { ! read -r _; }; then
    warn "assistant: hay cambios sin confirmar en assistant/{vendor,bin,templates}; revísalos"; bad=1
  fi
  case ":$PATH:" in
    *":$BIN:"*) ;;
    *) warn "assistant: $BIN no está en el PATH; los workers no reconocerían 'herdr-task'"; bad=1 ;;
  esac
  return "$bad"
}

case "$#:${1:-}" in
  0:) ;;
  1:--status) status && exit 0 || exit 1 ;;
  *) die "uso: install.sh [--status]" 1 ;;
esac

case "$(uname -s)" in
  Darwin|Linux) ;;
  *) die "assistant: solo macOS y Linux" 1 ;;
esac
command -v python3 >/dev/null 2>&1 || die "assistant: falta python3, que ejecuta herdr-task" 1
command -v git >/dev/null 2>&1 || die "assistant: falta git" 1

# Una instalación ajena se detecta antes de escribir nada.
if command -v shepherdr >/dev/null 2>&1; then
  die "assistant: hay un shepherdr instalado ($(command -v shepherdr)); esta copia no convive con él" 3
fi
if [ ! -e "$MARKER" ] && [ -d "$STORE" ] && [ -n "$(ls -A "$STORE")" ]; then
  die "assistant: $STORE tiene contenido que no creó este instalador; retíralo o muévelo antes" 3
fi
for ((i = 0; i < GUARDED; i++)); do
  dst="${DSTS[$i]}"
  if { [ -e "$dst" ] || [ -L "$dst" ]; } && ! ours "${SRCS[$i]}" "$dst"; then
    die "assistant: $dst ya existe y no apunta a un checkout de dotmesh registrado; no lo piso" 3
  fi
done
for dst in "${DSTS[@]}"; do
  [ -d "$dst" ] && die "assistant: $dst es un directorio; no lo piso" 3
done

if [ ! -e "$MARKER" ]; then
  mkdir -p -m 700 "$STORE"
  echo "$REPO_ROOT" > "$MARKER"
  ok "assistant: almacén ~/.herdr marcado como de dotmesh"
fi

# Enlace creado en un directorio temporal junto al destino y renombrado encima: un solo
# rename(2), sin hueco y sin nombre temporal predecible.
link() {
  local src="$REPO_ROOT/$1" dst="$2"
  if linked "$1" "$dst"; then ok "assistant: $(basename "$dst") ya enlazado"; return; fi
  mkdir -p "$(dirname "$dst")"
  if { [ -e "$dst" ] || [ -L "$dst" ]; } && ! ours "$1" "$dst"; then
    local rel="${dst#"$HOME"/}"
    local backup; backup="$HOME/dotfiles-backup/$(date +%Y%m%d-%H%M%S)/$(dirname "$rel")"
    mkdir -p "$backup"
    cp -P "$dst" "$backup/"
    ok "assistant: copia de $(basename "$dst") en $backup"
  fi
  local tmp; tmp="$(mktemp -d "$(dirname "$dst")/.dotmesh.XXXXXX")"
  ln -s "$src" "$tmp/link"
  mv -f "$tmp/link" "$dst"
  rmdir "$tmp"
  ok "assistant: $(basename "$dst") enlazado a dotmesh"
}

for i in "${!SRCS[@]}"; do
  link "${SRCS[$i]}" "${DSTS[$i]}"
done
if [ "$(old_root)" != "$REPO_ROOT" ]; then
  echo "$REPO_ROOT" > "$MARKER"
  ok "assistant: la marca apunta ahora a $REPO_ROOT"
fi

# Los ajustes son del usuario desde el momento en que existen: solo se siembran si faltan.
# "off" apaga lo que herdr-task haría en segundo plano para add-ons que dotmesh no instala
# (navegador, chat de la app, otras máquinas); con "chat" fuera, un Assistant vivo tampoco
# recibe aviso cuando cambian sus ajustes. Sin clave "autopilot": viene apagado y el usuario
# lo enciende por espacio.
if [ -e "$SETTINGS" ]; then
  ok "assistant: ajustes existentes, sin tocar"
else
  tmp="$(mktemp "$STORE/.shepherdr.XXXXXX")"
  cat > "$tmp" <<'JSON'
{
  "everywhere": {
    "tasks": {
      "merge": "ask",
      "proof": false,
      "review_rounds": 1,
      "must_fix": "major",
      "worktrees": true,
      "max_running": 3
    },
    "reviewer": {"agent": "claude"},
    "agents": {"reactions": false},
    "off": ["browser", "chat", "machines"]
  }
}
JSON
  mv "$tmp" "$SETTINGS"
  ok "assistant: ajustes sembrados en ~/.herdr/shepherdr.json"
fi

command -v hc >/dev/null 2>&1 || warn "assistant: falta hc; herdr-task no arranca tareas sin herdr-core"
case ":$PATH:" in
  *":$BIN:"*) ;;
  *) warn "assistant: $BIN no está en el PATH" ;;
esac

#!/usr/bin/env bash
# Propaga el bloque `hooks` de la plantilla del repo al settings.json vivo.
#
# `claude/.claude/settings.json` no se stowea a propósito (está en
# `claude/.stow-local-ignore`): es una plantilla que `make seed-claude-settings`
# siembra una vez y nunca sobreescribe, para que los ajustes por máquina no
# aparezcan como cambios sin commitear. El precio es que un hook nuevo en el
# repo no llega jamás a una máquina ya instalada.
#
# Este script paga ese precio sobre una sola clave. `hooks` registra ficheros
# del repositorio, así que pertenece al repo; el resto de settings.json
# pertenece a la máquina y no se toca.
#
# Uso:
#   sync-claude-hooks.sh            fusiona la clave `hooks` (con backup)
#   sync-claude-hooks.sh --check    no escribe; solo informa
#
# Códigos de salida:
#   0  alineado (o fusionado con éxito)
#   1  hay deriva (solo con --check)
#   2  no se puede decidir: falta jq, falta el destino, es un symlink o el JSON
#      no es válido
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SRC="${CLAUDE_SETTINGS_SRC:-$REPO_ROOT/claude/.claude/settings.json}"
DST="${CLAUDE_SETTINGS_DST:-$HOME/.claude/settings.json}"

CHECK=0
case "${1:-}" in
  --check) CHECK=1 ;;
  "") ;;
  *) echo "uso: $(basename "$0") [--check]" >&2; exit 2 ;;
esac

undecidable() { echo "  --  $*"; exit 2; }

command -v jq >/dev/null 2>&1 || undecidable "jq no encontrado; requerido para comparar el bloque hooks"
[ -f "$SRC" ] || undecidable "plantilla ausente: $SRC"
[ -L "$DST" ] && undecidable "$DST es un symlink de una instalación antigua (ver 'make seed-claude-settings')"
[ -e "$DST" ] || undecidable "$DST no existe (corre 'make seed-claude-settings')"
jq -e . "$SRC" >/dev/null 2>&1 || undecidable "la plantilla no es JSON válido: $SRC"
jq -e . "$DST" >/dev/null 2>&1 || undecidable "no es JSON válido: $DST"

# Aplana el bloque hooks a una línea por hook registrado, para poder decir qué
# entra y qué sale en vez de un "difieren" a secas.
flatten() {
  jq -r '(.hooks // {}) | to_entries[] as $e
         | $e.value[]
         | (.matcher // "*") as $m
         | (.hooks // [])[]
         | "\($e.key) [\($m)] \(.command)"' "$1" | sort
}

TMP=$(mktemp -d -p "${TMPDIR:-/tmp}" synchooks.XXXXXX)
trap 'rm -rf "$TMP"' EXIT

flatten "$SRC" > "$TMP/plantilla"
flatten "$DST" > "$TMP/vivo"

ADDED=$(comm -23 "$TMP/plantilla" "$TMP/vivo")
REMOVED=$(comm -13 "$TMP/plantilla" "$TMP/vivo")

if [ -z "$ADDED" ] && [ -z "$REMOVED" ]; then
  echo "  ok  hooks de Claude alineados con la plantilla"
  exit 0
fi

report() {
  [ -n "$ADDED" ] && printf '%s\n' "$ADDED" | sed 's/^/      + /'
  [ -n "$REMOVED" ] && printf '%s\n' "$REMOVED" | sed 's/^/      - /'
  return 0
}

if [ "$CHECK" = 1 ]; then
  echo "  --  hooks de Claude desalineados (corre 'make sync-claude-hooks')"
  report
  exit 1
fi

echo "  ..  fusionando el bloque hooks en $DST"
report

BACKUP_DIR="$HOME/dotfiles-backup/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cp "$DST" "$BACKUP_DIR/claude-settings.json"
echo "  ok  copia previa en $BACKUP_DIR/claude-settings.json"

# Solo la clave hooks; el resto del fichero vivo se conserva tal cual. El
# temporal va al lado del destino para que el mv final sea un rename dentro del
# mismo sistema de ficheros: si jq falla, el destino no se ha tocado.
NUEVO="$DST.dotmesh-sync.$$"
trap 'rm -rf "$TMP"; rm -f "$NUEVO"' EXIT
jq --slurpfile plantilla "$SRC" '.hooks = $plantilla[0].hooks' "$DST" > "$NUEVO"
jq -e . "$NUEVO" >/dev/null
chmod --reference="$DST" "$NUEVO" 2>/dev/null || true
mv "$NUEVO" "$DST"
echo "  ok  bloque hooks actualizado; reinicia las sesiones de Claude abiertas"

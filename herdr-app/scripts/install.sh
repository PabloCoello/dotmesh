#!/usr/bin/env bash
#
# Enlaza ~/.config/herdr-app/keys.json con el de dotmesh.
#
# No pasa por Stow. herdr-app escribe su keys.json por defecto en cuanto el fichero
# falta, también con la app abierta, así que en cualquier máquina donde la app haya
# arrancado una vez Stow encuentra un fichero real y aborta. Un `mv` previo tampoco
# basta: la app lo regenera antes de que llegue el enlace (medido el 05-11-2026).
# Por eso el script crea el enlace con otro nombre y lo renombra encima, en un solo
# rename(2), y guarda antes una copia del fichero que sustituye.
#
# Solo macOS: el fichero lleva los atajos por defecto de la app en macOS (cmd-*,
# app.hide) y en otra plataforma no tendrían efecto.
#
# Idempotente. Códigos de salida: 1 plataforma · 2 app sin arrancar nunca.
set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$REPO_ROOT/herdr-app/.config/herdr-app/keys.json"
APP_HOME="$HOME/.config/herdr-app"
DST="$APP_HOME/keys.json"

ok()  { echo "  ok  $*"; }
die() { echo "  --  $1" >&2; exit "${2:-1}"; }

[ "$(uname -s)" = "Darwin" ] || die "herdr-app: keys.json es la variante de macOS; en esta plataforma no se instala" 1
[ -d "$APP_HOME" ] || die "herdr-app: no existe $APP_HOME; abre la app una vez y vuelve a ejecutar esto" 2

if [ -L "$DST" ] && [ "$(cd "$APP_HOME" && cd "$(dirname "$(readlink "$DST")")" && pwd)/keys.json" = "$SRC" ]; then
  ok "herdr-app: keys.json ya enlazado"
  exit 0
fi

if [ -e "$DST" ] || [ -L "$DST" ]; then
  BACKUP="$HOME/dotfiles-backup/$(date +%Y%m%d-%H%M%S)/.config/herdr-app"
  mkdir -p "$BACKUP"
  cp -P "$DST" "$BACKUP/keys.json"
  ok "herdr-app: copia del keys.json anterior en $BACKUP"
fi

TMP="$DST.dotmesh.$$"
ln -s "$SRC" "$TMP"
mv -f "$TMP" "$DST"
ok "herdr-app: keys.json enlazado a dotmesh"

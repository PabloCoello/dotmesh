#!/usr/bin/env bash
#
# Installs Terminal Browser at dotmesh's pinned release, applies the site
# isolation patch that makes claude.ai artifacts usable inside a herdr pane,
# hardens it (no web MIDI, no downloads) and caps its frame rate, which is what
# keeps a pane responsive.
#
# Mirrors upstream's installer (https://terminal-browser.sh/install) with three
# changes: the version and checksums are pinned here instead of served as
# "latest"; the download is skipped when the pinned version is already in place,
# so a re-run never closes open browsers; and no sudo. Upstream's `setup` writes
# an AppArmor profile with sudo when the kernel asks for one; here that step is
# skipped and printed as an instruction instead. Idempotent.
#
# Exit codes: 1 platform · 2 download · 3 patch, hardening or frame cap.
set -e
set -o pipefail

# Pin. Synced with scripts/vendor/upstreams.tsv. Bump: TB_TAG and the four sums
# below, then check that site-isolation.sh, harden.sh and tune.sh still find
# their anchors. When this pin was adopted, GitHub's asset digests and upstream's
# latest.json agreed.
TB_TAG="v0.8.1"
TB_REPO="zenbu-labs/terminal-browser"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
BIN_HOME="${XDG_BIN_HOME:-$HOME/.local/bin}"
APP="$DATA_HOME/terminal-browser/app"

ok()   { echo "  ok  $*"; }
warn() { echo "  !!  $*"; }
info() { echo "→ $*"; }
die()  { echo "  --  $1" >&2; exit "${2:-1}"; }

# --- 1. Platform ------------------------------------------------------------
# The point is opening artifacts in a herdr pane, and herdr does not run on WSL.
if [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qi microsoft /proc/version 2>/dev/null; then
  ok "terminal-browser-install no aplica en WSL (herdr no disponible); no-op"
  exit 0
fi
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)               TARGET=linux-x64;    SHA256=35e78089d1089dc4f492bbd7d2a03d57ed5543b4394b4fddf3be57c75b77747e ;;
  Linux-aarch64|Linux-arm64)  TARGET=linux-arm64;  SHA256=7f90d97003eedd6ac62e61c82290ffd280f2f0e8f266911f70ab0fbac8a102fe ;;
  Darwin-arm64)               TARGET=darwin-arm64; SHA256=3b0e034d557986ab9289aa8baefdca5c3eb66aa493e27110f4e82c05f224a738 ;;
  Darwin-x86_64)              TARGET=darwin-x64;   SHA256=51645cfdf0428b439434776b5c2c21e50ea1200ea618c742cb3f5d65717f79dd ;;
  *) die "plataforma no soportada por Terminal Browser ($(uname -s) $(uname -m))" 1 ;;
esac

# --- 2. The app -------------------------------------------------------------
INSTALLED="$(cat "$APP/VERSION" 2>/dev/null || true)"
NEWEST="$(printf '%s\n%s\n' "$INSTALLED" "$TB_TAG" | sort -V | tail -n 1)"
if [ "$INSTALLED" = "$TB_TAG" ]; then
  ok "terminal-browser $TB_TAG ya instalado"
elif [ -n "$INSTALLED" ] && [ "$NEWEST" = "$INSTALLED" ]; then
  # Newer than the pin, most likely `terminal-browser upgrade`. Going back would hand
  # a newer Chromium profile to an older browser, and that can cost the claude.ai
  # login. Warn and leave it; the patch below still checks its anchor.
  warn "instalada $INSTALLED, más nueva que el pin $TB_TAG; no se toca."
  warn "Para volver al pin, a riesgo de perder la sesión de claude.ai:  rm -rf \"$APP\" && $0"
else
  command -v curl >/dev/null || die "falta curl" 2
  TMP="$(mktemp -d)"
  # A half-extracted $APP.new would leave hundreds of MB behind.
  trap 'rm -rf "$TMP" "$APP.new"' EXIT
  TARBALL="$TMP/terminal-browser.tar.gz"
  info "descargando terminal-browser $TB_TAG ($TARGET, unos 135 MB)"
  curl -fL --retry 3 --retry-delay 2 --progress-bar -o "$TARBALL" \
    "https://github.com/$TB_REPO/releases/download/$TB_TAG/terminal-browser-$TARGET.tar.gz" \
    || die "la descarga ha fallado" 2
  if command -v sha256sum >/dev/null; then
    GOT="$(sha256sum "$TARBALL" | cut -d' ' -f1)"
  else
    GOT="$(shasum -a 256 "$TARBALL" | cut -d' ' -f1)"
  fi
  [ "$GOT" = "$SHA256" ] || die "el SHA-256 no coincide con el pin (esperado $SHA256, recibido $GOT); no se instala nada" 2
  ok "SHA-256 verificado contra el pin"

  rm -rf "$APP.new" "$APP.old"
  mkdir -p "$APP.new"
  tar -xzf "$TARBALL" -C "$APP.new" --strip-components 1 || die "no se ha podido extraer el paquete" 2
  [ "$(cat "$APP.new/VERSION" 2>/dev/null || true)" = "$TB_TAG" ] \
    || die "el paquete descargado no declara la versión $TB_TAG" 2
  # A daemon of the replaced install keeps running its old files, even deleted ones.
  if pkill -f "$APP/browser/dist/main.js" 2>/dev/null; then
    info "cerrados los navegadores abiertos: corrían la instalación sustituida"
  fi
  # The old install goes aside first, so a failed swap can put it back.
  [ ! -e "$APP" ] || mv "$APP" "$APP.old" || die "no se ha podido apartar $APP" 2
  mv "$APP.new" "$APP" || {
    [ ! -e "$APP.old" ] || mv "$APP.old" "$APP" \
      || die "no se ha podido sustituir $APP; la instalación anterior está en $APP.old" 2
    die "no se ha podido sustituir $APP" 2
  }
  rm -rf "$APP.old"
  ok "instalado en $APP"
fi

# --- 3. The command in PATH -------------------------------------------------
# The same wrapper upstream writes. It is rewritten only when it differs, and a
# symlink is left alone: writing through it would clobber whatever it points to.
WRAPPER="$BIN_HOME/terminal-browser"
WANT="#!/bin/sh
exec \"$APP/bin/terminal-browser\" \"\$@\""
if [ -L "$WRAPPER" ]; then
  warn "$WRAPPER es un symlink; no se toca. Debería ejecutar $APP/bin/terminal-browser"
elif [ "$(cat "$WRAPPER" 2>/dev/null || true)" != "$WANT" ]; then
  mkdir -p "$BIN_HOME"
  printf '%s\n' "$WANT" > "$WRAPPER"
  chmod +x "$WRAPPER"
  ok "comando en $WRAPPER"
fi

# --- 4. System libraries ----------------------------------------------------
if [ "$(uname -s)" = Linux ]; then
  MISSING="$(ldd "$APP/electron/electron" 2>/dev/null | awk '/not found/{print $1}' | sort -u | tr '\n' ' ' || true)"
  [ -z "$MISSING" ] || warn "faltan librerías del sistema: $MISSING(sudo apt-get install libnss3 libgtk-3-0 libasound2t64 libgbm1)"
fi

# --- 5. Upstream setup ------------------------------------------------------
# Links its agent skill into ~/.claude/skills, ~/.agents/skills and ~/.codex/skills,
# and turns on terminal images in every VS Code-family settings.json. dotmesh's is a
# symlink into the repo that already carries that line. The CLI reruns this on its
# own after an upgrade, so skipping it here would only postpone it.
TERMINAL_BROWSER_SKIP_APPARMOR=1 "$APP/bin/terminal-browser" setup \
  || warn "terminal-browser setup ha fallado: puede faltar la skill o las imágenes del editor"

# --- 6. The hardening and the patches ---------------------------------------
# Hardening first: they work in any order, and a patch refused after an upgrade
# must not leave the browser unhardened as well.
bash "$SCRIPT_DIR/harden.sh" \
  || die "sin endurecer: las páginas conservan el MIDI y las descargas" 3
bash "$SCRIPT_DIR/tune.sh" \
  || die "sin tope de fps: el navegador satura un núcleo y responde con retraso" 3
bash "$SCRIPT_DIR/site-isolation.sh" \
  || die "sin el parche, los artefactos no aceptan scroll, selección ni comentarios" 3

# --- 7. What is left --------------------------------------------------------
PENDING=""
# Chromium's sandbox needs unprivileged user namespaces. Where AppArmor restricts
# them (Ubuntu 24.04 and later) the kernel grants them per binary through a profile,
# which only root can write. The profile is keyed to the binary path, so it survives
# upgrades and is a one-time step per machine.
if [ "$(uname -s)" = Linux ] \
   && [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null || true)" = 1 ] \
   && [ ! -u "$APP/electron/chrome-sandbox" ]; then
  PROFILE="/etc/apparmor.d/terminal-browser-$(printf '%s' "$(readlink -f "$APP/electron/electron")" | sha256sum | cut -c1-12)"
  if [ -f "$PROFILE" ]; then
    ok "perfil AppArmor en $PROFILE"
  else
    PENDING="  Perfil AppArmor, una sola vez por máquina (pide sudo):
       bash \"$APP/scripts/apparmor.sh\"
"
  fi
fi
case ":$PATH:" in
  *":$BIN_HOME:"*) ;;
  *) PENDING="$PENDING  Añadir $BIN_HOME al PATH.
" ;;
esac

cat <<EOF

Terminal Browser listo. Para abrir un artefacto junto a la conversación:
  terminal-browser open <url del artefacto> --split right
La primera vez inicia sesión en claude.ai dentro del navegador; el perfil persiste.
Úsalo solo con páginas propias y actualízalo con este script, nunca con
'terminal-browser upgrade'. Reglas y trampas: terminal-browser/README.md
EOF
[ -z "$PENDING" ] || printf '\nQueda pendiente:\n%s' "$PENDING"

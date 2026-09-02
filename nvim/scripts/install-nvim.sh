#!/usr/bin/env bash
#
# Instala Neovim en ~/.local/bin/nvim sin sudo.
#
# Idempotente: si nvim ya cumple el umbral de versión, termina en ok sin
# descargar nada.
#
# La release está fijada (tag + SHA-256), no se resuelve a "latest". Neovim no
# publica checksums ni firmas junto a sus artefactos, así que el pin de este
# fichero ES la referencia de integridad: se verificó a mano al adoptarlo y se
# repite en scripts/vendor/upstreams.tsv. Un binario que no case con el hash
# aborta la instalación. Para subir de versión, cambia NVIM_TAG, descarga el
# AppImage, comprueba su sha256sum y actualiza NVIM_SHA256 y el TSV.
#
# Ubuntu 24.04.4 incluye FUSE 3 por defecto. Si el AppImage no arranca (error
# de FUSE), el script lo extrae y deja un wrapper en su lugar.
#
# Códigos de salida: 0 ok · 1 error
set -e
set -o pipefail

MIN_MAJOR=0
MIN_MINOR=11

NVIM_TAG="v0.12.5"
NVIM_SHA256="d429822f6994770e3bb10330e0baf21e72b0afe66e0507cb3c631c1c65f4bf41"
NVIM_ASSET="nvim-linux-x86_64.appimage"

INSTALL_DIR="$HOME/.local/bin"
BINARY="$INSTALL_DIR/nvim"
EXTRACT_DIR="$HOME/.local/share/nvim-appimage"

ok()   { echo "  ok  $*"; }
info() { echo "→ $*"; }
die()  { echo "  --  $1" >&2; exit 1; }

# --------------------------------------------------------------------------
# 1. ¿Ya hay un nvim que cumpla la versión mínima?
# --------------------------------------------------------------------------
version_ok() {
  local bin="$1"
  local ver major minor
  ver="$("$bin" --version 2>/dev/null | grep -m1 '^NVIM v' | sed 's/^NVIM v//')" || return 1
  major="$(echo "$ver" | cut -d. -f1)"
  minor="$(echo "$ver" | cut -d. -f2)"
  case "$major$minor" in *[!0-9]*|'') return 1 ;; esac
  [ "$major" -gt "$MIN_MAJOR" ] && return 0
  [ "$major" -eq "$MIN_MAJOR" ] && [ "$minor" -ge "$MIN_MINOR" ] && return 0
  return 1
}

for candidate in "$BINARY" "$(command -v nvim 2>/dev/null || true)"; do
  [ -z "$candidate" ] && continue
  if version_ok "$candidate"; then
    VER="$("$candidate" --version | grep -m1 '^NVIM v' | sed 's/^NVIM v//')"
    ok "nvim ya instalado ($VER) en $candidate"
    exit 0
  fi
done

# --------------------------------------------------------------------------
# 2. Descargar el AppImage fijado
# --------------------------------------------------------------------------
command -v curl     >/dev/null 2>&1 || die "curl no está instalado"
command -v sha256sum >/dev/null 2>&1 || die "sha256sum no está instalado"

# Todo el trabajo sucio ocurre fuera del PATH: si el script muere a medias no
# deja un ejecutable huérfano en ~/.local/bin.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

APPIMAGE_URL="https://github.com/neovim/neovim/releases/download/$NVIM_TAG/$NVIM_ASSET"
APPIMAGE="$WORK/$NVIM_ASSET"

info "descargando Neovim $NVIM_TAG..."
curl -fL --proto '=https' --tlsv1.2 --progress-bar -o "$APPIMAGE" "$APPIMAGE_URL" \
  || die "fallo al descargar el AppImage desde $APPIMAGE_URL"

# --------------------------------------------------------------------------
# 3. Verificar integridad ANTES de hacerlo ejecutable
# --------------------------------------------------------------------------
GOT_SHA="$(sha256sum "$APPIMAGE" | cut -d' ' -f1)"
if [ "$GOT_SHA" != "$NVIM_SHA256" ]; then
  die "SHA-256 inesperado para $NVIM_ASSET ($NVIM_TAG).
      esperado: $NVIM_SHA256
      obtenido: $GOT_SHA
      El artefacto no coincide con el pin del repositorio. No se instala nada."
fi
ok "SHA-256 verificado contra el pin de dotmesh"

chmod +x "$APPIMAGE"
mkdir -p "$INSTALL_DIR"

# --------------------------------------------------------------------------
# 4. Instalar; con extracción de respaldo si falta FUSE
# --------------------------------------------------------------------------
if "$APPIMAGE" --version >/dev/null 2>&1; then
  mv -f "$APPIMAGE" "$BINARY"
  ok "nvim instalado en $BINARY"
else
  info "FUSE no disponible; extrayendo el AppImage en $EXTRACT_DIR..."
  ( cd "$WORK" && "$APPIMAGE" --appimage-extract >/dev/null 2>&1 ) \
    || die "la extracción del AppImage también falló. Instala FUSE o descarga nvim a mano."

  [ -x "$WORK/squashfs-root/usr/bin/nvim" ] \
    || die "extracción completada pero no hay binario en squashfs-root/usr/bin/nvim"

  mkdir -p "$EXTRACT_DIR"
  rm -rf "${EXTRACT_DIR:?}/squashfs-root"
  mv "$WORK/squashfs-root" "$EXTRACT_DIR/squashfs-root"

  cat > "$BINARY" <<EOF
#!/usr/bin/env bash
exec "$EXTRACT_DIR/squashfs-root/usr/bin/nvim" "\$@"
EOF
  chmod +x "$BINARY"
  ok "nvim instalado (sin FUSE) vía $EXTRACT_DIR en $BINARY"
fi

# --------------------------------------------------------------------------
# 5. Verificación final
# --------------------------------------------------------------------------
"$BINARY" --version | grep -m1 '^NVIM v'
version_ok "$BINARY" || die "el binario instalado no alcanza la versión mínima $MIN_MAJOR.$MIN_MINOR"
ok "instalación completada"

# --------------------------------------------------------------------------
# 6. Avisar si ~/.local/bin no está en el PATH
# --------------------------------------------------------------------------
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo ""
    echo "  !!  $INSTALL_DIR no está en el PATH."
    echo "      Añade esta línea a ~/.zshrc (o equivalente) y recarga la shell:"
    echo "        export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac

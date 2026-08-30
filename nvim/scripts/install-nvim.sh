#!/usr/bin/env bash
#
# Instala Neovim >= 0.11 en ~/.local/bin/nvim sin sudo.
#
# Idempotente: si nvim ya cumple el umbral de versión, termina en ok sin
# descargar nada. Si hay una versión inferior (o ausente), descarga el
# AppImage oficial de la última release de GitHub.
#
# Ubuntu 24.04.4 incluye FUSE 3 por defecto. Si el AppImage no arranca
# (error de FUSE), el script detecta el fallo y da las instrucciones de
# extracción manual (--appimage-extract).
#
# Códigos de salida: 0 ok · 1 error
set -e
set -o pipefail

MIN_MAJOR=0
MIN_MINOR=11

INSTALL_DIR="$HOME/.local/bin"
BINARY="$INSTALL_DIR/nvim"

ok()   { echo "  ok  $*"; }
info() { echo "→ $*"; }
die()  { echo "  --  $1" >&2; exit 1; }

# --------------------------------------------------------------------------
# 1. ¿Ya hay un nvim que cumpla la versión mínima?
# --------------------------------------------------------------------------
version_ok() {
  local bin="$1"
  # Extrae la línea "NVIM v0.11.2" y parsea major.minor.patch
  local ver
  ver="$("$bin" --version 2>/dev/null | grep -m1 '^NVIM v' | sed 's/^NVIM v//')" || return 1
  local major minor
  major="$(echo "$ver" | cut -d. -f1)"
  minor="$(echo "$ver" | cut -d. -f2)"
  [ "$major" -gt "$MIN_MAJOR" ] && return 0
  [ "$major" -eq "$MIN_MAJOR" ] && [ "$minor" -ge "$MIN_MINOR" ] && return 0
  return 1
}

# Buscar en el PATH y en INSTALL_DIR
for candidate in "$BINARY" "$(command -v nvim 2>/dev/null || true)"; do
  [ -z "$candidate" ] && continue
  if version_ok "$candidate"; then
    VER="$("$candidate" --version | grep -m1 '^NVIM v' | sed 's/^NVIM v//')"
    ok "nvim ya instalado ($VER) en $candidate"
    exit 0
  fi
done

# --------------------------------------------------------------------------
# 2. Determinar la última release
# --------------------------------------------------------------------------
info "consultando la última release de Neovim en GitHub..."
RELEASE_JSON="$(curl -sf https://api.github.com/repos/neovim/neovim/releases/latest)" \
  || die "no se ha podido contactar con la API de GitHub (¿sin conexión?)"

TAG="$(echo "$RELEASE_JSON" | grep -m1 '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
[ -n "$TAG" ] || die "no se ha podido extraer el tag de la release"
info "versión a instalar: $TAG"

# --------------------------------------------------------------------------
# 3. Descargar el AppImage
# --------------------------------------------------------------------------
mkdir -p "$INSTALL_DIR"
APPIMAGE_URL="https://github.com/neovim/neovim/releases/download/$TAG/nvim-linux-x86_64.appimage"
APPIMAGE_TMP="$INSTALL_DIR/nvim-linux-x86_64.appimage"

info "descargando $APPIMAGE_URL..."
curl -fL --progress-bar -o "$APPIMAGE_TMP" "$APPIMAGE_URL" \
  || die "fallo al descargar el AppImage desde $APPIMAGE_URL"

chmod +x "$APPIMAGE_TMP"

# --------------------------------------------------------------------------
# 4. Probar que el AppImage arranca (FUSE)
# --------------------------------------------------------------------------
if "$APPIMAGE_TMP" --version >/dev/null 2>&1; then
  mv -f "$APPIMAGE_TMP" "$BINARY"
  ok "nvim instalado en $BINARY"
else
  # FUSE no disponible: extraer el contenido del AppImage
  info "FUSE no disponible; extrayendo el AppImage en $INSTALL_DIR/squashfs-root..."
  PREV_DIR="$(pwd)"
  cd "$INSTALL_DIR"
  "$APPIMAGE_TMP" --appimage-extract >/dev/null 2>&1 \
    || die "la extracción del AppImage también falló. Consulta la documentación de Neovim para instalación manual."
  cd "$PREV_DIR"

  EXTRACTED_BIN="$INSTALL_DIR/squashfs-root/usr/bin/nvim"
  [ -x "$EXTRACTED_BIN" ] \
    || die "extracción completada pero no se ha encontrado el binario en $EXTRACTED_BIN"

  # Crear un wrapper que apunte al binario extraído
  cat > "$BINARY" <<EOF
#!/usr/bin/env bash
exec "$EXTRACTED_BIN" "\$@"
EOF
  chmod +x "$BINARY"
  rm -f "$APPIMAGE_TMP"
  ok "nvim instalado (sin FUSE) vía squashfs-root en $BINARY"
fi

# --------------------------------------------------------------------------
# 5. Verificación final
# --------------------------------------------------------------------------
"$BINARY" --version | grep -m1 '^NVIM v'
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

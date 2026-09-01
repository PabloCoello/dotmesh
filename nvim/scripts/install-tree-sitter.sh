#!/usr/bin/env bash
#
# Instala el CLI de tree-sitter en ~/.local/bin/tree-sitter sin sudo.
#
# La rama `main` de nvim-treesitter compila cada parser con `tree-sitter
# build` (y `tree-sitter generate` para latex): sin el CLI en el PATH, cada
# apertura de Neovim falla con un ENOENT por parser. Requiere >= 0.26.1.
#
# Idempotente: si ya hay un tree-sitter que cumple el umbral de versión,
# termina en ok sin descargar nada.
#
# La release está fijada (tag + SHA-256), no se resuelve a "latest". El pin de
# este fichero ES la referencia de integridad: se verificó a mano al adoptarlo
# y se repite en scripts/vendor/upstreams.tsv. Un artefacto que no case con el
# hash aborta la instalación. Para subir de versión, cambia TS_TAG, descarga
# el asset, comprueba su sha256sum y actualiza TS_SHA256 y el TSV.
#
# Solo Linux x86_64 (el asset pinneado). En macOS: brew install tree-sitter-cli
# (la formula 'tree-sitter' instala solo libtree-sitter, sin el binario).
#
# Códigos de salida: 0 ok · 1 error
set -e
set -o pipefail

MIN_MAJOR=0
MIN_MINOR=26
MIN_PATCH=1

TS_TAG="v0.27.0"
TS_SHA256="20a1f39ec1c45f2211492dcb8881c802b643b554bb196869a29ac3778277fa77"
TS_ASSET="tree-sitter-linux-x64.gz"

INSTALL_DIR="$HOME/.local/bin"
BINARY="$INSTALL_DIR/tree-sitter"

ok()   { echo "  ok  $*"; }
info() { echo "→ $*"; }
die()  { echo "  --  $1" >&2; exit 1; }

# --------------------------------------------------------------------------
# 1. ¿Ya hay un tree-sitter que cumpla la versión mínima?
# --------------------------------------------------------------------------
version_ok() {
  local bin="$1"
  local ver major minor patch n
  ver="$("$bin" --version 2>/dev/null | awk '/^tree-sitter /{print $2}')" || return 1
  major="$(echo "$ver" | cut -d. -f1)"
  minor="$(echo "$ver" | cut -d. -f2)"
  patch="$(echo "$ver" | cut -d. -f3)"
  for n in "$major" "$minor" "$patch"; do
    case "$n" in *[!0-9]*|'') return 1 ;; esac
  done
  [ "$major" -gt "$MIN_MAJOR" ] && return 0
  [ "$major" -lt "$MIN_MAJOR" ] && return 1
  [ "$minor" -gt "$MIN_MINOR" ] && return 0
  [ "$minor" -lt "$MIN_MINOR" ] && return 1
  [ "$patch" -ge "$MIN_PATCH" ]
}

for candidate in "$BINARY" "$(command -v tree-sitter 2>/dev/null || true)"; do
  [ -z "$candidate" ] && continue
  if version_ok "$candidate"; then
    VER="$("$candidate" --version | awk '/^tree-sitter /{print $2}')"
    ok "tree-sitter ya instalado ($VER) en $candidate"
    exit 0
  fi
done

# --------------------------------------------------------------------------
# 2. Descargar el asset fijado
# --------------------------------------------------------------------------
[ "$(uname -s)" = "Linux" ] && [ "$(uname -m)" = "x86_64" ] \
  || die "este script solo cubre Linux x86_64. macOS: brew install tree-sitter-cli"

command -v curl      >/dev/null 2>&1 || die "curl no está instalado"
command -v sha256sum >/dev/null 2>&1 || die "sha256sum no está instalado"
command -v gunzip    >/dev/null 2>&1 || die "gunzip no está instalado"

# Todo el trabajo sucio ocurre fuera del PATH: si el script muere a medias no
# deja un ejecutable huérfano en ~/.local/bin.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

ASSET_URL="https://github.com/tree-sitter/tree-sitter/releases/download/$TS_TAG/$TS_ASSET"
ASSET="$WORK/$TS_ASSET"

info "descargando tree-sitter $TS_TAG..."
curl -fL --proto '=https' --tlsv1.2 --progress-bar -o "$ASSET" "$ASSET_URL" \
  || die "fallo al descargar el asset desde $ASSET_URL"

# --------------------------------------------------------------------------
# 3. Verificar integridad ANTES de descomprimir
# --------------------------------------------------------------------------
GOT_SHA="$(sha256sum "$ASSET" | cut -d' ' -f1)"
if [ "$GOT_SHA" != "$TS_SHA256" ]; then
  die "SHA-256 inesperado para $TS_ASSET ($TS_TAG).
      esperado: $TS_SHA256
      obtenido: $GOT_SHA
      El artefacto no coincide con el pin del repositorio. No se instala nada."
fi
ok "SHA-256 verificado contra el pin de dotmesh"

# --------------------------------------------------------------------------
# 4. Instalar
# --------------------------------------------------------------------------
gunzip "$ASSET" || die "fallo al descomprimir $TS_ASSET"
UNPACKED="${ASSET%.gz}"
chmod +x "$UNPACKED"

"$UNPACKED" --version >/dev/null 2>&1 \
  || die "el binario descargado no arranca en esta máquina"

mkdir -p "$INSTALL_DIR"
mv -f "$UNPACKED" "$BINARY"
ok "tree-sitter instalado en $BINARY"

# --------------------------------------------------------------------------
# 5. Verificación final
# --------------------------------------------------------------------------
"$BINARY" --version
version_ok "$BINARY" || die "el binario instalado no alcanza la versión mínima $MIN_MAJOR.$MIN_MINOR.$MIN_PATCH"
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

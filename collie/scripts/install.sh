#!/usr/bin/env bash
#
# Instala Collie en esta máquina y enlaza los presets de dotmesh.
#
# Collie es un plugin de herdr: un puente en Bun más una PWA que se sirve por
# `tailscale serve` y permite pilotar los panes de herdr desde el móvil, con push cuando
# un agente se bloquea. Su interés para dotmesh es el contrato `WAIT_FOR_USER` de
# AGENTS.md: contestar desde el móvil una fase que si no se queda parada.
#
# El script es idempotente y NO usa sudo. Comprueba las precondiciones y para con
# instrucciones si falta alguna, en lugar de intentar arreglarlas por su cuenta. Tampoco
# arranca el puente: la política de dotmesh es arranque manual por sesión (ver README.md).
#
# Códigos de salida: 1 plataforma · 2 herdr · 3 Bun · 4 Tailscale · 5 configuración.
set -e

PLUGIN_ID="herdr.collie"
PLUGIN_REPO="AltanS/collie"
# Pin. Sincronizado con scripts/vendor/upstreams.tsv; `make vendor-check` lo compara.
PLUGIN_REF="v1.0.0-beta.32"
PLUGIN_COMMIT="42b00f4378eea568ce8ef1c40103fda779ef0fa3"
UNIT="collie.service"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

ok()   { echo "  ok  $*"; }
info() { echo "→ $*"; }
die()  { echo "  --  $1" >&2; exit "${2:-1}"; }

# --- 1. Plataforma ----------------------------------------------------------
# El plugin declara linux y macos. herdr no corre en WSL, así que allí no hay nada
# que instalar y salir en verde es lo correcto, no un fallo.
if [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qi microsoft /proc/version 2>/dev/null; then
  ok "collie-install no aplica en WSL (herdr no disponible); no-op"
  exit 0
fi
case "$(uname -s)" in
  Linux|Darwin) ;;
  *) die "plataforma no soportada por Collie ($(uname -s)); solo Linux y macOS" 1 ;;
esac

# --- 2. herdr ---------------------------------------------------------------
command -v herdr >/dev/null || die "falta herdr (brew install herdr)" 2

# --- 3. Bun -----------------------------------------------------------------
# El build de Collie llama a bunx para el typecheck. El binario suelto de Bun no lo trae:
# el instalador oficial lo crea como symlink a bun. Sin él el build falla sin decir por qué.
command -v bun >/dev/null || die "falta Bun (curl -fsSL https://bun.sh/install | bash)" 3
if ! command -v bunx >/dev/null; then
  BUN_BIN="$(command -v bun)"
  BUN_DIR="$(cd "$(dirname "$(readlink -f "$BUN_BIN")")" && pwd)"
  if [ -x "$BUN_DIR/bun" ]; then
    info "creando el symlink bunx que falta en $BUN_DIR"
    ln -sfn bun "$BUN_DIR/bunx"
  else
    die "falta bunx y no se ha podido crear junto a bun; créalo a mano" 3
  fi
fi
ok "bun y bunx en el PATH"

# --- 4. Tailscale -----------------------------------------------------------
# Estas dos comprobaciones existen porque `tailscale serve` se cuelga indefinidamente,
# sin error ni timeout, si al tailnet le faltan certificados HTTPS o si el usuario no es
# operador de tailscaled. Es la trampa que más tiempo costó en la evaluación.
command -v tailscale >/dev/null || die "falta Tailscale (https://tailscale.com/download)" 4
command -v jq >/dev/null || die "falta jq, necesario para comprobar el estado del tailnet" 4

if ! tailscale status --json 2>/dev/null | jq -e '.CertDomains // empty' >/dev/null; then
  die "el tailnet no tiene certificados HTTPS activados.
      Actívalos en https://login.tailscale.com/admin/dns (sección HTTPS Certificates).
      Sin ellos 'tailscale serve' se cuelga sin decir nada." 4
fi
ok "certificados HTTPS del tailnet"

TS_OPERATOR="$(tailscale debug prefs 2>/dev/null | jq -r '.OperatorUser // empty')"
if [ "$TS_OPERATOR" != "$USER" ]; then
  die "tu usuario no es operador de tailscaled, así que 'tailscale serve' fallará.
      Corre:  sudo tailscale set --operator=\$USER" 4
fi
ok "operador de tailscaled ($USER)"

# --- 5. El plugin -----------------------------------------------------------
# `herdr plugin list --json` devuelve {"result":{"plugins":[...]}} y cada entrada trae
# source.requested_ref y source.resolved_commit. Se comprueba el commit, no la etiqueta:
# una etiqueta se puede mover en upstream y el pin dejaría de significar nada.
plugin_field() {
  herdr plugin list --json 2>/dev/null \
    | jq -r ".result.plugins[]? | select(.plugin_id==\"$PLUGIN_ID\") | $1 // empty"
}

INSTALLED_REF="$(plugin_field '.source.requested_ref')"
if [ -n "$INSTALLED_REF" ]; then
  INSTALLED_COMMIT="$(plugin_field '.source.resolved_commit')"
  if [ "$INSTALLED_COMMIT" = "$PLUGIN_COMMIT" ]; then
    ok "plugin ya instalado en $PLUGIN_REF (${PLUGIN_COMMIT:0:7})"
  else
    # Reinstalar se llevaría el checkout por delante. Avisar y seguir, no decidir por él.
    echo "  !!  el plugin está en '$INSTALLED_REF' (${INSTALLED_COMMIT:0:7}) y el pin de"
    echo "      dotmesh es '$PLUGIN_REF' (${PLUGIN_COMMIT:0:7})."
    echo "      Para moverlo:  herdr plugin uninstall $PLUGIN_ID && $0"
  fi
else
  info "instalando $PLUGIN_REPO en $PLUGIN_REF"
  herdr plugin install "$PLUGIN_REPO" --ref "$PLUGIN_REF" --yes
fi

CONFIG_DIR="$(herdr plugin config-dir "$PLUGIN_ID" 2>/dev/null || true)"
[ -n "$CONFIG_DIR" ] || die "no se ha podido resolver el directorio de config del plugin" 5
mkdir -p "$CONFIG_DIR"

# --- 6. El .env -------------------------------------------------------------
# Nunca se sobrescribe y nunca se versiona: acaba llevando las claves VAPID.
# COLLIE_TRUSTED_USER es el gate de escritura. Se escribe ANTES del primer arranque a
# propósito: un .env sin esa variable deja el puente abierto a escritura mientras exista.
ENV_FILE="$CONFIG_DIR/.env"
if [ -e "$ENV_FILE" ]; then
  ok ".env existente respetado ($ENV_FILE)"
else
  TS_LOGIN="$(tailscale status --json 2>/dev/null | jq -r '.Self.UserID as $u | .User[$u|tostring].LoginName // empty')"
  [ -n "$TS_LOGIN" ] || die "no se ha podido deducir tu identidad de Tailscale.
      Crea $ENV_FILE a mano con COLLIE_TRUSTED_USER=<tu-login@proveedor> antes de arrancar.
      Un .env sin esa variable deja el puente abierto a escritura." 5
  info "creando $ENV_FILE con el gate de escritura cerrado"
  ( umask 077; cat > "$ENV_FILE" <<EOF
# Config de Collie — NO COMMIT, NO STOW. Ver docs/SECRETS.md.
COLLIE_PORT=8787
COLLIE_TRUSTED_USER=$TS_LOGIN
EOF
  )
  chmod 600 "$ENV_FILE"
fi

# --- 7. Los presets ---------------------------------------------------------
# --no-folding es obligatorio: sin él stow reemplazaría el directorio de config entero
# por un symlink al repo y el .env dejaría de existir donde el puente lo busca.
info "enlazando los presets de dotmesh"
stow -d "$REPO_ROOT" --no-folding -t "$HOME" collie

[ -f "$ENV_FILE" ] && [ ! -L "$ENV_FILE" ] || die "el .env ha dejado de ser un fichero regular tras stowear" 5
ok "presets enlazados y .env intacto"

# --- 8. El servicio ---------------------------------------------------------
# Política de dotmesh: el puente es acceso a shell remoto, así que existe solo mientras
# lo usas. Sin linger y sin enable; lo arrancas al empezar una sesión larga.
if [ "$(uname -s)" = "Linux" ] && systemctl --user list-unit-files 2>/dev/null | grep -q "^$UNIT"; then
  systemctl --user disable "$UNIT" >/dev/null 2>&1 || true
  ok "unidad $UNIT instalada y deshabilitada (arranque manual)"
fi

PLUGIN_ROOT="$(plugin_field '.plugin_root' || true)"

cat <<EOF

Collie instalado. Lo que queda, una sola vez:

  1. Claves de push, si el .env aún no las tiene:
       ${PLUGIN_ROOT:-<plugin_root>}/bin/collie push-keys
  2. Publicar el puente en el tailnet:
       tailscale serve --bg 8787
  3. Arrancar y emparejar el móvil:
       systemctl --user start $UNIT
       ${PLUGIN_ROOT:-<plugin_root>}/bin/collie pair

Al terminar la sesión:  systemctl --user stop $UNIT
Detalle y trampas conocidas: collie/README.md
EOF

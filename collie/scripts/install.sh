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
# pipefail para que un fallo de herdr o tailscale no se cuele como salida vacía a través
# de un jq que sí termina bien. Los sitios donde una tubería puede fallar sin ser un error
# llevan su propio `|| true`.
set -o pipefail

PLUGIN_ID="herdr.collie"
PLUGIN_REPO="AltanS/collie"
# Pin. Hay que cambiarlo a la vez que local_ref en scripts/vendor/upstreams.tsv: nada
# comprueba que coincidan (`make vendor-check` compara la TSV con upstream, no con esto).
PLUGIN_REF="v1.10.0"
PLUGIN_COMMIT="7652ed5f05a2e9e9e9c3d3734ec48ef6dcd51e99"
UNIT="collie.service"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

ok()   { echo "  ok  $*"; }
info() { echo "→ $*"; }
die()  { echo "  --  $1" >&2; exit "${2:-1}"; }

# Para la unidad si el script sale con error. Se arma donde herdr ha podido arrancar un
# puente sin .env: al instalar el plugin y al crear el .env. En el camino bueno la para la
# sección 8.
stop_unit_on_failure() {
  trap '[ $? -eq 0 ] || systemctl --user stop "$UNIT" >/dev/null 2>&1 || true' EXIT
}

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
  # Sin `readlink -f`: es de GNU coreutils y no existe en macOS, que es plataforma
  # declarada del paquete. No hace falta resolver el symlink: un bunx enlazado junto a un
  # bun que a su vez sea symlink resuelve igual, y bun elige su modo por el basename de
  # argv[0], no por la ruta real del binario.
  BUN_DIR="$(dirname "$(command -v bun)")"
  info "creando el symlink bunx que falta en $BUN_DIR"
  ln -sfn bun "$BUN_DIR/bunx" 2>/dev/null \
    || die "falta bunx y no se ha podido crear en $BUN_DIR; créalo a mano:
      ln -sfn bun \"$BUN_DIR/bunx\"" 3
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
    | jq -r --arg pid "$PLUGIN_ID" ".result.plugins[]? | select(.plugin_id==\$pid) | $1 // empty"
}

AT_PIN=0
INSTALLED_REF="$(plugin_field '.source.requested_ref')"
if [ -n "$INSTALLED_REF" ]; then
  INSTALLED_COMMIT="$(plugin_field '.source.resolved_commit')"
  if [ "$INSTALLED_COMMIT" = "$PLUGIN_COMMIT" ]; then
    ok "plugin ya instalado en $PLUGIN_REF (${PLUGIN_COMMIT:0:7})"
    AT_PIN=1
  else
    # Mover el checkout por debajo de un puente en marcha no es decisión de este script.
    # Avisar y seguir. La orden que se imprime es `install --ref` sobre lo ya instalado, no
    # `uninstall`: install reemplaza el checkout y refresca el registro de herdr respetando
    # el directorio de config (y el .env), mientras que uninstall lo borra todo. Tampoco
    # vale la acción `update` del propio Collie: mueve el checkout sin que herdr se entere
    # y este script seguiría leyendo el commit viejo.
    echo "  !!  el plugin está en '$INSTALLED_REF' (${INSTALLED_COMMIT:0:7}) y el pin de"
    echo "      dotmesh es '$PLUGIN_REF' (${PLUGIN_COMMIT:0:7})."
    echo "      Para moverlo:  herdr plugin action invoke stop --plugin $PLUGIN_ID"
    echo "                     herdr plugin install $PLUGIN_REPO --ref $PLUGIN_REF --yes && \"$0\""
  fi
else
  info "instalando $PLUGIN_REPO en $PLUGIN_REF"
  stop_unit_on_failure
  herdr plugin install "$PLUGIN_REPO" --ref "$PLUGIN_REF" --yes
  # Las etiquetas de GitHub se pueden mover, así que el pin no significa nada si no se
  # comprueba también aquí: sin esto solo protegería de la segunda corrida en adelante.
  RESOLVED="$(plugin_field '.source.resolved_commit' || true)"
  if [ "$RESOLVED" != "$PLUGIN_COMMIT" ]; then
    herdr plugin uninstall "$PLUGIN_ID" >/dev/null 2>&1 || true
    die "'$PLUGIN_REF' ha resuelto a '${RESOLVED:-nada}' y el pin es $PLUGIN_COMMIT.
      Se ha desinstalado lo recién traído. Mira qué ha pasado en upstream antes de
      tocar PLUGIN_COMMIT en este script." 5
  fi
  ok "instalado y verificado contra el pin (${PLUGIN_COMMIT:0:7})"
  AT_PIN=1
fi

CONFIG_DIR="$(herdr plugin config-dir "$PLUGIN_ID" 2>/dev/null || true)"
[ -n "$CONFIG_DIR" ] || die "no se ha podido resolver el directorio de config del plugin" 5
mkdir -p "$CONFIG_DIR"

# --- 6. El .env -------------------------------------------------------------
# Nunca se sobrescribe y nunca se versiona: acaba llevando las claves VAPID.
# COLLIE_TRUSTED_USER es el gate de escritura: un .env sin esa variable deja el puente
# abierto a escritura mientras exista. Se escribe antes de que arranques el puente; si el
# puente ha podido quedar en marcha sin .env, lo para la sección 8 o el trap.
ENV_FILE="$CONFIG_DIR/.env"
# Las variables que anulan el gate aunque COLLIE_TRUSTED_USER esté puesto. Collie las lee
# con envBool: on/1/true/yes, sin distinguir mayúsculas. TRUSTED_USER_OPTIONAL y SKIP_SERVE
# dejan pasar peticiones sin identidad (cualquier nodo etiquetado del tailnet escribe),
# ALLOW_ANY_HOST apaga la validación de Host y ALLOW_NON_LOOPBACK_BIND deja que COLLIE_HOST
# saque el puerto de loopback sin comprobar quién se conecta, así que cualquiera que llegue
# puede poner la cabecera de identidad. Sirven para desarrollo local o para un proxy propio,
# no para este puente.
HATCHES=(COLLIE_TRUSTED_USER_OPTIONAL COLLIE_SKIP_SERVE COLLIE_ALLOW_ANY_HOST COLLIE_ALLOW_NON_LOOPBACK_BIND)
ENV_CREATED=0
if [ -e "$ENV_FILE" ]; then
  # Respetar un .env ajeno está bien; respetarlo sin mirar el gate es fallar en abierto.
  # Un .env sin COLLIE_TRUSTED_USER deja el puente escribible para cualquiera que llegue.
  # systemd corta también las líneas en un retorno de carro suelto, y Collie y grep no: lo
  # que vaya detrás solo lo vería la unidad.
  ! grep -q $'\r'. "$ENV_FILE" \
    || die "el .env existente tiene un retorno de carro en mitad de una línea, y systemd
      leería detrás una asignación que esta comprobación no ve. Quítalo de $ENV_FILE." 5
  # Se lee como Collie: `export` opcional, sin espacios junto al = y gana la última
  # asignación. Tras el primer =, los espacios y la comilla, el valor tiene que empezar por
  # algo que no sea espacio, comilla ni #.
  grep -E '^[[:space:]]*(export[[:space:]]+)?COLLIE_TRUSTED_USER=' "$ENV_FILE" | tail -n 1 \
    | grep -E "^[^=]*=[[:space:]]*[\"']?[^\"'[:space:]#]" >/dev/null \
    || die "el .env existente no define COLLIE_TRUSTED_USER: el puente quedaría abierto
      a escritura para cualquiera que alcance el tailnet. Añádelo antes de arrancar:
        echo 'COLLIE_TRUSTED_USER=<tu-login@proveedor>' >> $ENV_FILE" 5
  # Una escotilla solo cuenta como apagada con off/0/false/no. Vacía no vale: el puente la
  # rellena con config.toml y `config show` no lo refleja, así que la 6b no lo vería. Aquí
  # se avisa de más a propósito: también de asignaciones que Collie ignoraría, como las que
  # llevan espacios junto al =.
  HATCH_RE="$(IFS='|'; echo "${HATCHES[*]}")"
  OFF_RE='(off|0|false|no)'
  SET_HATCHES="$(grep -iE '^[[:space:]]*(export[[:space:]]+)?('"$HATCH_RE"')[[:space:]]*=' "$ENV_FILE" \
    | grep -ivE "^[^=]*=[[:space:]]*($OFF_RE|\"$OFF_RE\"|'$OFF_RE')[[:space:]]*(#.*)?\$" \
    | sed -E 's/^[[:space:]]*(export[[:space:]]+)?([A-Za-z0-9_]+).*/\2/' || true)"
  [ -z "$SET_HATCHES" ] || die "el .env existente asigna ${SET_HATCHES//$'\n'/, } con un valor que no es
      off/0/false/no. Estas variables anulan el gate de identidad aunque COLLIE_TRUSTED_USER
      esté definido, y vacías tampoco valen: Collie las rellena con config.toml.
      Quítalas de $ENV_FILE o ponlas a false. Si el puente está en marcha, páralo." 5
  ok ".env existente respetado: define la identidad y no enciende escotillas"
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
  ENV_CREATED=1
  stop_unit_on_failure
fi

# --- 6b. La config efectiva -------------------------------------------------
# Desde 1.9.0 cualquier ajuste se puede fijar también en ~/.collie/config.toml y en un
# config.toml junto al .env. El .env gana a los dos, pero una clave que el .env no nombra
# la decide el fichero, así que las comprobaciones de arriba ya no bastan: se pregunta a
# Collie por el valor efectivo, en las condiciones de la unidad: en su directorio de
# trabajo, porque el binario carga el .env que encuentre ahí, y sin el entorno de esta
# shell, para que una variable suelta no tape lo que el servicio va a leer.
# Solo con el commit del pin, que es el que se sabe que trae `config show`; si no, la
# sección 5 ya ha dicho cómo moverlo y volver a correr este script.
if [ "$AT_PIN" = "1" ]; then
  # Lo que la unidad ve y esta consulta no, y que dotmesh no usa. COLLIE_CONFIG cambia el
  # fichero de home: el puente lo toma del .env (le llega por EnvironmentFile y además lo
  # funde antes de leer la config), pero `config show` elige el fichero antes de fundir el
  # .env. Y el entorno que da systemd --user, el del gestor y el de la unidad con sus
  # drop-ins y alias, no pasa por `env -i`, y la unidad puede cambiar la orden, el
  # directorio de trabajo, del que el binario carga otro .env, o el de config.
  PLUGIN_ROOT="$(plugin_field '.plugin_root' || true)"
  COLLIE_BIN="$PLUGIN_ROOT/bin/collie"
  [ -n "$PLUGIN_ROOT" ] && [ -x "$COLLIE_BIN" ] \
    || die "no se encuentra el binario de Collie (plugin_root: '${PLUGIN_ROOT:-vacío}');
      sin él no se puede comprobar el gate" 5
  if grep -qE '^[[:space:]]*(export[[:space:]]+)?COLLIE_CONFIG[[:space:]]*=' "$ENV_FILE"; then
    die "el .env define COLLIE_CONFIG, y con él el puente leería un fichero que esta
      comprobación no ve. Quítalo de $ENV_FILE; dotmesh no lo usa." 5
  fi
  if [ "$(uname -s)" = "Linux" ]; then
    # Las rutas de unidades las pide al gestor y no a systemd-analyze, que las calcula con el
    # entorno de esta shell.
    if MANAGER_ENV="$(systemctl --user show-environment 2>/dev/null)" \
      && UNIT_PATHS="$(systemctl --user show -p UnitPath --value 2>/dev/null)"; then
      # HOME decide qué ~/.collie/config.toml lee el puente y NODE_ENV qué .env carga Bun del
      # directorio de trabajo; la consulta usa los de esta shell.
      MANAGER_VARS="$(grep -oE '^(COLLIE_[A-Za-z0-9_]*|NODE_ENV)=' <<<"$MANAGER_ENV" | tr -d = || true)"
      MANAGER_HOME="$(sed -n 's/^HOME=//p' <<<"$MANAGER_ENV")"
      [ -z "$MANAGER_HOME" ] || [ "$MANAGER_HOME" = "$HOME" ] \
        || MANAGER_VARS="${MANAGER_VARS:+$MANAGER_VARS$'\n'}HOME"
      [ -z "$MANAGER_VARS" ] || die "el gestor de systemd --user pasa a todas sus unidades ${MANAGER_VARS//$'\n'/, },
      y esta comprobación no lo ve. Quítalo de ~/.config/environment.d o con
      'systemctl --user unset-environment'." 5
      # La unidad tiene que ser la que escribe Collie y nada más: un drop-in, un alias o una
      # directiva añadida a mano cambian lo que lee el puente (HOME, su directorio de config,
      # el de trabajo, la orden) sin que la consulta lo vea. Se buscan en disco, en todas las
      # rutas salvo las del sistema, que solo escribe root, porque sobreviven a
      # `collie uninstall` y se aplicarían en el primer `collie start`, cuando la unidad
      # todavía no existe. A la lista del gestor se suman las rutas de usuario conocidas, por
      # si una versión no las enumera todas.
      UNIT_FILE="$HOME/.config/systemd/user/$UNIT"
      RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
      UNIT_PATHS="${UNIT_PATHS// /$'\n'}
$HOME/.config/systemd/user
$HOME/.config/systemd/user.control
$HOME/.local/share/systemd/user
$RUNTIME_DIR/systemd/user
$RUNTIME_DIR/systemd/user.control
$RUNTIME_DIR/systemd/transient"
      is_system_path() {
        case "$1" in /etc/* | /usr/* | /lib/* | /run/systemd/*) return 0 ;; esac
        return 1
      }
      STRAY="$(while IFS= read -r d; do
          if [ -z "$d" ] || is_system_path "$d"; then continue; fi
          for f in "$d/$UNIT" "$d/$UNIT.d"/* "$d/service.d"/*; do
            if [ -e "$f" ] && [ "$f" != "$UNIT_FILE" ]; then echo "$f"; fi
          done
          # Un enlace a la unidad es un alias, y los drop-ins del alias también se aplican.
          for f in "$d"/*; do
            if [ -L "$f" ] && [ "$(basename -- "$(readlink -- "$f")")" = "$UNIT" ]; then echo "$f"; fi
          done
        done <<<"$UNIT_PATHS" | sort -u)"
      # Y lo que systemd ha cargado de verdad, con los drop-ins del sistema incluidos.
      UNIT_PROPS="$(systemctl --user show "$UNIT" -p FragmentPath -p NeedDaemonReload \
        -p Names -p DropInPaths -p WorkingDirectory -p ExecStart -p Environment \
        -p EnvironmentFiles 2>/dev/null)" \
        || die "systemctl --user show $UNIT ha fallado; no se puede comprobar la unidad" 5
      while IFS= read -r f; do
        if [ -n "$f" ] && ! is_system_path "$f"; then STRAY="${STRAY:+$STRAY$'\n'}$f"; fi
      done <<<"$(sed -n 's/^DropInPaths=//p' <<<"$UNIT_PROPS" | tr ' ' '\n')"
      [ "$(sed -n 's/^Names=//p' <<<"$UNIT_PROPS")" = "$UNIT" ] \
        || STRAY="${STRAY:+$STRAY$'\n'}alias: $(sed -n 's/^Names=//p' <<<"$UNIT_PROPS")"
      [ -z "$STRAY" ] || die "systemd --user aplicaría a $UNIT ficheros que no son la unidad de Collie:
      ${STRAY//$'\n'/, }
      y esta comprobación no ve lo que cambian. Quítalos y vuelve a correr el script." 5
      if [ -e "$UNIT_FILE" ]; then
        # Las mismas directivas que la copia de referencia que Collie trae en systemd/, que
        # sus tests atan a la que genera. COLLIE_TAILSCALE_HOSTS solo se escribe si hay hosts.
        # Una línea que acaba en \ se une a la siguiente, y systemd corta también en \r: las
        # dos cosas esconderían una directiva, así que no se aceptan.
        unit_shape() {
          tr -d '\r\000' <"$1" | cmp -s - "$1" || { echo "retorno de carro o NUL"; return 0; }
          awk '{ sub(/^[[:space:]]+/, ""); sub(/[[:space:]]+$/, "") }
            /^([#;]|$)/ { next }
            /\\$/ { print "continuación: " $0; next }
            /^\[/ { print; next }
            { i = index($0, "="); if (!i) { print; next }
              k = substr($0, 1, i - 1); sub(/[[:space:]]+$/, "", k)
              if (k == "Environment") {
                v = substr($0, i + 1); sub(/^[[:space:]"]+/, "", v); sub(/=.*/, "", v); k = k "=" v
              }
              if (k != "Environment=COLLIE_TAILSCALE_HOSTS") print k }' "$1"
        }
        [ -r "$PLUGIN_ROOT/systemd/$UNIT" ] \
          || die "el plugin no trae systemd/$UNIT; sin ella no se puede comprobar la unidad" 5
        [ "$(unit_shape "$UNIT_FILE")" = "$(unit_shape "$PLUGIN_ROOT/systemd/$UNIT")" ] \
          || die "$UNIT_FILE no tiene las directivas de la unidad de Collie; alguien la ha
      editado. Compárala con $PLUGIN_ROOT/systemd/$UNIT y deja solo esas." 5
      fi
      WANT_FRAGMENT=""
      [ ! -e "$UNIT_FILE" ] || WANT_FRAGMENT="$UNIT_FILE"
      LOADED_FRAGMENT="$(sed -n 's/^FragmentPath=//p' <<<"$UNIT_PROPS")"
      [ -z "$LOADED_FRAGMENT" ] || [ "$LOADED_FRAGMENT" = "$WANT_FRAGMENT" ] \
        || die "systemd --user carga $UNIT desde $LOADED_FRAGMENT y no desde $UNIT_FILE,
      y esta comprobación no revisa esa copia. Quítala, corre 'systemctl --user daemon-reload'
      y vuelve a correr el script." 5
      [ "$LOADED_FRAGMENT" = "$WANT_FRAGMENT" ] && grep -qx 'NeedDaemonReload=no' <<<"$UNIT_PROPS" \
        || die "systemd --user no tiene cargada la unidad que hay en disco. Corre
      'systemctl --user daemon-reload' y vuelve a correr el script." 5
      if [ -n "$WANT_FRAGMENT" ]; then
        # systemctl escribe cada asignación suelta o entre comillas dobles, y con barras o
        # $'…' cuando el valor lleva caracteres raros; eso no se interpreta, se rechaza.
        UNIT_ENV="$(sed -n 's/^Environment=//p' <<<"$UNIT_PROPS")"
        QUOTES="$(tr -cd '"' <<<"$UNIT_ENV")"
        UNIT_ASSIGN=""
        case "$UNIT_ENV" in
          *\\* | *\$\'* | *$'\n'*) ;;
          *) [ $(( ${#QUOTES} % 2 )) -ne 0 ] \
               || UNIT_ASSIGN="$(grep -oE '"[^"]*"|[^[:space:]"]+' <<<"$UNIT_ENV" | sed -E 's/^"(.*)"$/\1/' || true)" ;;
        esac
        UNIT_VARS="$(grep -vE '^(HERDR_SOCKET_PATH|HERDR_PLUGIN_CONFIG_DIR|COLLIE_(PORT|PLUGIN_ROOT|TAILSCALE_HOSTS))=' \
          <<<"$UNIT_ASSIGN" || true)"
        unit_env() { sed -n "s/^$1=//p" <<<"$UNIT_ASSIGN"; }
        UNIT_FILES="$(sed -n 's/^EnvironmentFiles=//p' <<<"$UNIT_PROPS" \
          | sed -E 's/ \(ignore_errors=(yes|no)\)$//' | grep -vxF "$ENV_FILE" || true)"
        UNIT_CWD="$(sed -n 's/^WorkingDirectory=//p' <<<"$UNIT_PROPS")"
        # path= es el binario que se ejecuta y argv[] lo que recibe; con @ son distintos.
        UNIT_EXEC="$(sed -nE 's/^(ExecStart=\{ path=[^;]* ; argv\[\]=[^;]* ; ignore_errors=[a-z]+ ;).*/\1/p' <<<"$UNIT_PROPS")"
        # HERDR_SOCKET_PATH y COLLIE_PORT no se comparan: no abren el gate y el script no sabe
        # qué valor les ha dado Collie.
        [ -n "$UNIT_ASSIGN" ] && [ -z "$UNIT_VARS" ] \
          && [ "$(unit_env HERDR_PLUGIN_CONFIG_DIR)" = "$CONFIG_DIR" ] \
          && [ "$(unit_env COLLIE_PLUGIN_ROOT)" = "$PLUGIN_ROOT" ] && [ -z "$UNIT_FILES" ] \
          && [ "$UNIT_CWD" = "$PLUGIN_ROOT" ] \
          && [ "$UNIT_EXEC" = "ExecStart={ path=$COLLIE_BIN ; argv[]=$COLLIE_BIN _exec-bridge ; ignore_errors=no ;" ] \
          || die "la unidad $UNIT no arranca el puente como lo escribe Collie para este
      plugin y esta configuración (variables, ficheros de entorno, directorio de trabajo
      u orden), y esta comprobación no vería lo que cambia. Revísala con
      'systemctl --user cat $UNIT'." 5
      fi
    else
      echo "  !!  no se llega a systemd --user: el entorno que el gestor y la unidad dan al"
      echo "      puente queda sin revisar."
    fi
  fi
  EFFECTIVE="$(cd "$PLUGIN_ROOT" && env -i HOME="$HOME" PATH="$PATH" \
    HERDR_PLUGIN_CONFIG_DIR="$CONFIG_DIR" "$COLLIE_BIN" config show --json)" \
    || die "'collie config show' ha fallado; no se puede comprobar el gate de identidad" 5
  # Cada variable del gate tiene que salir una vez. Si no, el binario o su salida no son los
  # que se esperan, y parar es mejor que dar el gate por cerrado.
  jq -e --args '[.settings[].env] as $seen
      | all($ARGS.positional[]; . as $k | ($seen | map(select(. == $k)) | length) == 1)' \
      COLLIE_TRUSTED_USER "${HATCHES[@]}" <<<"$EFFECTIVE" >/dev/null \
    || die "la salida de 'collie config show' no trae las variables del gate; no se puede
      comprobar" 5
  OPEN_HATCHES="$(jq -r --args '.settings[]
      | select(.env | IN($ARGS.positional[]))
      | select(.value | test("^\\s*(on|1|true|yes)\\s*$"; "i"))
      | "\(.env) (\(.source))"' "${HATCHES[@]}" <<<"$EFFECTIVE")" \
    || die "la salida de 'collie config show' no se entiende; no se puede comprobar el gate" 5
  [ -z "$OPEN_HATCHES" ] || die "la config efectiva abre el gate de identidad:
      ${OPEN_HATCHES//$'\n'/, }
      file:home es ~/.collie/config.toml, file:instance es $CONFIG_DIR/config.toml
      y env es el .env o uno del directorio del plugin ($PLUGIN_ROOT). Quita cada variable de donde dice el paréntesis antes de arrancar.
      Si el puente está en marcha, páralo." 5
  jq -e '[.settings[] | select(.env == "COLLIE_TRUSTED_USER")][0].value
      | (type == "string") and (IN("(unset)", "unset") | not) and (test("^\\s*$") | not)' \
      <<<"$EFFECTIVE" >/dev/null \
    || die "la config efectiva no define COLLIE_TRUSTED_USER: el puente quedaría abierto
      a escritura para cualquiera que alcance el tailnet. Si está en marcha, páralo." 5
  ok "config efectiva con el gate de identidad cerrado"
else
  echo "  !!  config efectiva sin comprobar porque el plugin no está en el pin. Muévelo y"
  echo "      vuelve a correr este script antes de arrancar el puente."
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
# Collie solo escribe la unidad en `collie start`; en una máquina nueva todavía no existe.
# La lista se lee entera antes de buscar: con pipefail, grep cierra la tubería al primer
# acierto (también con la salida a /dev/null), systemctl muere con SIGPIPE y la sección
# entera se saltaría.
UNIT_PRESENT=0
if [ "$(uname -s)" = "Linux" ]; then
  UNIT_LIST="$(systemctl --user list-unit-files 2>/dev/null || true)"
  if grep -q "^${UNIT//./\\.}[[:space:]]" <<<"$UNIT_LIST"; then UNIT_PRESENT=1; fi
fi
if [ "$UNIT_PRESENT" = "1" ]; then
  # Si el .env acaba de nacer, un puente en marcha (este script no controla cuándo arranca)
  # estaría corriendo con el gate abierto: ahí sí hay que pararlo. En cualquier otro caso
  # no se para, para no matar un puente sano en cada corrida.
  if [ "$ENV_CREATED" = "1" ]; then
    systemctl --user stop "$UNIT" >/dev/null 2>&1 || true
  fi
  systemctl --user disable "$UNIT" >/dev/null 2>&1 || true
  ok "unidad $UNIT instalada y deshabilitada (arranque manual)"
fi

PLUGIN_ROOT="$(plugin_field '.plugin_root' || true)"
START_STEP="systemctl --user start $UNIT"
if [ "$(uname -s)" = "Linux" ] && [ "$UNIT_PRESENT" = "0" ]; then
  # La primera vez no hay otra forma de tener la unidad; luego se vuelve a la política.
  START_STEP="${PLUGIN_ROOT:-<plugin_root>}/bin/collie start    # escribe la unidad y la habilita
       systemctl --user disable $UNIT"
fi

cat <<EOF

Collie instalado. Lo que queda, una sola vez:

  1. Claves de push, si el .env aún no las tiene:
       ${PLUGIN_ROOT:-<plugin_root>}/bin/collie push-keys
  2. Publicar el puente en el tailnet:
       tailscale serve --bg 8787
  3. Arrancar y emparejar el móvil:
       $START_STEP
       ${PLUGIN_ROOT:-<plugin_root>}/bin/collie pair

Al terminar la sesión:  systemctl --user stop $UNIT
Detalle y trampas conocidas: collie/README.md
EOF

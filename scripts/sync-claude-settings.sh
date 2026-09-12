#!/usr/bin/env bash
# Propaga al settings.json vivo las claves de la plantilla que son del repo.
#
# `claude/.claude/settings.json` no se stowea a propósito (está en
# `claude/.stow-local-ignore`): es una plantilla que `make seed-claude-settings`
# siembra una vez y nunca sobreescribe, para que los ajustes por máquina no
# aparezcan como cambios sin commitear. El precio es que un hook nuevo en el
# repo no llega jamás a una máquina ya instalada.
#
# Este script paga ese precio sobre las claves que son del repositorio y no de
# la máquina:
#   .hooks             registra ficheros del repo
#   .permissions.deny  es política, no preferencia; y su ausencia no se nota
#                      hasta que algo la necesita
#   .sandbox           el confinamiento no puede depender de acordarse
# Todo lo demás pertenece a la máquina y no se toca: el modelo, el tema, el
# effortLevel, el outputStyle y también `permissions.defaultMode`, que puede
# ser distinto por máquina (una en sandbox, otra en auto mode).
#
# Solo se propaga lo que la plantilla trae. Una clave ausente en la plantilla
# deja la del destino como está: este script no borra claves.
#
# Dentro de una clave que sí trae, en cambio, reemplaza y no une. Una regla
# deny que solo esté en la máquina desaparece en la siguiente fusión, y eso es
# deliberado: con unión no habría forma de retirar una regla desde el repo, que
# es donde vive la política. La deriva se anuncia con un `-` antes de escribir
# y queda copia previa en ~/dotfiles-backup.
#
# Uso:
#   sync-claude-settings.sh            fusiona esas claves (con backup)
#   sync-claude-settings.sh --check    no escribe; solo informa
#
# `make install` lo encadena tras seed-claude-settings, que es lo que cierra la
# deriva en una máquina ya instalada. Es barato de repetir: cuando no hay
# diferencia sale antes de tocar nada y sin dejar copia.
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

command -v jq >/dev/null 2>&1 || undecidable "jq no encontrado; requerido para comparar los ajustes"
[ -f "$SRC" ] || undecidable "plantilla ausente: $SRC"
[ -L "$DST" ] && undecidable "$DST es un symlink de una instalación antigua (ver 'make seed-claude-settings')"
[ -e "$DST" ] || undecidable "$DST no existe (corre 'make seed-claude-settings')"
jq -e . "$SRC" >/dev/null 2>&1 || undecidable "la plantilla no es JSON válido: $SRC"
jq -e . "$DST" >/dev/null 2>&1 || undecidable "no es JSON válido: $DST"
# Sin esta guarda, una plantilla sin bloque `hooks` asignaría null al vivo y
# borraría todos los hooks de la máquina sin decir nada.
jq -e '.hooks | type == "object"' "$SRC" >/dev/null 2>&1 \
  || undecidable "la plantilla no trae un bloque hooks utilizable: $SRC"

# Aplana las claves del repo a una línea por elemento, para poder decir qué
# entra y qué sale en vez de un "difieren" a secas.
#
# El hook se serializa entero, no solo su `command`: un `timeout` nuevo en la
# plantilla es un cambio real que la fusión sí aplica, y compararlo solo por el
# comando daba un "alineados" perpetuo a una máquina que nunca lo recibía. Lo
# que el sort sí borra es el orden de ejecución dentro de un matcher; cambiarlo
# no se detecta.
flatten() {
  jq -r '
    ((.hooks // {}) | to_entries[] as $e
      | ($e.value | if type == "array" then .[] else empty end)
      | (.matcher // "*") as $m
      | (.hooks // [] | if type == "array" then .[] else empty end)
      | "hooks \($e.key) [\($m)] \(tojson)"),
    (.permissions.deny | if type == "array" then .[] | "permissions.deny \(.)" else empty end),
    (.sandbox | if type == "object" then to_entries[] | "sandbox.\(.key) \(.value | tojson)" else empty end)
  ' "$1" | sort
}

TMP=$(mktemp -d -p "${TMPDIR:-/tmp}" synchooks.XXXXXX)
trap 'rm -rf "$TMP"' EXIT

flatten "$SRC" > "$TMP/plantilla"

# El vivo solo se compara en las claves que la plantilla trae. Las que no trae
# no se tocan, así que listarlas como deriva prometería un borrado que no va a
# ocurrir. Los patrones van anclados: sin el ^, una regla deny que contuviera
# la palabra "hooks" se colaría en la comparación de otra clase.
jq -r '
  (if has("hooks") then "^hooks " else empty end),
  (if (.permissions | type == "object") and (.permissions | has("deny")) then "^permissions\\.deny " else empty end),
  (if has("sandbox") then "^sandbox\\." else empty end)
' "$SRC" > "$TMP/prefijos"
# La guarda de arriba exige un bloque hooks, así que siempre hay al menos un
# patrón. Sin ninguno, grep no casaría nada y todo se anunciaría como alta.
[ -s "$TMP/prefijos" ] || undecidable "la plantilla no trae ninguna clave del repo: $SRC"
flatten "$DST" > "$TMP/vivo-crudo" || undecidable "no se puede aplanar $DST"
grep -E -f "$TMP/prefijos" "$TMP/vivo-crudo" > "$TMP/vivo" || true

ADDED=$(comm -23 "$TMP/plantilla" "$TMP/vivo")
REMOVED=$(comm -13 "$TMP/plantilla" "$TMP/vivo")

if [ -z "$ADDED" ] && [ -z "$REMOVED" ]; then
  echo "  ok  ajustes de Claude alineados con la plantilla"
  exit 0
fi

report() {
  [ -n "$ADDED" ] && printf '%s\n' "$ADDED" | sed 's/^/      + /'
  [ -n "$REMOVED" ] && printf '%s\n' "$REMOVED" | sed 's/^/      - /'
  return 0
}

if [ "$CHECK" = 1 ]; then
  echo "  --  ajustes de Claude desalineados (corre 'make sync-claude-settings')"
  report
  exit 1
fi

echo "  ..  fusionando los ajustes del repo en $DST"
report

BACKUP_DIR="$HOME/dotfiles-backup/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
cp "$DST" "$BACKUP_DIR/claude-settings.json"
# Explícito, y no a merced de la umask: la copia lleva la configuración del
# usuario y no depende de que el directorio padre sea restrictivo.
chmod 600 "$BACKUP_DIR/claude-settings.json"
echo "  ok  copia previa en $BACKUP_DIR/claude-settings.json"

# Solo las claves del repo; el resto del fichero vivo se conserva tal cual. Las
# dos opcionales se asignan únicamente si la plantilla las trae, para que una
# plantilla sin ellas no ponga un null donde la máquina tenía algo. El
# temporal va al lado del destino para que el mv final sea un rename dentro del
# mismo sistema de ficheros: si jq falla, el destino no se ha tocado.
# mktemp y no $$: el PID es predecible y ~/.claude puede ser escribible por el
# grupo, así que un nombre adivinable admite que otro proceso plante ahí un
# symlink y desvíe la escritura. El sufijo aleatorio va en el mismo directorio
# que el destino para que el mv final siga siendo un rename.
NUEVO=$(mktemp "$DST.dotmesh-sync.XXXXXX")
trap 'rm -rf "$TMP"; rm -f "$NUEVO"' EXIT
jq --slurpfile plantilla "$SRC" '
  ($plantilla[0]) as $t
  | .hooks = $t.hooks
  | (if ($t.permissions | type == "object") and ($t.permissions | has("deny"))
     then .permissions.deny = $t.permissions.deny else . end)
  | (if $t | has("sandbox") then .sandbox = $t.sandbox else . end)
' "$DST" > "$NUEVO"
jq -e . "$NUEVO" >/dev/null
chmod --reference="$DST" "$NUEVO" 2>/dev/null || true
mv "$NUEVO" "$DST"
echo "  ok  ajustes del repo actualizados; reinicia las sesiones de Claude abiertas"

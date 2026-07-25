#!/bin/bash
# install.sh — instala el esquema de color dotmesh en Windows Terminal.
# Uso:  bash windows-terminal/scripts/install.sh
# Requiere: jq, WSL2 con /mnt/c accesible, Windows Terminal instalado.

set -e

# ── Rutas ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
SCHEME_FILE="$REPO_DIR/windows-terminal/themes/dotmesh.json"

# ── Verificar que estamos en WSL ────────────────────────────────────────────
_is_wsl=0
if [[ -n "$WSL_DISTRO_NAME" ]] || grep -qi microsoft /proc/version 2>/dev/null; then
    _is_wsl=1
fi

if [[ "$_is_wsl" -eq 0 ]]; then
    echo "  ok  windows-terminal/install.sh: no estamos en WSL; nada que hacer."
    exit 0
fi

# ── Detectar usuario de Windows ────────────────────────────────────────────
# Honra WINUSER preexistente; misma cadena de fallbacks que vscode/scripts/install.sh.
_wsl_winuser() {
    local u
    if command -v cmd.exe >/dev/null 2>&1; then
        u=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r\n')
    fi
    if [[ -z "$u" ]] && command -v wslvar >/dev/null 2>&1; then
        u=$(wslvar USERNAME 2>/dev/null)
    fi
    if [[ -z "$u" ]]; then
        # Fallback: primer directorio en /mnt/c/Users que no sea de sistema
        u=$(ls /mnt/c/Users/ 2>/dev/null \
            | grep -Ev '^(Public|Default|All Users|Default User)$' \
            | head -1)
    fi
    echo "$u"
}

WINUSER="${WINUSER:-$(_wsl_winuser)}"

if [[ -z "$WINUSER" ]]; then
    echo "  !!  No se pudo detectar el usuario de Windows."
    echo "      Exporta WINUSER=<tu_usuario_windows> y reintenta."
    exit 1
fi

# ── Verificar que /mnt/c está accesible ────────────────────────────────────
if [[ ! -d "/mnt/c/Users/$WINUSER" ]]; then
    echo "  !!  /mnt/c/Users/$WINUSER no existe o /mnt/c/ no está montado."
    echo "      Comprueba que WSL tiene acceso a C:\\ o que el usuario Windows es correcto."
    exit 0
fi

# ── Localizar el settings.json de Windows Terminal ─────────────────────────
WT_SETTINGS=""
for candidate in /mnt/c/Users/"$WINUSER"/AppData/Local/Packages/Microsoft.WindowsTerminal_*/LocalState/settings.json; do
    if [[ -f "$candidate" ]]; then
        WT_SETTINGS="$candidate"
        break
    fi
done

if [[ -z "$WT_SETTINGS" ]]; then
    echo "  ok  Windows Terminal no está instalado o no se encontró su settings.json;"
    echo "      instálalo desde la Microsoft Store y vuelve a ejecutar este script."
    exit 0
fi

echo "  →   Windows Terminal settings: $WT_SETTINGS"

# ── Verificar jq ───────────────────────────────────────────────────────────
if ! command -v jq >/dev/null 2>&1; then
    echo "  !!  'jq' no está disponible. Instálalo (sudo apt install jq) y reintenta."
    exit 1
fi

# ── Verificar que el fichero de esquema existe ─────────────────────────────
if [[ ! -f "$SCHEME_FILE" ]]; then
    echo "  !!  No se encontró $SCHEME_FILE. Comprueba la instalación del repo."
    exit 1
fi

# ── Backup del settings.json original ─────────────────────────────────────
WT_BACKUP="${WT_SETTINGS}.bak.$(date +%Y%m%d_%H%M%S)"
cp "$WT_SETTINGS" "$WT_BACKUP"
echo "  ok  Backup guardado en: $WT_BACKUP"

# ── Insertar o reemplazar el esquema dotmesh (idempotente) ─────────────────
# Si ya existe un esquema con "name": "dotmesh", lo reemplaza; si no, lo añade.
# El array .schemes puede no existir: el operador []? lo trata como vacío.
jq --argjson scheme "$(cat "$SCHEME_FILE")" '
  .schemes = (
    [.schemes[]? | select(.name != "dotmesh")] + [$scheme]
  )
' "$WT_SETTINGS" > "$WT_SETTINGS.tmp" && mv "$WT_SETTINGS.tmp" "$WT_SETTINGS"

echo "  ok  Esquema 'dotmesh' instalado en Windows Terminal."
echo "      Actívalo en: Configuración → Perfiles → Apariencia → Esquema de colores."

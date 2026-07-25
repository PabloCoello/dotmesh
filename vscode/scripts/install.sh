#!/bin/bash

# Script de instalación de configuración de VS Code
# Autor: Pablo Coello
# Uso: ./install.sh [--backup]

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directorios
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
REPO_CONFIG_DIR="$REPO_DIR/Library/Application Support/Code/User"
VSCODE_DIR="$HOME/.vscode"
VSCODE_CONFIG_DIR="$HOME/Library/Application Support/Code/User"
EXT_ID="pablocoello.vscode-personal-conf"   # publisher.name del manifiesto (package.json)

# Detectar plataforma: ruta de config y variante de keybindings
KEYBINDINGS_SRC="keybindings.json"            # macOS usa cmd+
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    VSCODE_CONFIG_DIR="$HOME/.config/Code/User"
    KEYBINDINGS_SRC="keybindings.linux.json"  # Linux usa ctrl+
fi

# ── Detección de WSL ──────────────────────────────────────────────────────
_is_wsl=0
if [[ -n "$WSL_DISTRO_NAME" ]] || grep -qi microsoft /proc/version 2>/dev/null; then
    _is_wsl=1
fi

# ── Detectar usuario de Windows (solo en WSL) ─────────────────────────────
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

if [[ "$_is_wsl" -eq 1 ]]; then
    WINUSER="${WINUSER:-$(_wsl_winuser)}"
    if [[ -z "$WINUSER" ]]; then
        echo "  !!  No se pudo detectar el usuario de Windows."
        echo "      Exporta WINUSER=<tu_usuario_windows> y reintenta."
        exit 1
    fi
    # Rechaza valores con traversal de ruta antes de construir ninguna ruta bajo /mnt/c/Users/.
    if [[ "$WINUSER" == *..* || "$WINUSER" == */* || "$WINUSER" == *\\* ]]; then
        echo "  !!  WINUSER contiene caracteres no válidos: '$WINUSER'"
        exit 1
    fi
    WIN_VSCODE_DIR="/mnt/c/Users/${WINUSER}/AppData/Roaming/Code/User"
    if [[ ! -d "/mnt/c/Users/${WINUSER}" ]]; then
        echo "  !!  /mnt/c/ no está montado o el usuario '${WINUSER}' no existe."
        echo "      Comprueba que WSL tiene acceso a C:\\."
        exit 0   # aviso sin error: no bloquea make install
    fi
    VSCODE_CONFIG_DIR="$WIN_VSCODE_DIR"
    KEYBINDINGS_SRC="keybindings.linux.json"
fi

echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}   Instalador de Configuración VS Code   ${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""

# Función para hacer backup
backup_current_config() {
    echo -e "${YELLOW}Creando backup de la configuración actual...${NC}"

    BACKUP_DIR="$HOME/vscode-config-backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    if [ -f "$VSCODE_CONFIG_DIR/settings.json" ]; then
        cp "$VSCODE_CONFIG_DIR/settings.json" "$BACKUP_DIR/"
        echo -e "${GREEN}✓${NC} settings.json guardado"
    fi

    if [ -f "$VSCODE_CONFIG_DIR/keybindings.json" ]; then
        cp "$VSCODE_CONFIG_DIR/keybindings.json" "$BACKUP_DIR/"
        echo -e "${GREEN}✓${NC} keybindings.json guardado"
    fi

    echo -e "${GREEN}Backup creado en: $BACKUP_DIR${NC}"
    echo ""
}

# Copia idempotente: evita tocar el destino si los contenidos son idénticos (WSL).
_copy_idempotent() {
    local src="$1" dst="$2"
    if [[ ! -f "$src" ]]; then
        echo -e "${RED}✗${NC} $(basename "$src") no encontrado en el repo"
        return
    fi
    mkdir -p "$(dirname "$dst")"
    if [[ -f "$dst" ]] && diff -q "$src" "$dst" >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $(basename "$dst") sin cambios (destino ya actualizado)"
    else
        cp -f "$src" "$dst"
        echo -e "${GREEN}✓${NC} $(basename "$dst") copiado"
    fi
}

# Hacer backup si se solicita
if [[ "$1" == "--backup" ]]; then
    backup_current_config
fi

# Crear directorios si no existen
echo -e "${YELLOW}Verificando directorios...${NC}"
mkdir -p "$VSCODE_CONFIG_DIR"
mkdir -p "$VSCODE_DIR/extensions"

# Enlazar configuraciones (symlink fuera de WSL; copia idempotente en WSL)
echo -e "${YELLOW}Enlazando configuraciones...${NC}"

if [[ "$_is_wsl" -eq 1 ]]; then
    _copy_idempotent "$REPO_CONFIG_DIR/settings.json" "$VSCODE_CONFIG_DIR/settings.json"
    _copy_idempotent "$REPO_CONFIG_DIR/$KEYBINDINGS_SRC" "$VSCODE_CONFIG_DIR/keybindings.json"
else
    if [ -f "$REPO_CONFIG_DIR/settings.json" ]; then
        ln -sfn "$REPO_CONFIG_DIR/settings.json" "$VSCODE_CONFIG_DIR/settings.json"
        echo -e "${GREEN}✓${NC} settings.json enlazado"
    else
        echo -e "${RED}✗${NC} settings.json no encontrado"
    fi

    if [ -f "$REPO_CONFIG_DIR/$KEYBINDINGS_SRC" ]; then
        ln -sfn "$REPO_CONFIG_DIR/$KEYBINDINGS_SRC" "$VSCODE_CONFIG_DIR/keybindings.json"
        echo -e "${GREEN}✓${NC} keybindings.json enlazado (desde $KEYBINDINGS_SRC)"
    else
        echo -e "${RED}✗${NC} $KEYBINDINGS_SRC no encontrado"
    fi
fi

# Instalar el tema como extensión REGISTRADA (VSIX).
# Una carpeta suelta en ~/.vscode/extensions NO la carga VS Code moderno: solo
# carga lo que está en extensions.json. Por eso empaquetamos el manifiesto +
# temas con vsce (vía npx) y lo instalamos con `code --install-extension`, que
# es lo que registra la extensión de verdad.
echo -e "${YELLOW}Instalando tema (VSIX)...${NC}"

if command -v code >/dev/null 2>&1; then
    VSIX="$(mktemp -d)/dotmesh-themes.vsix"
    if (cd "$REPO_DIR" && npx --yes @vscode/vsce package \
            --allow-missing-repository --skip-license -o "$VSIX" >/dev/null 2>&1); then
        code --install-extension "$VSIX" --force
        echo -e "${GREEN}✓${NC} Tema instalado y registrado (dotmesh)"
    else
        echo -e "${RED}✗${NC} No se pudo empaquetar el VSIX (¿npx/red?); tema no instalado."
    fi
else
    echo -e "${YELLOW}⚠${NC} 'code' no disponible; me salto el tema."
fi

# Refrescar los temas en las extensiones ya instaladas (idempotente, sin red).
# La extensión se instala como copia empaquetada, así que editar un JSON de tema
# en el repo no llega a VS Code hasta refrescar esa copia. Este paso lo hace
# aunque se haya saltado el reempaquetado del VSIX (sin 'code' ni npx). Con
# nullglob, los globs sin coincidencias se expanden a nada en vez de al literal.
shopt -s nullglob
THEME_FILES=("$REPO_DIR/themes/"*.json)
if [ ${#THEME_FILES[@]} -gt 0 ]; then
    for _ext_dir in "$VSCODE_DIR/extensions/$EXT_ID-"*/; do
        _ext_dir="${_ext_dir%/}"
        # Salta symlinks: no escribas a través de un enlace hacia una ruta ajena.
        if [ -L "$_ext_dir" ] || [ ! -d "$_ext_dir/themes" ]; then
            continue
        fi
        cp -f "${THEME_FILES[@]}" "$_ext_dir/themes/"
        echo -e "${GREEN}✓${NC} Temas sincronizados en $(basename "$_ext_dir")"
    done
fi
shopt -u nullglob

# Instalar extensiones
echo ""
echo -e "${YELLOW}Instalando extensiones...${NC}"

if [ -f "$REPO_DIR/extensions/extensions.json" ]; then
    # Verificar si code está en el PATH
    if ! command -v code &> /dev/null; then
        echo -e "${RED}✗${NC} El comando 'code' no está disponible."
        echo -e "${YELLOW}Por favor, instala el comando 'code' en VS Code:${NC}"
        echo -e "  1. Abre VS Code"
        echo -e "  2. Presiona Cmd+Shift+P"
        echo -e "  3. Escribe 'Shell Command: Install code command in PATH'"
        echo -e "  4. Ejecuta este script nuevamente"
    else
        # Leer el archivo JSON y extraer los IDs de extensiones
        extensions=$(cat "$REPO_DIR/extensions/extensions.json" | grep '"' | cut -d'"' -f2)

        for ext in $extensions; do
            if [ -n "$ext" ]; then
                echo -e "Instalando ${BLUE}$ext${NC}..."
                code --install-extension "$ext" --force
            fi
        done

        echo -e "${GREEN}✓${NC} Extensiones instaladas"
    fi
else
    echo -e "${YELLOW}⚠${NC} No se encontró extensions.json"
fi

echo ""
echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}     ¡Instalación completada! 🎉        ${NC}"
echo -e "${GREEN}===========================================${NC}"
echo ""
echo -e "${YELLOW}Nota:${NC} Reinicia VS Code para aplicar todos los cambios."
echo ""

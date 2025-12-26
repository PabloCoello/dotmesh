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

# Verificar si estamos en macOS o Linux
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    VSCODE_CONFIG_DIR="$HOME/.config/Code/User"
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

# Hacer backup si se solicita
if [[ "$1" == "--backup" ]]; then
    backup_current_config
fi

# Crear directorios si no existen
echo -e "${YELLOW}Verificando directorios...${NC}"
mkdir -p "$VSCODE_CONFIG_DIR"
mkdir -p "$VSCODE_DIR/extensions"

# Instalar configuraciones
echo -e "${YELLOW}Instalando configuraciones...${NC}"

if [ -f "$REPO_CONFIG_DIR/settings.json" ]; then
    cp "$REPO_CONFIG_DIR/settings.json" "$VSCODE_CONFIG_DIR/"
    echo -e "${GREEN}✓${NC} settings.json instalado"
else
    echo -e "${RED}✗${NC} settings.json no encontrado"
fi

if [ -f "$REPO_CONFIG_DIR/keybindings.json" ]; then
    cp "$REPO_CONFIG_DIR/keybindings.json" "$VSCODE_CONFIG_DIR/"
    echo -e "${GREEN}✓${NC} keybindings.json instalado"
else
    echo -e "${RED}✗${NC} keybindings.json no encontrado"
fi

# Instalar temas
echo -e "${YELLOW}Instalando temas...${NC}"

THEME_DEST="$VSCODE_DIR/extensions/betheme-collection"
mkdir -p "$THEME_DEST"

cp "$REPO_DIR/package.json" "$THEME_DEST/"
cp -r "$REPO_DIR/themes" "$THEME_DEST/"

echo -e "${GREEN}✓${NC} Temas instalados"

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

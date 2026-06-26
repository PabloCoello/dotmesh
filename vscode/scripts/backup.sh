#!/bin/bash

# Script de backup de configuración de VS Code al repositorio
# Autor: Pablo Coello
# Uso: ./backup.sh

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

# Detectar plataforma: ruta de config y variante de keybindings del repo
KEYBINDINGS_DEST="keybindings.json"            # macOS usa cmd+
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    VSCODE_CONFIG_DIR="$HOME/.config/Code/User"
    KEYBINDINGS_DEST="keybindings.linux.json"  # Linux usa ctrl+
fi

echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}   Backup de Configuración VS Code       ${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""

# Crear directorios si no existen
mkdir -p "$REPO_CONFIG_DIR"
mkdir -p "$REPO_DIR/extensions"

# Backup de settings.json
echo -e "${YELLOW}Haciendo backup de configuraciones...${NC}"

if [ -f "$VSCODE_CONFIG_DIR/settings.json" ]; then
    cp "$VSCODE_CONFIG_DIR/settings.json" "$REPO_CONFIG_DIR/"
    echo -e "${GREEN}✓${NC} settings.json respaldado"
else
    echo -e "${RED}✗${NC} settings.json no encontrado en VS Code"
fi

# Backup de keybindings.json
if [ -f "$VSCODE_CONFIG_DIR/keybindings.json" ]; then
    cp "$VSCODE_CONFIG_DIR/keybindings.json" "$REPO_CONFIG_DIR/$KEYBINDINGS_DEST"
    echo -e "${GREEN}✓${NC} keybindings.json respaldado (en $KEYBINDINGS_DEST)"
else
    echo -e "${RED}✗${NC} keybindings.json no encontrado en VS Code"
fi

# Backup de snippets
if [ -d "$VSCODE_CONFIG_DIR/snippets" ]; then
    mkdir -p "$REPO_CONFIG_DIR/snippets"
    cp -r "$VSCODE_CONFIG_DIR/snippets/"* "$REPO_CONFIG_DIR/snippets/" 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Snippets respaldados"
fi

# Exportar lista de extensiones
echo ""
echo -e "${YELLOW}Exportando lista de extensiones...${NC}"

if command -v code &> /dev/null; then
    code --list-extensions > "$REPO_DIR/extensions/extensions.txt"
    
    # Crear también un archivo JSON
    echo "[" > "$REPO_DIR/extensions/extensions.json"
    extensions=$(code --list-extensions)
    first=true
    for ext in $extensions; do
        if [ "$first" = true ]; then
            echo "  \"$ext\"" >> "$REPO_DIR/extensions/extensions.json"
            first=false
        else
            echo "  ,\"$ext\"" >> "$REPO_DIR/extensions/extensions.json"
        fi
    done
    echo "]" >> "$REPO_DIR/extensions/extensions.json"
    
    echo -e "${GREEN}✓${NC} Lista de extensiones exportada"
    echo -e "  - extensions.txt: $(wc -l < "$REPO_DIR/extensions/extensions.txt" | tr -d ' ') extensiones"
else
    echo -e "${RED}✗${NC} El comando 'code' no está disponible"
fi

# Mostrar resumen
echo ""
echo -e "${GREEN}===========================================${NC}"
echo -e "${GREEN}     ¡Backup completado! 💾             ${NC}"
echo -e "${GREEN}===========================================${NC}"
echo ""
echo -e "Archivos guardados en:"
echo -e "  ${BLUE}$REPO_CONFIG_DIR/${NC}"
echo -e "  ${BLUE}$REPO_DIR/extensions/${NC}"
echo ""
echo -e "${YELLOW}Nota:${NC} No olvides hacer commit de los cambios al repositorio."
echo ""

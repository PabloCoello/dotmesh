#!/bin/bash

# Script para verificar la instalación de la configuración de VS Code
# Autor: Pablo Coello

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

VSCODE_CONFIG_DIR="$HOME/Library/Application Support/Code/User"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    VSCODE_CONFIG_DIR="$HOME/.config/Code/User"
fi

echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}   Verificación de Configuración         ${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""

# Verificar settings.json
echo -e "${YELLOW}Verificando archivos de configuración...${NC}"
if [ -f "$VSCODE_CONFIG_DIR/settings.json" ]; then
    echo -e "${GREEN}✓${NC} settings.json encontrado"
else
    echo -e "${RED}✗${NC} settings.json NO encontrado"
fi

# Verificar keybindings.json
if [ -f "$VSCODE_CONFIG_DIR/keybindings.json" ]; then
    echo -e "${GREEN}✓${NC} keybindings.json encontrado"
else
    echo -e "${RED}✗${NC} keybindings.json NO encontrado"
fi

# Verificar temas
echo ""
echo -e "${YELLOW}Verificando temas instalados...${NC}"
THEME_DIR="$HOME/.vscode/extensions/betheme-collection"
if [ -d "$THEME_DIR" ]; then
    echo -e "${GREEN}✓${NC} Temas instalados en $THEME_DIR"
    if [ -f "$THEME_DIR/package.json" ]; then
        echo -e "${GREEN}✓${NC} package.json del tema encontrado"
    fi
    if [ -d "$THEME_DIR/themes" ]; then
        theme_count=$(ls -1 "$THEME_DIR/themes" | wc -l | tr -d ' ')
        echo -e "${GREEN}✓${NC} $theme_count archivos de tema encontrados"
    fi
else
    echo -e "${RED}✗${NC} Directorio de temas NO encontrado"
fi

# Verificar comando code
echo ""
echo -e "${YELLOW}Verificando herramientas...${NC}"
if command -v code &> /dev/null; then
    version=$(code --version | head -n 1)
    echo -e "${GREEN}✓${NC} Comando 'code' disponible (VS Code $version)"
else
    echo -e "${RED}✗${NC} Comando 'code' NO disponible"
    echo -e "  ${YELLOW}Instálalo desde VS Code: Cmd+Shift+P > 'Shell Command: Install code command in PATH'${NC}"
fi

# Contar extensiones instaladas
echo ""
echo -e "${YELLOW}Verificando extensiones...${NC}"
if command -v code &> /dev/null; then
    ext_count=$(code --list-extensions | wc -l | tr -d ' ')
    echo -e "${GREEN}✓${NC} $ext_count extensiones instaladas"
    
    # Verificar extensiones del repo
    if [ -f "$REPO_DIR/extensions/extensions.json" ]; then
        echo ""
        echo -e "${BLUE}Extensiones recomendadas en el repositorio:${NC}"
        cat "$REPO_DIR/extensions/extensions.json" | grep '"' | cut -d'"' -f2 | while read ext; do
            if code --list-extensions | grep -q "^$ext$"; then
                echo -e "  ${GREEN}✓${NC} $ext"
            else
                echo -e "  ${RED}✗${NC} $ext (no instalada)"
            fi
        done
    fi
else
    echo -e "${YELLOW}⚠${NC} No se pueden verificar extensiones (comando 'code' no disponible)"
fi

echo ""
echo -e "${BLUE}===========================================${NC}"
echo -e "${GREEN}   Verificación completada               ${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""

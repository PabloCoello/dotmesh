#!/usr/bin/env bash
# backup-current-config.sh
# Respalda las configuraciones actuales antes de aplicar dotfiles

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/dotfiles-backup/$TIMESTAMP"

echo "🗂️  Creando backup de configuraciones actuales..."
echo "📁 Directorio: $BACKUP_DIR"
echo ""

# Crear directorio de backup
mkdir -p "$BACKUP_DIR"

# ─────────────────────────────────────────────
# ➤ SHELL
# ─────────────────────────────────────────────
echo "🐚 Respaldando configuraciones de shell..."

if [ -f "$HOME/.zshrc" ]; then
    cp "$HOME/.zshrc" "$BACKUP_DIR/zshrc"
    echo "  ✓ .zshrc"
fi

if [ -f "$HOME/.zprofile" ]; then
    cp "$HOME/.zprofile" "$BACKUP_DIR/zprofile"
    echo "  ✓ .zprofile"
fi

if [ -d "$HOME/.config/shell" ]; then
    cp -r "$HOME/.config/shell" "$BACKUP_DIR/shell"
    echo "  ✓ .config/shell/"
fi

# ─────────────────────────────────────────────
# ➤ NEOVIM
# ─────────────────────────────────────────────
echo ""
echo "⚙️  Respaldando configuración de Neovim..."

if [ -d "$HOME/.config/nvim" ]; then
    cp -r "$HOME/.config/nvim" "$BACKUP_DIR/nvim"
    echo "  ✓ .config/nvim/"
fi

# ─────────────────────────────────────────────
# ➤ GIT
# ─────────────────────────────────────────────
echo ""
echo "🌿 Respaldando configuraciones de Git..."

if [ -f "$HOME/.gitconfig" ]; then
    cp "$HOME/.gitconfig" "$BACKUP_DIR/gitconfig"
    echo "  ✓ .gitconfig"
fi

if [ -f "$HOME/.gitignore_global" ]; then
    cp "$HOME/.gitignore_global" "$BACKUP_DIR/gitignore_global"
    echo "  ✓ .gitignore_global"
fi

# ─────────────────────────────────────────────
# ➤ GHOSTTY
# ─────────────────────────────────────────────
echo ""
echo "👻 Respaldando configuración de Ghostty..."

if [ -f "$HOME/.config/ghostty/config" ]; then
    mkdir -p "$BACKUP_DIR/ghostty"
    cp "$HOME/.config/ghostty/config" "$BACKUP_DIR/ghostty/config"
    echo "  ✓ .config/ghostty/config"
fi

# ─────────────────────────────────────────────
# ➤ STARSHIP
# ─────────────────────────────────────────────
echo ""
echo "🚀 Respaldando configuración de Starship..."

if [ -f "$HOME/.config/starship.toml" ]; then
    cp "$HOME/.config/starship.toml" "$BACKUP_DIR/starship.toml"
    echo "  ✓ .config/starship.toml"
fi

# ─────────────────────────────────────────────
# ➤ VSCODE
# ─────────────────────────────────────────────
echo ""
echo "🧩 Respaldando configuración de VS Code..."

VSCODE_CONFIG_DIR="$HOME/Library/Application Support/Code/User"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    VSCODE_CONFIG_DIR="$HOME/.config/Code/User"
fi

if [ -f "$VSCODE_CONFIG_DIR/settings.json" ]; then
    mkdir -p "$BACKUP_DIR/vscode"
    cp "$VSCODE_CONFIG_DIR/settings.json" "$BACKUP_DIR/vscode/settings.json"
    echo "  ✓ VS Code settings.json"
fi

if [ -f "$VSCODE_CONFIG_DIR/keybindings.json" ]; then
    mkdir -p "$BACKUP_DIR/vscode"
    cp "$VSCODE_CONFIG_DIR/keybindings.json" "$BACKUP_DIR/vscode/keybindings.json"
    echo "  ✓ VS Code keybindings.json"
fi

if [ -d "$VSCODE_CONFIG_DIR/snippets" ]; then
    mkdir -p "$BACKUP_DIR/vscode/snippets"
    cp -r "$VSCODE_CONFIG_DIR/snippets" "$BACKUP_DIR/vscode/"
    echo "  ✓ VS Code snippets/"
fi

# ─────────────────────────────────────────────
# ➤ RESUMEN
# ─────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Backup completado"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📂 Ubicación: $BACKUP_DIR"
echo ""
echo "Para restaurar un archivo específico:"
echo "  cp $BACKUP_DIR/<archivo> ~/<destino>"
echo ""
echo "Para restaurar todo:"
echo "  cp -r $BACKUP_DIR/* ~/"
echo ""

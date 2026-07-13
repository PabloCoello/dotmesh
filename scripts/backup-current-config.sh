#!/usr/bin/env bash
# backup-current-config.sh
# Respalda las configuraciones actuales antes de aplicar dotfiles

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/dotfiles-backup/$TIMESTAMP"

echo "Creando backup en $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

backup_file() {
    local src="$1"
    local dst_rel="$2"
    if [ -e "$src" ]; then
        local dst="$BACKUP_DIR/$dst_rel"
        mkdir -p "$(dirname "$dst")"
        cp -R "$src" "$dst"
        echo "  ok  $dst_rel"
    fi
}

# Shell / prompt
backup_file "$HOME/.zshrc"                "zshrc"
backup_file "$HOME/.zprofile"             "zprofile"
backup_file "$HOME/.config/shell"         "config/shell"
backup_file "$HOME/.config/starship.toml" "config/starship.toml"

# Git
backup_file "$HOME/.gitconfig"        "gitconfig"
backup_file "$HOME/.gitignore_global" "gitignore_global"
backup_file "$HOME/.gitmessage"       "gitmessage"

# VS Code
VSCODE_DIR="$HOME/Library/Application Support/Code/User"
[ "$(uname)" = "Linux" ] && VSCODE_DIR="$HOME/.config/Code/User"
backup_file "$VSCODE_DIR/settings.json"    "vscode/settings.json"
backup_file "$VSCODE_DIR/keybindings.json" "vscode/keybindings.json"
backup_file "$VSCODE_DIR/snippets"         "vscode/snippets"

# Claude Code
backup_file "$HOME/.claude/settings.json"     "claude/settings.json"
backup_file "$HOME/.claude/CLAUDE.md"         "claude/CLAUDE.md"
backup_file "$HOME/.claude/AGENTS.md"         "claude/AGENTS.md"
backup_file "$HOME/.claude/statusline.sh"     "claude/statusline.sh"
backup_file "$HOME/.claude/hooks"             "claude/hooks"
backup_file "$HOME/.claude/agents"            "claude/agents"
backup_file "$HOME/.claude/commands"          "claude/commands"
backup_file "$HOME/.claude/output-styles"     "claude/output-styles"
backup_file "$HOME/.claude/mcp"               "claude/mcp"

# OpenCode
backup_file "$HOME/.config/opencode/opencode.json" "config/opencode/opencode.json"
backup_file "$HOME/.config/opencode/agents"        "config/opencode/agents"
backup_file "$HOME/.config/opencode/commands"      "config/opencode/commands"

# Codex
backup_file "$HOME/.codex/config.toml" "codex/config.toml"
backup_file "$HOME/.codex/AGENTS.md"   "codex/AGENTS.md"

# Skills
backup_file "$HOME/.agents/skills" "agents/skills"

# GNOME (Linux)
if [ "$(uname)" = "Linux" ]; then
    backup_file "$HOME/.config/gtk-3.0/gtk.css" "config/gtk-3.0/gtk.css"
    backup_file "$HOME/.config/gtk-4.0/gtk.css" "config/gtk-4.0/gtk.css"
fi

echo ""
echo "Backup completado en: $BACKUP_DIR"

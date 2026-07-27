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

# VS Code: la ruta depende del SO y de si estamos en WSL.
if [ "$(uname)" = "Darwin" ]; then
    VSCODE_DIR="$HOME/Library/Application Support/Code/User"
elif [ -n "$WSL_DISTRO_NAME" ] || grep -qi microsoft /proc/version 2>/dev/null; then
    # WSL: los settings que usa VS Code están en el lado Windows
    _wsl_user="${WINUSER:-}"
    if [ -z "$_wsl_user" ] && command -v cmd.exe >/dev/null 2>&1; then
        _wsl_user=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r\n') || true
    fi
    if [ -z "$_wsl_user" ] && command -v wslvar >/dev/null 2>&1; then
        _wsl_user=$(wslvar USERNAME 2>/dev/null) || true
    fi
    # Valida el usuario antes de construir ninguna ruta bajo /mnt/c/Users/.
    case "$_wsl_user" in
        *..*|*/*|*\\*)
            echo "  !!  WINUSER contiene caracteres no válidos: '$_wsl_user'; backup de VS Code omitido"
            VSCODE_DIR=""
            ;;
        *)
            if [ -n "$_wsl_user" ] && [ -d "/mnt/c/Users/$_wsl_user" ]; then
                VSCODE_DIR="/mnt/c/Users/${_wsl_user}/AppData/Roaming/Code/User"
            else
                echo "  !!  WSL detectado pero /mnt/c/ no accesible; backup de VS Code omitido"
                VSCODE_DIR=""
            fi
            ;;
    esac
else
    VSCODE_DIR="$HOME/.config/Code/User"
fi
[ -n "$VSCODE_DIR" ] && backup_file "$VSCODE_DIR/settings.json"    "vscode/settings.json"
[ -n "$VSCODE_DIR" ] && backup_file "$VSCODE_DIR/keybindings.json" "vscode/keybindings.json"
[ -n "$VSCODE_DIR" ] && backup_file "$VSCODE_DIR/snippets"         "vscode/snippets"

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

# Installation Guide

## Prerequisites

Before installing, ensure you have:

- **macOS** (tested on Apple Silicon)
- **Homebrew** installed
- **Git** installed
- **Backup** of your current configs (the install script does this automatically)

## Quick Install

```bash
# Clone the repository
git clone https://github.com/pablocoello/dotfiles.git ~/Documents/GitHub/dotfiles
cd ~/Documents/GitHub/dotfiles

# Install GNU Stow if not installed
brew install stow

# Run health check
make health

# Install everything (backs up existing configs first)
make install

# Reload your shell
exec zsh
```

## What Gets Installed

### Bloque 1 (Foundation) ✅

- **Shell**: Modular Zsh configuration with Oh-My-Zsh
- **Git**: Enhanced config with Delta diff viewer
- **Ghostty**: Terminal with Pandora theme
- **Starship**: Custom prompt configuration
- **Themes**: Pandora color palette system

### Bloque 2 (Coming Soon)

- **Neovim**: Complete IDE configuration
- **AI Integration**: opencode.nvim (OpenCode) + Ollama

### Bloque 3 (Coming Soon)

- **Obsidian**: Pandora vault integration
- **Zotero**: Reference management

## Manual Steps

### 1. Install Required Tools

```bash
# Terminal & Shell
brew install ghostty
brew install starship

# Git tools
brew install git-delta

# Modern CLI tools (optional but recommended)
brew install eza bat fd ripgrep fzf

# Fonts
brew tap homebrew/cask-fonts
brew install font-jetbrains-mono-nerd-font
```

### 2. Configure Ollama (Optional - for AI features in Bloque 2)

```bash
# Update OLLAMA_HOST in shell/.config/shell/ai.zsh
# Default: http://192.168.1.100:11434
```

### 3. First Time Setup

After installation:

```bash
# Source your new shell config
exec zsh

# Test Starship
starship --version

# Test Git delta
git diff

# Check AI server (if configured)
aistatus
```

## Customization

### Update RTX 3090 Server IP

Edit `shell/.config/shell/ai.zsh`:
```bash
export OLLAMA_HOST="http://YOUR_IP:11434"
```

### Change Theme Colors

1. Edit `themes/pandora/palette.json`
2. Run `make theme` to regenerate configs
3. Restart terminal

### Add Custom Aliases

Edit `shell/.config/shell/aliases.zsh` and reload:
```bash
exec zsh
```

## Troubleshooting

### Symlinks Not Created

```bash
# Check stow is installed
brew install stow

# Manually stow a package
cd ~/Documents/GitHub/dotfiles
stow -v shell
```

### Shell Not Loading Configs

```bash
# Check .zshrc location
ls -la ~/.zshrc

# Should be a symlink to dotfiles/shell/.zshrc
```

### Ollama Not Connecting

```bash
# Test connection
curl http://YOUR_IP:11434/api/tags

# Check status
aistatus
```

## Uninstall

```bash
cd ~/Documents/GitHub/dotfiles

# Remove symlinks
make unstow

# Restore from backup
cp -r ~/dotfiles-backup/LATEST/* ~/
```

## Next Steps

- [ ] Explore custom functions: `qpy`, `qr`, `qrender`
- [ ] Configure AI models (Bloque 2)
- [ ] Set up Obsidian vault (Bloque 3)
- [ ] Customize Neovim (Bloque 2)

For more information, see [PLAN.md](../PLAN.md).

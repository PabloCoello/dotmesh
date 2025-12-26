.PHONY: help install backup stow unstow health clean theme

# Default target
help:
	@echo "Dotfiles Management"
	@echo ""
	@echo "Usage:"
	@echo "  make install  - Full install (backup + stow)"
	@echo "  make backup   - Backup existing configs"
	@echo "  make stow     - Symlink configs using GNU Stow"
	@echo "  make unstow   - Remove symlinks"
	@echo "  make health   - Check system health"
	@echo "  make clean    - Remove backups"
	@echo "  make theme    - Regenerate theme files"

install: backup stow
	@echo "✅ Installation complete!"
	@echo "⚠️  Reload your shell: exec zsh"

backup:
	@echo "📦 Backing up existing configs..."
	@./scripts/backup-current-config.sh

stow:
	@echo "🔗 Creating symlinks with GNU Stow..."
	@stow -v -t ~ shell
	@stow -v -t ~ git
	@stow -v -t ~ ghostty
	@stow -v -t ~ starship
	@stow -v -t ~ nvim
	@stow -v -t ~ tmux
	@stow -v -t ~ vscode
	@echo "✅ Symlinks created"

unstow:
	@echo "🔓 Removing symlinks..."
	@stow -D -t ~ shell git ghostty starship nvim tmux vscode
	@echo "✅ Symlinks removed"

health:
	@echo "🏥 Checking system health..."
	@command -v nvim > /dev/null && echo "✅ Neovim installed" || echo "❌ Neovim not found"
	@command -v stow > /dev/null && echo "✅ GNU Stow installed" || echo "❌ GNU Stow not found"
	@command -v git > /dev/null && echo "✅ Git installed" || echo "❌ Git not found"
	@command -v zsh > /dev/null && echo "✅ Zsh installed" || echo "❌ Zsh not found"
	@command -v starship > /dev/null && echo "✅ Starship installed" || echo "❌ Starship not found"
	@command -v delta > /dev/null && echo "✅ Delta installed" || echo "❌ Delta not found"
	@command -v tmux > /dev/null && echo "✅ tmux installed" || echo "❌ tmux not found"

clean:
	@echo "🗑️  Cleaning backups..."
	@rm -rf ~/dotfiles-backup/*
	@echo "✅ Backups cleaned"

theme:
	@echo "🎨 Regenerating theme files..."
	@cd themes/pandora && python3 export.py
	@echo "✅ Theme files updated"

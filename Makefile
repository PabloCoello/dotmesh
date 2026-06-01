.PHONY: help install backup stow unstow restow link-skills health clean fonts terax-freeze terax-thaw

PACKAGES := shell git starship vscode opencode codex claude agents terax
SKILLS_SRC := $(HOME)/.agents/skills
SKILLS_DST := $(HOME)/.claude/skills
TERAX_DIR := terax/Library/Application Support/app.crynta.terax

help:
	@echo "dotmesh — gestión de dotfiles"
	@echo ""
	@echo "Targets:"
	@echo "  make install   - backup + stow"
	@echo "  make backup    - Respalda configs actuales en ~/dotfiles-backup"
	@echo "  make stow      - Aplica symlinks con GNU Stow"
	@echo "  make unstow    - Elimina symlinks"
	@echo "  make restow    - unstow + stow (útil tras añadir/quitar ficheros)"
	@echo "  make link-skills - Symlink ~/.claude/skills -> ~/.agents/skills"
	@echo "  make fonts     - Instala las Nerd Fonts del Brewfile (brew bundle)"
	@echo "  make health    - Verifica que las herramientas estén instaladas"
	@echo "  make clean     - Vacía ~/dotfiles-backup"
	@echo ""
	@echo "  make terax-freeze - Ignora cambios locales de terax-settings.json (Terax lo reescribe)"
	@echo "  make terax-thaw   - Vuelve a seguir terax-settings.json para capturar cambios"
	@echo ""
	@echo "Paquetes: $(PACKAGES)"

install: backup stow link-skills
	@echo "Instalación completa."
	@echo "Recarga la shell: exec zsh"

backup:
	@./scripts/backup-current-config.sh

fonts:
	@command -v brew >/dev/null || { echo "  --  brew no instalado"; exit 1; }
	@brew bundle --file=Brewfile

stow:
	@for pkg in $(PACKAGES); do \
		echo "→ stow $$pkg"; \
		stow -v -t ~ $$pkg; \
	done

unstow:
	@for pkg in $(PACKAGES); do \
		echo "← unstow $$pkg"; \
		stow -v -D -t ~ $$pkg; \
	done

restow:
	@for pkg in $(PACKAGES); do \
		echo "↻ restow $$pkg"; \
		stow -v -R -t ~ $$pkg; \
	done

link-skills:
	@if [ ! -d "$(SKILLS_SRC)" ]; then \
		echo "  --  $(SKILLS_SRC) no existe. Ejecuta 'make stow' antes."; \
		exit 1; \
	fi
	@mkdir -p "$(HOME)/.claude"
	@if [ -L "$(SKILLS_DST)" ]; then \
		current=$$(readlink "$(SKILLS_DST)"); \
		if [ "$$current" = "$(SKILLS_SRC)" ]; then \
			echo "  ok  $(SKILLS_DST) -> $(SKILLS_SRC)"; \
		else \
			echo "  ↻  reapuntando $(SKILLS_DST) ($$current -> $(SKILLS_SRC))"; \
			rm "$(SKILLS_DST)"; \
			ln -s "$(SKILLS_SRC)" "$(SKILLS_DST)"; \
			echo "  ok  $(SKILLS_DST) -> $(SKILLS_SRC)"; \
		fi; \
	elif [ -e "$(SKILLS_DST)" ]; then \
		echo "  !!  $(SKILLS_DST) existe y NO es symlink. Aborto para no perder contenido."; \
		echo "      Mueve o elimina $(SKILLS_DST) manualmente y reintenta."; \
		exit 1; \
	else \
		ln -s "$(SKILLS_SRC)" "$(SKILLS_DST)"; \
		echo "  ok  $(SKILLS_DST) -> $(SKILLS_SRC)"; \
	fi

health:
	@echo "Healthcheck:"
	@command -v zsh      >/dev/null && echo "  ok  zsh"      || echo "  --  zsh"
	@command -v stow     >/dev/null && echo "  ok  stow"     || echo "  --  stow"
	@command -v git      >/dev/null && echo "  ok  git"      || echo "  --  git"
	@command -v delta    >/dev/null && echo "  ok  delta"    || echo "  --  delta"
	@command -v starship >/dev/null && echo "  ok  starship" || echo "  --  starship"
	@command -v code     >/dev/null && echo "  ok  code (VS Code)" || echo "  --  code (VS Code)"
	@command -v claude   >/dev/null && echo "  ok  claude"   || echo "  --  claude"
	@command -v codex    >/dev/null && echo "  ok  codex"    || echo "  --  codex"
	@command -v opencode >/dev/null && echo "  ok  opencode" || echo "  --  opencode"
	@[ -d "/Applications/Terax.app" ] || [ -d "$(HOME)/Applications/Terax.app" ] && echo "  ok  Terax" || echo "  --  Terax"
	@fc-list 2>/dev/null | grep -qi "JetBrainsMono Nerd Font" && echo "  ok  JetBrainsMono Nerd Font" || echo "  --  JetBrainsMono Nerd Font (ejecuta 'make fonts')"

# Terax reescribe terax-settings.json en cada uso (reordena claves, modelos
# recientes…), ensuciando 'git status'. 'freeze' marca el fichero como
# skip-worktree para no ver ese ruido; 'thaw' lo revierte cuando quieras
# capturar y commitear un nuevo baseline. Es estado local de cada clon.
terax-freeze:
	@for f in "$(TERAX_DIR)/"*.json; do \
		git update-index --skip-worktree "$$f" && echo "  ok  congelado $$(basename "$$f")"; \
	done

terax-thaw:
	@for f in "$(TERAX_DIR)/"*.json; do \
		git update-index --no-skip-worktree "$$f" && echo "  ok  descongelado $$(basename "$$f")"; \
	done

clean:
	@rm -rf ~/dotfiles-backup/*
	@echo "Backups eliminados."

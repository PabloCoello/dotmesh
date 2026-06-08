.PHONY: help install backup stow unstow restow link-skills health clean

PACKAGES := shell git starship warp vscode opencode codex claude agents
SKILLS_SRC := $(HOME)/.agents/skills
SKILLS_DST := $(HOME)/.claude/skills

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
	@echo "  make health    - Verifica que las herramientas estén instaladas"
	@echo "  make clean     - Vacía ~/dotfiles-backup"
	@echo ""
	@echo "Paquetes: $(PACKAGES)"

install: backup stow link-skills
	@echo "Instalación completa."
	@echo "Recarga la shell: exec zsh"

backup:
	@./scripts/backup-current-config.sh

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

clean:
	@rm -rf ~/dotfiles-backup/*
	@echo "Backups eliminados."

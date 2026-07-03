.PHONY: help install backup stow unstow restow link-skills link-warp gnome-rice health clean

PACKAGES := shell git starship warp vscode opencode codex claude agents
SKILLS_SRC := $(HOME)/.agents/skills
SKILLS_DST := $(HOME)/.claude/skills
WARP_THEMES_SRC := $(abspath warp/.warp/themes)
WARP_THEMES_DST := $(HOME)/.local/share/warp-terminal/themes

help:
	@echo "dotmesh — gestión de dotfiles"
	@echo ""
	@echo "Targets:"
	@echo "  make install   - backup + stow + link-skills + link-warp"
	@echo "  make backup    - Respalda configs actuales en ~/dotfiles-backup"
	@echo "  make stow      - Aplica symlinks con GNU Stow"
	@echo "  make unstow    - Elimina symlinks"
	@echo "  make restow    - unstow + stow (útil tras añadir/quitar ficheros)"
	@echo "  make link-skills - Symlink ~/.claude/skills -> ~/.agents/skills"
	@echo "  make link-warp - Symlink temas Warp a la ruta XDG (solo Linux)"
	@echo "  make gnome-rice - Retint dotmesh del escritorio GNOME (solo Linux)"
	@echo "  make health    - Verifica que las herramientas estén instaladas"
	@echo "  make clean     - Vacía ~/dotfiles-backup"
	@echo ""
	@echo "Paquetes: $(PACKAGES)"

install: backup stow link-skills link-warp
	@echo "Instalación completa."
	@echo "Recarga la shell: exec zsh"

backup:
	@./scripts/backup-current-config.sh

stow:
	@for pkg in $(PACKAGES); do \
		echo "→ stow $$pkg"; \
		stow --no-folding -v -t ~ $$pkg || exit 1; \
	done

unstow:
	@for pkg in $(PACKAGES); do \
		echo "← unstow $$pkg"; \
		stow -v -D -t ~ $$pkg || exit 1; \
	done

restow:
	@for pkg in $(PACKAGES); do \
		echo "↻ restow $$pkg"; \
		stow --no-folding -v -R -t ~ $$pkg || exit 1; \
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

# macOS lee ~/.warp/themes (vía stow); Linux lee la ruta XDG. Solo Linux
# necesita este enlace; en macOS es un no-op informativo.
link-warp:
	@if [ "$$(uname -s)" != "Linux" ]; then \
		echo "  ok  temas Warp vía stow (~/.warp/themes); link-warp solo aplica en Linux"; \
	else \
		mkdir -p "$(WARP_THEMES_DST)"; \
		for src in "$(WARP_THEMES_SRC)"/*.yaml; do \
			name=$$(basename "$$src"); \
			dst="$(WARP_THEMES_DST)/$$name"; \
			if [ -L "$$dst" ]; then \
				current=$$(readlink "$$dst"); \
				if [ "$$current" = "$$src" ]; then \
					echo "  ok  $$dst -> $$src"; \
				else \
					echo "  ↻  reapuntando $$dst ($$current -> $$src)"; \
					rm "$$dst"; \
					ln -s "$$src" "$$dst"; \
					echo "  ok  $$dst -> $$src"; \
				fi; \
			elif [ -e "$$dst" ]; then \
				echo "  !!  $$dst existe y NO es symlink. Aborto para no perder contenido."; \
				echo "      Mueve o elimina $$dst manualmente y reintenta."; \
				exit 1; \
			else \
				ln -s "$$src" "$$dst"; \
				echo "  ok  $$dst -> $$src"; \
			fi; \
		done; \
	fi

# Rice del escritorio GNOME (retint sobre Yaru). Enlaza gtk.css por stow y
# aplica la capa dconf. Solo Linux; en macOS es un no-op informativo.
gnome-rice:
	@if [ "$$(uname -s)" != "Linux" ]; then \
		echo "  ok  gnome-rice solo aplica en Linux/GNOME; no-op aquí"; \
	else \
		echo "→ stow gnome (gtk.css)"; \
		stow --no-folding -v -t ~ gnome || exit 1; \
		echo "→ aplicando rice GNOME (dconf)"; \
		./gnome/scripts/apply-rice.sh; \
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
	@[ -L "$$HOME/.claude/skills" ] && [ -e "$$HOME/.claude/skills" ] && echo "  ok  skills (~/.claude/skills -> ~/.agents/skills)" || echo "  --  skills symlink ausente o roto (corre 'make link-skills')"

clean:
	@rm -rf ~/dotfiles-backup/*
	@echo "Backups eliminados."

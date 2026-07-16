.PHONY: help install backup stow unstow restow link-skills vscode-install review-build review-install run-build run-install cli-build seed-claude-settings gnome-rice gnome-unrice health clean test-scribe-flow

# vscode se stowea solo en macOS (~/Library/…); en Linux VS Code lee ~/.config/Code/User,
# que configura vscode-install vía install.sh. gnome sigue el mismo patrón condicional.
PACKAGES := shell git starship ghostty herdr opencode codex claude agents
ifeq ($(shell uname -s),Darwin)
PACKAGES += vscode
endif
SKILLS_SRC := $(HOME)/.agents/skills
SKILLS_DST := $(HOME)/.claude/skills
CLAUDE_SETTINGS_SRC := $(abspath claude/.claude/settings.json)
CLAUDE_SETTINGS_DST := $(HOME)/.claude/settings.json

help:
	@echo "dotmesh — gestión de dotfiles"
	@echo ""
	@echo "Targets:"
	@echo "  make install   - backup + stow + review-install + link-skills"
	@echo "  make backup    - Respalda configs actuales en ~/dotfiles-backup"
	@echo "  make stow      - Aplica symlinks con GNU Stow"
	@echo "  make unstow    - Elimina symlinks"
	@echo "  make restow    - unstow + stow (útil tras añadir/quitar ficheros)"
	@echo "  make vscode-install - Configura VS Code (Linux: install.sh; macOS: no-op, va por stow)"
	@echo "  make review-build   - Compila la extensión mesh-review"
	@echo "  make review-install - Instala mesh-review en VS Code (requiere node y code)"
	@echo "  make run-build      - Compila la extensión mesh-run"
	@echo "  make run-install    - Instala mesh-run en VS Code (requiere node y code)"
	@echo "  make cli-build      - Compila el CLI mesh-review (genera agents/.agents/skills/doc-review/bin/mesh-review.mjs)"
	@echo "  make link-skills - Symlink ~/.claude/skills -> ~/.agents/skills"
	@echo "  make seed-claude-settings - Copia settings.json base a ~/.claude (no sobreescribe)"
	@echo "  make gnome-rice   - Retint dotmesh del escritorio GNOME (solo Linux)"
	@echo "  make gnome-unrice - Deshace los symlinks de gnome-rice (solo Linux; dconf: manual)"
	@echo "  make health    - Verifica que las herramientas estén instaladas"
	@echo "  make clean     - Vacía ~/dotfiles-backup"
	@echo "  make test-scribe-flow - Arnés headless scribe (requiere sesión de claude autenticada (keychain o ANTHROPIC_API_KEY))"
	@echo ""
	@echo "Paquetes: $(PACKAGES)"

install: backup stow vscode-install review-install run-install seed-claude-settings link-skills
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

# En Linux, VS Code ignora ~/Library y lee ~/.config/Code/User; install.sh crea los symlinks
# correctos y empaqueta el tema. En macOS el subárbol Library/... ya va por stow: no-op.
vscode-install:
	@if [ "$$(uname -s)" != "Linux" ]; then \
		echo "  ok  VS Code configurado vía stow en macOS; vscode-install es no-op aquí"; \
	else \
		echo "→ configurando VS Code (Linux: install.sh)"; \
		bash "$(abspath vscode/scripts/install.sh)"; \
	fi

review-build:
	@echo "→ build mesh-review"
	@(cd vscode/review-extension && npm run build)

cli-build:
	@echo "→ build mesh-review CLI"
	@(cd vscode/review-extension && npm run build)

review-install:
	@echo "→ instalando mesh-review"
	@if command -v code >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then \
		(cd vscode/review-extension && npm run install-ext); \
	else \
		echo "  !!  'code' o 'node' no disponibles; instálalos y ejecuta 'make review-install'"; \
	fi

run-build:
	@echo "→ build mesh-run"
	@(cd vscode/run-extension && npm run build)

run-install:
	@echo "→ instalando mesh-run"
	@if command -v code >/dev/null 2>&1 && command -v node >/dev/null 2>&1; then \
		(cd vscode/run-extension && npm run install-ext); \
	else \
		echo "  !!  'code' o 'node' no disponibles; instálalos y ejecuta 'make run-install'"; \
	fi

# settings.json es plantilla base y NO se enlaza con Stow (ver claude/.stow-local-ignore).
# Se copia una vez a un ~/.claude/settings.json REAL y nunca se sobreescribe, para que
# los ajustes por-máquina queden fuera del repo. Idempotente.
seed-claude-settings:
	@mkdir -p "$(HOME)/.claude"
	@if [ -L "$(CLAUDE_SETTINGS_DST)" ]; then \
		echo "  !!  $(CLAUDE_SETTINGS_DST) es un symlink de una instalación antigua."; \
		echo "      Conviértelo a fichero real una vez (conserva tu config actual):"; \
		echo "        cp --remove-destination \"\$$(readlink -f $(CLAUDE_SETTINGS_DST))\" $(CLAUDE_SETTINGS_DST)"; \
	elif [ -e "$(CLAUDE_SETTINGS_DST)" ]; then \
		echo "  ok  $(CLAUDE_SETTINGS_DST) ya es fichero local; no se toca"; \
	else \
		cp "$(CLAUDE_SETTINGS_SRC)" "$(CLAUDE_SETTINGS_DST)"; \
		echo "  ok  sembrado $(CLAUDE_SETTINGS_DST) desde la plantilla base"; \
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

# Deshace el stow de gnome (gtk.css y fondo). Solo Linux.
# La capa dconf no se revierte automáticamente: hazlo manualmente con
# dconf reset -f /org/gnome/ o cargando el backup de tu sesión anterior.
gnome-unrice:
	@if [ "$$(uname -s)" != "Linux" ]; then \
		echo "  ok  gnome-unrice solo aplica en Linux/GNOME; no-op aquí"; \
	else \
		systemctl --user disable --now dotmesh-monitor-guard.service 2>/dev/null || true; \
		echo "← unstow gnome (gtk.css)"; \
		stow -v -D -t ~ gnome || exit 1; \
		echo "  ok  symlinks de GNOME eliminados"; \
		echo "  !!  dconf no se revierte automáticamente; hazlo manualmente si es necesario"; \
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
	@command -v ghostty  >/dev/null && echo "  ok  ghostty"  || echo "  --  ghostty (brew install --cask ghostty)"
	@command -v herdr    >/dev/null && echo "  ok  herdr"    || echo "  --  herdr    (brew install herdr)"
	@command -v herdr >/dev/null && herdr integration status 2>/dev/null | grep -qE '^claude: current' && echo "  ok  integraciones herdr (claude·codex·opencode)" || echo "  --  integraciones herdr (ver docs/INSTALL.md)"
	@command -v jq       >/dev/null && echo "  ok  jq"       || echo "  --  jq  (requerido por los hooks de seguridad)"
	@command -v nvim     >/dev/null && echo "  ok  nvim"     || echo "  --  nvim"
	@command -v npx      >/dev/null && echo "  ok  npx"      || echo "  --  npx"
	@code --list-extensions 2>/dev/null | grep -q 'pablocoello.mesh-review' \
		&& echo "  ok  mesh-review" \
		|| echo "  --  mesh-review (corre 'make review-install')"
	@code --list-extensions 2>/dev/null | grep -q 'pablocoello.mesh-run' \
		&& echo "  ok  mesh-run" \
		|| echo "  --  mesh-run (corre 'make run-install')"
	@[ "$$(uname -s)" = "Linux" ] && { command -v gsettings >/dev/null && echo "  ok  gsettings" || echo "  --  gsettings"; } || true
	@[ "$$(uname -s)" = "Linux" ] && { systemctl --user is-active dotmesh-monitor-guard.service >/dev/null 2>&1 && echo "  ok  dotmesh-monitor-guard (eco tras hotplug de monitores)" || echo "  --  dotmesh-monitor-guard inactivo (corre 'make gnome-rice')"; } || true
	@[ -L "$$HOME/.claude/skills" ] && [ -e "$$HOME/.claude/skills" ] && echo "  ok  skills (~/.claude/skills -> ~/.agents/skills)" || echo "  --  skills symlink ausente o roto (corre 'make link-skills')"
	@[ -L "$$HOME/.zshrc" ] && [ -e "$$HOME/.zshrc" ] && echo "  ok  symlink ~/.zshrc" || echo "  --  ~/.zshrc no es symlink al repo (corre 'make stow')"
	@[ -L "$$HOME/.gitconfig" ] && [ -e "$$HOME/.gitconfig" ] && echo "  ok  symlink ~/.gitconfig" || echo "  --  ~/.gitconfig no es symlink al repo (corre 'make stow')"
	@[ -L "$$HOME/.config/starship.toml" ] && [ -e "$$HOME/.config/starship.toml" ] && echo "  ok  symlink ~/.config/starship.toml" || echo "  --  ~/.config/starship.toml no es symlink al repo (corre 'make stow')"

test-scribe-flow:
	@echo "→ arnés headless scribe"
	@bash scripts/test-scribe-flow.sh

clean:
	@rm -rf ~/dotfiles-backup/*
	@echo "Backups eliminados."

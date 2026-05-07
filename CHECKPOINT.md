# CHECKPOINT

## Date and branch

- Fecha: 2026-05-07.
- Rama: `main` (`main...origin/main`).
- Estado: cambios sin commit; nada preparado en el índice.
- `PLAN.md`: no existe en la raíz del proyecto.

## Done in this session

- Se redujo el alcance del repositorio a dotfiles para terminal, Git, Starship, VS Code y agentes de terminal.
- `Makefile` ahora trabaja con estos paquetes Stow: `shell`, `git`, `starship`, `vscode`, `opencode`, `codex`, `claude` y `agents`.
- `README.md` se reescribió con quick start, estructura actual, paquetes Stow, skills globales y comandos del Makefile.
- `docs/INSTALL.md` se simplificó para la instalación inicial, requisitos y rutas que instala cada paquete.
- `docs/TROUBLESHOOTING.md` quedó como guía reducida de incidencias comunes.
- `scripts/backup-current-config.sh` se acotó a shell, Git, VS Code, OpenCode, Codex, Claude y skills globales.
- `shell/.zshrc` incorporó rutas locales de Antigravity y OpenJDK 17.
- `vscode/Library/Application Support/Code/User/settings.json` tiene ajustes actualizados.
- Se añadieron paquetes nuevos sin seguimiento: `.gitignore`, `AGENTS.md`, `agents/`, `claude/`, `codex/`, `opencode/.config/` y `skills-lock.json`.
- Se eliminaron del árbol de trabajo áreas fuera del nuevo alcance: `nvim/`, `obsidian/`, `tmux/`, `ghostty/`, `themes/pandora/`, `examples/`, servicios locales de Obsidian/Zotero y scripts asociados.
- No había `CHECKPOINT.md` previo; no se archivó ningún checkpoint anterior.

## Pending

- Revisar y confirmar las eliminaciones masivas en `nvim/`, `obsidian/`, `tmux/`, `ghostty/`, `themes/pandora/`, `examples/`, `services/` y scripts relacionados.
- Añadir al índice los paquetes nuevos si forman parte del alcance final: `agents/`, `claude/`, `codex/`, `opencode/.config/`, `.gitignore`, `AGENTS.md` y `skills-lock.json`.
- Revisar `shell/.zshrc`: las rutas de Antigravity y OpenJDK 17 son específicas de esta máquina.
- Ejecutar `make health` antes de cerrar la preparación del repositorio.
- Ejecutar `/check-last` antes de cualquier commit para revisión y auditoría de seguridad.
- Crear `PLAN.md` o pasar por `design` si se retoma trabajo de implementación con especificación formal.

## Decisions made

- Mantener solo paquetes Stow vinculados al flujo de agentes en terminal. Justificación: reduce superficie de mantenimiento y evita versionar configuraciones ajenas al objetivo actual.
- Usar `agents/.agents/skills/` como ubicación versionada de skills globales. Justificación: permite enlazar `~/.agents/skills/` con Stow y compartir skills entre herramientas.
- Separar configuración de OpenCode, Codex y Claude en paquetes Stow propios. Justificación: cada herramienta tiene rutas y mecanismos de carga distintos.
- Simplificar documentación a `README.md`, `docs/INSTALL.md` y `docs/TROUBLESHOOTING.md`. Justificación: el repositorio ya no conserva documentación específica de Neovim, tmux, Obsidian o MCP antiguo.

## Next steps

1. Revisa el diff completo con foco en borrados y rutas específicas de usuario.
2. Decide si `shell/.zshrc` debe conservar las líneas de Antigravity y OpenJDK 17.
3. Ejecuta `make health`.
4. Ejecuta `/check-last`.
5. Si la revisión pasa, prepara un commit semántico con `/super-git`.

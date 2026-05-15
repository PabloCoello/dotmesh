# dotmesh

Dotfiles personales para macOS. Gestiona la configuración de terminal, shell, Git, Starship, VS Code, OpenCode, Codex, Claude y skills globales de agentes.

## Quick start

```bash
git clone https://github.com/pablocoello/dotmesh.git ~/Documents/GitHub/dotmesh
cd ~/Documents/GitHub/dotmesh

brew install stow                   # requisito
make health                         # comprueba binarios
make install                        # backup + stow
exec zsh                            # recarga la shell
```

## Stack

| Componente | Herramienta | Paquete Stow |
|---|---|---|
| Shell | Zsh + Oh-My-Zsh | [shell/](shell/) |
| Prompt | Starship | [starship/](starship/) |
| Editor | VS Code | [vscode/](vscode/) |
| VCS | Git + delta | [git/](git/) |
| Agente IA #1 | OpenCode | [opencode/](opencode/) |
| Agente IA #2 | Codex (CLI OpenAI) | [codex/](codex/) |
| Agente IA #3 | Claude Code | [claude/](claude/) (settings + agentes + comandos + mcp) |
| Skills globales | Convención `.agents/skills/` | [agents/](agents/) |

## Estructura

```
dotmesh/
├── shell/      .zshrc + .config/shell/{env,path,functions,aliases,ai}.zsh
├── git/        .gitconfig, .gitignore_global, .gitmessage
├── starship/   .config/starship.toml
├── vscode/     Library/Application Support/Code/User/{settings,extensions,scripts,themes}
├── opencode/   .config/opencode/{agents,commands,opencode.json,README.md}
├── codex/      .codex/{config.toml,AGENTS.md}
├── claude/     .claude/{settings.json,agents/,commands/,mcp/}
├── agents/     .agents/skills/<skill>/SKILL.md   (skills globales)
├── scripts/    backup-current-config.sh
├── docs/       INSTALL.md, SECRETS.md, TROUBLESHOOTING.md
├── Makefile
└── README.md
```

Cada paquete sigue la convención de [GNU Stow](https://www.gnu.org/software/stow/): los ficheros bajo `<pkg>/...` se enlazan a la misma ruta relativa bajo `~`.

## Skills globales

`agents/.agents/skills/<skill>/SKILL.md` es la fuente de verdad. Tras `make install` queda accesible desde:

- `~/.agents/skills/<skill>/SKILL.md` — vía `make stow agents` (consumido por OpenCode y Codex).
- `~/.claude/skills/<skill>/SKILL.md` — vía `make link-skills` (symlink a la ruta anterior, consumido por Claude Code).

El core pack diario incluye 14 skills de ingeniería:

- `idea-refine`
- `spec-driven-development`
- `planning-and-task-breakdown`
- `context-engineering`
- `source-driven-development`
- `api-and-interface-design`
- `incremental-implementation`
- `test-driven-development`
- `debugging-and-error-recovery`
- `code-review-and-quality`
- `code-simplification`
- `security-and-hardening`
- `git-workflow-and-versioning`
- `documentation-and-adrs`

También se mantienen skills locales adicionales:

- `anti-ai-style`: revisión y redacción con estilo sobrio, sin patrones típicos de IA.
- `castellano-peninsular`: redacción en español peninsular formal.

El índice completo vive en [`agents/.agents/skills/README.md`](agents/.agents/skills/README.md).

OpenCode las consume mediante `/setup` (ver [opencode/.config/opencode/README.md](opencode/.config/opencode/README.md)). Claude Code las descubre automáticamente desde `~/.claude/skills/` (symlink). Codex mantiene [codex/.codex/AGENTS.md](codex/.codex/AGENTS.md) como punto de entrada.

## Paridad OpenCode ↔ Claude Code ↔ Codex

Los paquetes `claude/` y `codex/` replican el flujo de OpenCode dentro de los límites de cada herramienta, para poder cambiar de agente en mitad de un proyecto sin alterar la forma de trabajar:

| Pieza | OpenCode | Claude Code | Codex |
|---|---|---|---|
| Memoria por proyecto | `AGENTS.md` directo | `CLAUDE.md` con `@AGENTS.md` (import) | `~/.codex/AGENTS.md` + `AGENTS.md` del proyecto |
| Skills | `~/.agents/skills/` | `~/.claude/skills/` → `~/.agents/skills/` | `~/.agents/skills/`, referenciadas desde `codex/.codex/AGENTS.md` |
| Agentes | 10 en `~/.config/opencode/agents/` | 10 en `~/.claude/agents/` (mismos nombres y roles) | modos de trabajo en `codex/.codex/AGENTS.md` |
| Comandos custom | `/setup`, `/super-git`, `/checkpoint`, `/check-last` | `/setup`, `/super-git` | equivalentes en lenguaje natural en `codex/.codex/AGENTS.md` |
| MCP | `~/.config/opencode/opencode.json` | `claude/.claude/mcp/servers.reference.json` (aplicar con `claude mcp add`, ver [docs/INSTALL.md](docs/INSTALL.md)) | `[mcp_servers.*]` en `codex/.codex/config.toml` |

Limitaciones conocidas que no se replican:

- Claude Code no expone `temperature` por agente. Cada agente compensa el carácter en su system prompt.
- Claude Code no permite granularidad fina de comandos bash por agente. Los agentes restrictivos (`security`, `maths`, `state`, `write`) declaran su scope verbalmente.
- Los comandos `/checkpoint` y `/check-last` no se portan: el primero choca con la política de no crear `CHECKPOINT.md` en raíz, y el segundo se solapa con `/security-review` y `/review` ya nativos en Claude Code.
- Codex no consume los ficheros `agents/*.md` de OpenCode ni comandos slash personalizados. Usa instrucciones globales, plugins, MCP, sandbox y aprobaciones.

## Convención de artefactos de trabajo

Los agentes siguen una política global para gestionar documentos de planificación:

- No crear `SPEC.md`, `PLAN.md`, `TODO.md`, `NOTES.md`, `CHECKPOINT.md` en la raíz salvo petición explícita.
- Por defecto, trabajar en conversación. Solo crear archivos persistentes si el usuario lo pide, si la tarea es larga o si hay riesgo de perder contexto.
- Artefactos persistentes van en `.ai/tasks/YYYY-MM-DD-slug/{spec.md,plan.md}`.
- Scratch temporal va en `.ai/tmp/`.
- Git ignore: solo `.ai/tmp/` se ignora por defecto. Cada proyecto decide si versiona `.ai/tasks/`.

Esta convención está integrada en las instrucciones globales de OpenCode y Codex. Claude Code no tiene mecanismo de instrucciones globales en este repo, pero puede seguir la misma convención manualmente.

## Comandos del Makefile

```bash
make help        # lista los targets
make install     # backup + stow + link-skills
make backup      # respalda configs actuales en ~/dotfiles-backup/<timestamp>
make stow        # crea los symlinks
make unstow      # elimina los symlinks
make restow      # unstow + stow (tras añadir o quitar ficheros del repo)
make link-skills # crea ~/.claude/skills -> ~/.agents/skills (idempotente)
make health      # comprueba binarios
make clean       # vacía ~/dotfiles-backup
```

## Filosofía

- Reproducible: un `make install` deja una máquina nueva operativa.
- Modular: cada paquete vive aislado y se puede stow/unstow individualmente.
- Mínimo: solo se versiona lo que el usuario edita; nada de caches ni estado generado por las herramientas.
- Multi-proveedor: las skills viven en una ubicación canónica (`agents/.agents/skills/`) y cada agente las consume a su manera.

## Cómo extender

| Para añadir… | Crea | Y… |
|---|---|---|
| Una skill nueva | `agents/.agents/skills/<nombre>/SKILL.md` | `make restow agents` |
| Un agente OpenCode | `opencode/.config/opencode/agents/<nombre>.md` | `make restow opencode` |
| Un comando OpenCode | `opencode/.config/opencode/commands/<nombre>.md` | `make restow opencode` |
| Un agente Claude Code | `claude/.claude/agents/<nombre>.md` | `make restow claude` |
| Un comando Claude Code | `claude/.claude/commands/<nombre>.md` | `make restow claude` |
| Un alias zsh | Edita `shell/.config/shell/aliases.zsh` | `exec zsh` |

## Ver también

- [docs/INSTALL.md](docs/INSTALL.md) — guía de instalación detallada.
- [docs/SECRETS.md](docs/SECRETS.md) — tokens y cómo cargarlos.
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — problemas comunes.
- [opencode/.config/opencode/README.md](opencode/.config/opencode/README.md) — flujo de los agentes y comandos.

# dotmesh

Dotfiles personales para macOS centrados en un workflow de **agentes IA en terminal**:
Warp como terminal, OpenCode + Codex + Claude Code como agentes, VS Code como
editor y Zotero (standalone) para bibliografía.

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
| Terminal | Warp | *(no versionado)* |
| Shell | Zsh + Oh-My-Zsh | [shell/](shell/) |
| Prompt | Starship | [starship/](starship/) |
| Editor | VS Code | [vscode/](vscode/) |
| VCS | Git + delta | [git/](git/) |
| Agente IA #1 | OpenCode | [opencode/](opencode/) |
| Agente IA #2 | Codex (CLI OpenAI) | [codex/](codex/) |
| Agente IA #3 | Claude Code | [claude/](claude/) |
| Skills globales | Convención `.agents/skills/` | [agents/](agents/) |
| Bibliografía | Zotero (standalone) | — |

## Estructura

```
dotmesh/
├── shell/      .zshrc + .config/shell/{env,path,functions,aliases,ai}.zsh
├── git/        .gitconfig, .gitignore_global, .gitmessage
├── starship/   .config/starship.toml
├── vscode/     Library/Application Support/Code/User/{settings,extensions,scripts,themes}
├── opencode/   .config/opencode/{agents,commands,opencode.json,README.md}
├── codex/      .codex/{config.toml,AGENTS.md}
├── claude/     .claude/settings.json
├── agents/     .agents/skills/<skill>/SKILL.md   (skills globales)
├── scripts/    backup-current-config.sh
├── docs/       INSTALL.md, TROUBLESHOOTING.md
├── Makefile
└── README.md
```

Cada paquete sigue la convención de [GNU Stow](https://www.gnu.org/software/stow/):
los ficheros bajo `<pkg>/...` se enlazan a la misma ruta relativa bajo `~`.

## Skills globales

`agents/.agents/skills/<skill>/SKILL.md` queda enlazado en
`~/.agents/skills/<skill>/SKILL.md` tras `make stow`. Las skills incluidas:

- De [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills): `spec-driven-development`, `planning-and-task-breakdown`, `incremental-implementation`, `test-driven-development`, `code-review-and-quality`, `git-workflow-and-versioning`, `anti-ai-style`.
- Propias: `castellano-peninsular` (redacción en español peninsular formal, cargada por los agentes `debate`, `design` y `docs` de OpenCode).

OpenCode las consume vía `/setup` (ver
[opencode/.config/opencode/README.md](opencode/.config/opencode/README.md)).
Claude Code las carga mediante el plugin `agent-skills@addy-agent-skills`
declarado en [claude/.claude/settings.json](claude/.claude/settings.json).
Codex tiene su propio mecanismo en `~/.codex/skills/` y mantiene
[codex/.codex/AGENTS.md](codex/.codex/AGENTS.md) como punto de entrada.

## Comandos del Makefile

```bash
make help        # lista los targets
make install     # backup + stow
make backup      # respalda configs actuales en ~/dotfiles-backup/<timestamp>
make stow        # crea los symlinks
make unstow      # elimina los symlinks
make restow      # unstow + stow (tras añadir o quitar ficheros del repo)
make health      # comprueba binarios
make clean       # vacía ~/dotfiles-backup
```

## Filosofía

- **Reproducible**: un `make install` deja una máquina nueva operativa.
- **Modular**: cada paquete vive aislado y se puede stow/unstow individualmente.
- **Mínimo**: solo se versiona lo que el usuario edita; nada de caches ni estado
  generado por las herramientas.
- **Multi-proveedor**: las skills viven en una ubicación canónica
  (`agents/.agents/skills/`) y cada agente las consume a su manera.

## Cómo extender

| Para añadir… | Crea | Y… |
|---|---|---|
| Una skill nueva | `agents/.agents/skills/<nombre>/SKILL.md` | `make restow agents` |
| Un agente OpenCode | `opencode/.config/opencode/agents/<nombre>.md` | `make restow opencode` |
| Un comando OpenCode | `opencode/.config/opencode/commands/<nombre>.md` | `make restow opencode` |
| Un alias zsh | Edita `shell/.config/shell/aliases.zsh` | `exec zsh` |

## MCPs (solo OpenCode)

Configurados en [opencode/.config/opencode/opencode.json](opencode/.config/opencode/opencode.json):

| MCP | Para qué | Token |
|---|---|---|
| `notion` | Páginas/databases de Notion | `NOTION_TOKEN` |
| `github` | Issues, PRs, código en GitHub | `GITHUB_TOKEN` |
| `tavily` | Búsqueda web para `debate` y `write` | `TAVILY_API_KEY` |
| `openalex` | ~250M papers científicos | — |
| `zotero` | Biblioteca local | — (Zotero standalone abierto) |

Tokens en `~/.zsh.secrets` (no commiteado). Ver [docs/SECRETS.md](docs/SECRETS.md).

Para los otros proveedores (Codex, Claude Code) los MCPs se configuran desde su UI, no desde este repo.

## Ver también

- [docs/INSTALL.md](docs/INSTALL.md) — guía de instalación detallada.
- [docs/SECRETS.md](docs/SECRETS.md) — tokens y cómo cargarlos.
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — problemas comunes.
- [opencode/.config/opencode/README.md](opencode/.config/opencode/README.md) — flujo de los agentes y comandos.

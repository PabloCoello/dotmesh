# Instalación

## Requisitos

- macOS (Apple Silicon o Intel).
- Homebrew, Git y GNU Stow.
- Las herramientas que vayas a usar instaladas: Warp, VS Code, OpenCode, Codex, Claude Code.

```bash
brew install stow git-delta starship
brew install --cask warp visual-studio-code
```

OpenCode, Codex y Claude Code se instalan según las instrucciones de cada
proveedor (no van por Homebrew). Después del primer arranque de cada uno se
crean sus directorios de config (`~/.config/opencode/`, `~/.codex/`,
`~/.claude/`); a partir de ahí dotmesh los reemplaza con symlinks.

## Instalación inicial

```bash
git clone https://github.com/pablocoello/dotmesh.git ~/Documents/GitHub/dotmesh
cd ~/Documents/GitHub/dotmesh

make health         # comprueba que los binarios estén
make install        # backup en ~/dotfiles-backup + stow
exec zsh
```

`make install` ejecuta:

1. `scripts/backup-current-config.sh` → copia tus configs actuales a
   `~/dotfiles-backup/<timestamp>/`.
2. `stow -t ~ <paquete>` para cada paquete del repo.
3. `make link-skills` → crea `~/.claude/skills` como symlink a
   `~/.agents/skills` para que Claude Code consuma la misma fuente de
   skills que OpenCode y Codex.

## Qué se instala

| Paquete | Destino |
|---|---|
| `shell` | `~/.zshrc` y `~/.config/shell/*.zsh` |
| `git` | `~/.gitconfig`, `~/.gitignore_global`, `~/.gitmessage` |
| `starship` | `~/.config/starship.toml` |
| `vscode` | `~/Library/Application Support/Code/User/...` |
| `opencode` | `~/.config/opencode/{agents,commands,README.md}` |
| `codex` | `~/.codex/{config.toml, AGENTS.md}` |
| `claude` | `~/.claude/{settings.json,agents/,commands/,mcp/}` |
| `agents` | `~/.agents/skills/<skill>/` |

## Tras la instalación

```bash
exec zsh                                    # recarga la shell
starship --version                          # debe imprimir versión
git diff                                    # debe usar delta
opencode agent list                         # debe listar los 10 agentes
codex mcp list                              # debe listar notion/github/tavily/openalex/zotero
ls -la ~/.claude/skills                     # debe ser symlink a ~/.agents/skills
ls ~/.claude/agents/                        # debe listar los 10 agentes Claude Code
```

Si OpenCode no carga las skills al instante, ejecuta `/setup` dentro de una
sesión OpenCode en cualquier proyecto (ver
[opencode/.config/opencode/README.md](../opencode/.config/opencode/README.md)).
En Claude Code el equivalente es `/setup` (custom) o el `/init` nativo.

## MCP en Codex

Codex lee los servidores MCP directamente desde
[`codex/.codex/config.toml`](../codex/.codex/config.toml), bajo las tablas
`[mcp_servers.*]`. Tras `make stow`, la CLI debe mostrar los cinco servidores:

```bash
codex mcp list
```

Los tokens se heredan desde el entorno mediante `env_vars`. Para GitHub, Codex
no renombra variables al heredarlas; por eso `~/.zsh.secrets` debe exportar
`GITHUB_PERSONAL_ACCESS_TOKEN` derivada de `DOTMESH_GITHUB_PAT`. Ver
[SECRETS.md](SECRETS.md).

## MCP en Claude Code

Los 5 servidores MCP que usa OpenCode (notion, github, tavily, openalex,
zotero) están definidos como referencia en
[`claude/.claude/mcp/servers.reference.json`](../claude/.claude/mcp/servers.reference.json).
Stow no los aplica a `~/.claude.json` automáticamente porque ese fichero
lo gestiona el propio Claude Code y contiene estado de sesión. Para
aplicarlos manualmente, usa la CLI de Claude:

```bash
# Por servidor:
claude mcp add notion   npx -- -y @notionhq/notion-mcp-server
claude mcp add github   npx -- -y @modelcontextprotocol/server-github
claude mcp add tavily   npx -- -y tavily-mcp
claude mcp add openalex npx -- -y openalex-research-mcp
claude mcp add zotero   uvx -- zotero-mcp --env ZOTERO_LOCAL=true
```

Los tokens (`NOTION_TOKEN`, `DOTMESH_GITHUB_PAT`, `TAVILY_API_KEY`, etc.)
deben estar exportados en el entorno antes de lanzar `claude` — ver
[SECRETS.md](SECRETS.md). Verifica con `claude mcp list`.

> `DOTMESH_GITHUB_PAT` se llama así a propósito: `gh` consume
> `GH_TOKEN`/`GITHUB_TOKEN` por delante de su keyring, así que usar uno de
> esos nombres romperá `gh pr create` en cualquier agente que herede tu
> entorno. El bloque `env` del MCP en
> [`claude/.claude/mcp/servers.reference.json`](../claude/.claude/mcp/servers.reference.json)
> mapea explícitamente `DOTMESH_GITHUB_PAT` → `GITHUB_PERSONAL_ACCESS_TOKEN`
> para el `@modelcontextprotocol/server-github`.

## Personalización

| Cambio | Dónde |
|---|---|
| Aliases zsh | `shell/.config/shell/aliases.zsh` |
| Funciones zsh | `shell/.config/shell/functions.zsh` |
| PATH | `shell/.config/shell/path.zsh` |
| Variables de entorno | `shell/.config/shell/env.zsh` |
| Endpoints IA / Ollama | `shell/.config/shell/ai.zsh` |
| Prompt | `starship/.config/starship.toml` |
| Skill nueva | `agents/.agents/skills/<nombre>/SKILL.md` + `make restow agents` |

## Desinstalación

```bash
cd ~/Documents/GitHub/dotmesh
make unstow                                 # elimina los symlinks
ls -1 ~/dotfiles-backup/                    # localiza el backup deseado
cp -R ~/dotfiles-backup/<timestamp>/. ~/    # restaura si lo necesitas
```

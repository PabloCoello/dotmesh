# Instalación

## Requisitos

Las herramientas que vayas a usar instaladas: Warp, VS Code, OpenCode, Codex, Claude Code.

**macOS (Apple Silicon o Intel)**

Homebrew es el gestor de dependencias:

```bash
brew install stow git-delta starship
brew install --cask warp visual-studio-code
```

**Linux (Ubuntu/Debian)**

```bash
sudo apt install stow git git-delta
```

Starship no está en los repositorios de apt; instálalo con su script oficial:

```bash
curl -sS https://starship.rs/install.sh | sh
```

Warp y VS Code se instalan desde sus sitios oficiales o vía sus paquetes `.deb`.

---

OpenCode, Codex y Claude Code se instalan según las instrucciones de cada
proveedor. Después del primer arranque de cada uno se crean sus directorios de
config (`~/.config/opencode/`, `~/.codex/`, `~/.claude/`); a partir de ahí
dotmesh los reemplaza con symlinks.

## Instalación inicial

```bash
# Ajusta la ruta según tu sistema (~/Documents en macOS, ~/Documentos en Linux con locale es_ES)
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
3. `make review-install` → compila e instala la extensión `mesh-review` en VS Code
   (requiere `node` ≥22.6 y el CLI `code` en el PATH; falla con aviso si no están disponibles).
4. `make link-skills` → crea `~/.claude/skills` como symlink a
   `~/.agents/skills` para que Claude Code consuma la misma fuente de
   skills que OpenCode y Codex.
5. `make link-warp` → enlaza los temas de Warp en `~/.local/share/warp-terminal/themes/`
   (solo Linux; en macOS lo hace Stow directamente en `~/.warp/themes/`).

**Solo en Linux**, tras el install inicial:

```bash
make gnome-rice     # retint del escritorio GNOME (opcional; solo si usas GNOME)
make vscode-install # configura VS Code en ~/.config/Code/User/ (Linux no usa Stow para esto)
```

## Qué se instala

| Paquete | Destino |
|---|---|
| `shell` | `~/.zshrc` y `~/.config/shell/*.zsh` |
| `git` | `~/.gitconfig`, `~/.gitignore_global`, `~/.gitmessage` |
| `starship` | `~/.config/starship.toml` |
| `warp` | `~/.warp/themes/` (macOS, vía Stow) · `~/.local/share/warp-terminal/themes/` (Linux, vía `make link-warp`) |
| `vscode` | `~/Library/Application Support/Code/User/` (macOS, vía Stow) · `~/.config/Code/User/` (Linux, vía `make vscode-install`) |
| `opencode` | `~/.config/opencode/{agents/,commands/,opencode.json,README.md}` |
| `codex` | `~/.codex/{config.toml,AGENTS.md}` |
| `claude` | `~/.claude/{settings.json,agents/,commands/,hooks/,mcp/,output-styles/,statusline.sh}` |
| `agents` | `~/.agents/skills/<skill>/` |

## Tras la instalación

```bash
exec zsh                                    # recarga la shell
starship --version                          # debe imprimir versión
git diff                                    # debe usar delta
opencode agent list                         # debe listar maker, scribe + 6 subagentes
codex mcp list                              # debe listar notion/github/tavily/openalex/zotero
ls -la ~/.claude/skills                     # debe ser symlink a ~/.agents/skills
ls ~/.claude/agents/                        # debe listar 6 subagentes de Claude Code
```

Si OpenCode no carga las skills al instante, ejecuta `/setup` dentro de una
sesión OpenCode en cualquier proyecto (ver
[opencode/.config/opencode/README.md](../opencode/.config/opencode/README.md)).
En Claude Code el equivalente es `/setup` (custom) o el `/init` nativo.

## Extensión mesh-review

`mesh-review` es una extensión de VS Code que permite dejar comentarios de revisión
anclados a fragmentos de texto en documentos Markdown. Los comentarios se guardan en
un sidecar JSON fuera del fichero fuente y nunca entran en el control de versiones.

### Prerrequisitos

- **Node.js ≥22.6** — comprueba con `node --version`.
- **VS Code con el CLI `code`** en el PATH — en macOS, instálalo desde la paleta de
  comandos con «Shell Command: Install 'code' command in PATH».

### Instalación

`make review-install` ya está incluido en `make install`, así que en una instalación
inicial no hace falta ejecutarlo por separado. Para reinstalar la extensión sin
repetir todo el proceso:

```bash
make review-install
```

Si `code` o `node` no están disponibles, el target falla con un aviso informativo y
no bloquea el resto de `make install`. Instala las herramientas necesarias y vuelve a
ejecutar `make review-install`.

### Verificación

```bash
make health | grep mesh-review
# ok  mesh-review   ← extensión instalada
# --  mesh-review   ← no instalada (ejecuta 'make review-install')
```

### Flujo de trabajo

1. Selecciona texto en un `.md` abierto en VS Code.
2. Ejecuta `Mesh Review: Add Comment` desde la paleta de comandos.
3. Elige el tipo (`edita`, `sugerencia`, `pregunta`, `verifica`, `nota`), opcionalmente
   un agente de enrutado (pista para ejecución orquestada; `(ninguno)` si no aplica),
   e introduce el texto del comentario.
4. La extensión crea un sidecar JSON en `.ai/review/<ruta-relativa>.json` (relativo
   al git root) y muestra la decoración en el editor.
5. Cuando quieras que un agente resuelva los comentarios, carga la skill `doc-review`
   y pide al agente que actúe sobre el documento: localizará el sidecar, resolverá
   cada comentario abierto y marcará `status: "resolved"` al terminar.

---

## MCP en Codex

Codex lee los servidores MCP directamente desde
[`codex/.codex/config.toml`](../codex/.codex/config.toml), bajo las tablas
`[mcp_servers.*]`. Tras `make stow`, la CLI debe mostrar los cinco servidores:

```bash
codex mcp list
```

La columna `Auth` puede aparecer como `Unsupported` para estos servidores. Es
normal: son MCP locales por `stdio` que reciben credenciales desde variables de
entorno. Ese estado solo indica que no admiten el flujo OAuth gestionado por
`codex mcp login`. Puedes comprobar la inyección de variables con:

```bash
codex mcp get github
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
claude mcp add github   docker -- run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server
claude mcp add tavily   npx -- -y tavily-mcp
claude mcp add openalex npx -- -y openalex-research-mcp
claude mcp add zotero   -e ZOTERO_LOCAL=true -- uvx zotero-mcp
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
> para el proceso `docker`, que lo pasa al contenedor con `-e`.

## Personalización

| Cambio | Dónde |
|---|---|
| Aliases zsh | `shell/.config/shell/aliases.zsh` |
| Funciones zsh | `shell/.config/shell/functions.zsh` |
| PATH | `shell/.config/shell/path.zsh` |
| Variables de entorno | `shell/.config/shell/env.zsh` |
| Endpoints IA / Ollama | `shell/.config/shell/ai.zsh` |
| Prompt | `starship/.config/starship.toml` |
| Skill nueva | `agents/.agents/skills/<nombre>/SKILL.md` + `make restow` |

## Nota sobre `.gitignore_global` y ficheros de base de datos

`~/.gitignore_global` no ignora `*.sql`, `*.sqlite3` ni `*.db` para no ocultar
migraciones y fixtures versionadas. Si un proyecto de desarrollo tiene una base
de datos local con datos sensibles, añade esos patrones en el `.gitignore` del
propio proyecto:

```
*.sqlite3
*.db
*.sql  # solo si las migraciones no se versionan
```

## Desinstalación

```bash
cd ~/Documents/GitHub/dotmesh
make unstow                                 # elimina los symlinks
ls -1 ~/dotfiles-backup/                    # localiza el backup deseado
cp -R ~/dotfiles-backup/<timestamp>/. ~/    # restaura si lo necesitas
```

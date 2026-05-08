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

## Qué se instala

| Paquete | Destino |
|---|---|
| `shell` | `~/.zshrc` y `~/.config/shell/*.zsh` |
| `git` | `~/.gitconfig`, `~/.gitignore_global`, `~/.gitmessage` |
| `starship` | `~/.config/starship.toml` |
| `vscode` | `~/Library/Application Support/Code/User/...` |
| `opencode` | `~/.config/opencode/{agents,commands,README.md}` |
| `codex` | `~/.codex/{config.toml, AGENTS.md}` |
| `claude` | `~/.claude/settings.json` |
| `agents` | `~/.agents/skills/<skill>/` |

## Tras la instalación

```bash
exec zsh                                    # recarga la shell
starship --version                          # debe imprimir versión
git diff                                    # debe usar delta
opencode agent list                         # debe listar los 8 agentes
```

Si OpenCode no carga las skills al instante, ejecuta `/setup` dentro de una
sesión OpenCode en cualquier proyecto (ver
[opencode/.config/opencode/README.md](../opencode/.config/opencode/README.md)).

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

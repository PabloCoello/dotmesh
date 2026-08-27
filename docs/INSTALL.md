# Instalación

## Requisitos

Las herramientas que vayas a usar instaladas: Ghostty, VS Code, OpenCode, Codex, Claude Code. herdr es opcional (multiplexor de agentes que corre dentro de Ghostty).

**macOS (Apple Silicon o Intel)**

Homebrew es el gestor de dependencias:

```bash
brew install stow git-delta starship herdr
brew install --cask ghostty visual-studio-code font-jetbrains-mono-nerd-font rectangle
```

Rectangle es el gestor de ventanas. No es opcional si usas el Voyager: el layout
resuelve Pant← y Pant→ como Ctrl+Opt+Cmd+←/→, los atajos de Rectangle para mover
la ventana de monitor, y macOS no trae equivalente nativo. Ver
[Rectangle](#rectangle-macos) más abajo.

**Linux (Ubuntu/Debian)**

```bash
sudo apt install stow git git-delta
```

Starship no está en los repositorios de apt; instálalo con su script oficial:

```bash
curl -sS https://starship.rs/install.sh | sh
```

VS Code se instala desde su sitio oficial o vía su paquete `.deb`.

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
| `ghostty` | `~/.config/ghostty/{config,themes/dotmesh}` |
| `herdr` | `~/.config/herdr/config.toml` |
| `vscode` | `~/Library/Application Support/Code/User/` (macOS, vía Stow) · `~/.config/Code/User/` (Linux, vía `make vscode-install`) |
| `opencode` | `~/.config/opencode/{agents/,commands/,opencode.json,README.md,plugins/herdr-agent-state.js}` |
| `codex` | `~/.codex/{config.toml,AGENTS.md,hooks.json,herdr-agent-state.sh}` |
| `claude` | `~/.claude/{settings.json,agents/,commands/,hooks/,mcp/,output-styles/,statusline.sh}` |
| `agents` | `~/.agents/skills/<skill>/` |

## Tras la instalación

```bash
exec zsh                                    # recarga la shell
starship --version                          # debe imprimir versión
git diff                                    # debe usar delta
make opencode-doctor                        # valida OpenCode sin arrancar servicios
opencode agent list                         # debe listar 2 primary + 7 subagentes
codex mcp list                              # debe listar notion/github/tavily/openalex/zotero
ls -la ~/.claude/skills                     # debe ser symlink a ~/.agents/skills
ls ~/.claude/agents/                        # debe listar 7 subagentes de Claude Code
```

Si OpenCode no carga las skills al instante, ejecuta `/setup` dentro de una
sesión OpenCode en cualquier proyecto (ver
[opencode/.config/opencode/README.md](../opencode/.config/opencode/README.md)).
En Claude Code el equivalente es `/setup` (custom) o el `/init` nativo.

## Rectangle (macOS)

`make install` ejecuta `make macos-rectangle`, que fija las preferencias de
Rectangle que el layout del Voyager da por supuestas. Es idempotente y no-op en
Linux y WSL.

Orden importante: Rectangle escribe sus propias preferencias la primera vez que
arranca, cuando pregunta qué juego de atajos quieres. Así que en una máquina
nueva:

```bash
brew install --cask rectangle
open -a Rectangle          # concédele Accesibilidad y responde lo que sea
make macos-rectangle       # fija la config buena por encima
```

El permiso de Accesibilidad (Ajustes del Sistema → Privacidad y seguridad →
Accesibilidad) no se puede scriptear: macOS lo protege con TCC.

Lo que fija el script:

| Clave | Valor | Por qué |
|---|---|---|
| `alternateDefaultShortcuts` | `false` | Juego de atajos heredado de Spectacle |
| `subsequentExecutionMode` | `1` | Repetir el atajo mueve la ventana al monitor siguiente |
| `allowAnyShortcut` | `true` | Permite combinaciones que macOS considera reservadas |
| `hideMenubarIcon` | `true` | El layout se opera a ciegas desde el teclado |
| `launchOnLogin` | `true` | Un gestor parado deja Pant←/Pant→ muertas |
| `SUEnableAutomaticChecks` | `false` | Las actualizaciones van por Homebrew |

`alternateDefaultShortcuts` es el que de verdad importa, y su nombre engaña:

- `false` → juego Spectacle: mitades en **Cmd+Opt+flechas**.
- `true` → juego «recomendado» de Rectangle: mitades, cuartos y tercios en
  **Ctrl+Opt+letra**.

Ctrl+Opt+letra es justo la familia que usan los chords directos de herdr
(`ctrl+alt+h/j/k/l/c/d/g/n/p/q/w/x/z`). Con `true`, Rectangle registra atajos
globales y se come seis de ellos —J, K, C, D, G— antes de que herdr los vea. Por
eso se deja en `false`, y por eso `make health` avisa si alguien lo cambia.

Los dos atajos que el Voyager sí usa, `previousDisplay` y `nextDisplay`
(Ctrl+Opt+Cmd+←/→), son idénticos en los dos juegos.

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

## herdr y las integraciones de agente

herdr corre dentro de Ghostty y detecta el estado de los agentes (trabajando,
bloqueado, inactivo) mediante hooks que dotmesh versiona en los paquetes de cada
agente:

- claude: `~/.claude/hooks/herdr-agent-state.sh` + un hook `SessionStart` en
  `settings.json`.
- codex: `~/.codex/{herdr-agent-state.sh,hooks.json}` + `hooks = true` en
  `config.toml`.
- opencode: `~/.config/opencode/plugins/herdr-agent-state.js`.

`make stow` los enlaza en una máquina nueva; no hace falta correr `herdr
integration install` (que reescribiría esos ficheros de forma destructiva).
Arranca el servidor con `brew services start herdr` y ábrelo con `herdr`.
Comprueba el estado con `herdr integration status`; tras actualizar herdr,
re-vendoriza cualquier hook que salga desfasado (ver
[docs/DESIGN.md](DESIGN.md), «Limitaciones conocidas»).

Para comprobar componentes vendorizados sin modificar la instalación local:

```bash
make vendor-check
```

El target consulta solo metadatos upstream con `git ls-remote` y compara los refs
anotados en [`scripts/vendor/upstreams.tsv`](../scripts/vendor/upstreams.tsv).
No ejecuta código remoto, no clona repositorios y no actualiza ficheros. Si no
hay red, informa `network_unavailable` y termina con código 0. Si un componente
aparece como `manual/unknown`, no hay una referencia local fiable para compararlo
y la revisión debe hacerse a mano. Las URLs se limitan a repos HTTPS de GitHub
inventariados en el script; los valores que empiezan por `-` y los refs fuera de
`HEAD` o `refs/heads/*` se bloquean antes de llamar a Git. El script exige hashes
locales completos, desactiva credential helpers y aísla el entorno y la
configuración de Git para evitar reglas `url.*.insteadOf` locales. También
ejecuta `git -C /` para no leer `.git/config` del repo actual.

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

## Windows + WSL2

### Requisitos previos (lado Windows)

- WSL2 habilitado (`wsl --install` en PowerShell como administrador).
- Ubuntu instalado (`wsl --install -d Ubuntu`).
- JetBrains Mono Nerd Font instalada en Windows (no en la distro): <https://www.nerdfonts.com/font-downloads>.
- Windows Terminal (opcional, recomendado).

### Bootstrap en la distro Ubuntu

Las dependencias del lado Linux son las mismas que en el bloque «Requisitos» de esta guía (Ubuntu/Debian). Añade `zsh` si no viene en tu imagen de Ubuntu. VS Code no se instala en la distro; `make install` configura el VS Code de Windows de forma automática.

```bash
sudo apt install zsh stow git git-delta
curl -sS https://starship.rs/install.sh | sh
```

Con las dependencias listas, clona el repo y ejecuta la instalación:

```bash
git clone https://github.com/pablocoello/dotmesh.git ~/Documentos/GitHub/dotmesh
cd ~/Documentos/GitHub/dotmesh

make health
make install
```

### Pasos manuales del lado Windows

#### VS Code

`make install` ya incluye `make vscode-install`. En WSL copia `settings.json` y `keybindings.json` a `%APPDATA%\Code\User\`. Si la detección automática del usuario Windows falla, exporta `WINUSER=<tu_usuario_windows>` antes de ejecutarlo.

#### Windows Terminal

```bash
make wsl-terminal
```

Alternativa directa: `bash windows-terminal/scripts/install.sh`. Añade el esquema `dotmesh` al `settings.json` de Windows Terminal; actívalo en Configuración > Perfiles > Apariencia > Esquema de colores.

#### Fuente

Instala JetBrains Mono Nerd Font en Windows (no en la distro WSL): <https://www.nerdfonts.com/font-downloads>. Configúrala en Windows Terminal: Configuración > Perfiles > Apariencia > Fuente.

#### Git Credential Manager (opcional)

Si tienes Git for Windows instalado en el lado Windows:

```bash
git config --global credential.helper \
  "$(wslpath -u 'C:/Program Files/Git/mingw64/bin/git-credential-manager.exe')"
```

Permite usar el keychain de Windows para los tokens de GitHub desde WSL.

### Lo que no funciona en WSL

- `ghostty`: no hay binario para WSL. Los symlinks de `make stow` son inofensivos.
- `herdr`: no hay binario para WSL. El flujo de agentes funciona sin él.
- `make gnome-rice`: sin efecto (no hay GNOME en WSL).

---

## Desinstalación

```bash
cd ~/Documents/GitHub/dotmesh
make unstow                                 # elimina los symlinks
ls -1 ~/dotfiles-backup/                    # localiza el backup deseado
cp -R ~/dotfiles-backup/<timestamp>/. ~/    # restaura si lo necesitas
```

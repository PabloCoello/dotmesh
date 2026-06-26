# dotmesh

Dotfiles personales para macOS. Gestiona la configuración del terminal (Warp), shell, Git, Starship, VS Code, OpenCode, Codex, Claude y skills globales de agentes.

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
| Terminal | Warp | [warp/](warp/) |
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
├── warp/       .warp/themes/{carbon,dotmesh}.yaml   (temas del terminal)
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

## Tema dotmesh

Un lenguaje visual único —**Paper · Ink · Syntax**— atraviesa todas las
herramientas: cromo monocromo (blanco Paper / negro Ink / rampa Graphite) con
siete acentos de sintaxis muteados usados solo como señal, y JetBrains Mono como
voz de código. Se aplica como:

- **VS Code** — tema `dotmesh` ([`vscode/themes/dotmesh-color-theme.json`](vscode/themes/dotmesh-color-theme.json)), activo en `settings.json`.
- **Warp** — tema [`warp/.warp/themes/dotmesh.yaml`](warp/.warp/themes/dotmesh.yaml) (seleccionable en los ajustes de Warp). En macOS lo enlaza `make stow` en `~/.warp/themes/`; en Linux, `make link-warp` lo enlaza en `~/.local/share/warp-terminal/themes/`, que es donde Warp/Linux busca los temas de usuario.
- **Starship** — paleta `dotmesh` en [`starship/.config/starship.toml`](starship/.config/starship.toml): segmentos grafito con iconos de sintaxis.
- **delta/Git** — colores de diff y estado alineados con la paleta.

Los temas anteriores (`carbon`, `gruvbox_dark`) se conservan para revertir. La
referencia completa —paleta, tipografía y mapa de sintaxis— está en
[docs/DESIGN.md](docs/DESIGN.md).

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

`/super-git` es el flujo autónomo de publicación: sincroniza con remoto, crea o
reutiliza una rama con nombre semántico, trabaja por slices semánticos, genera
cada commit atómico justo después de verificarlo, hace push y abre la PR con
descripción. La separación a posteriori de un diff grande queda como modo de
recuperación: si los límites no están claros, debe parar y pedir confirmación.
Para operaciones destructivas, force-push, ramas divergentes, secretos o hunks
ambiguos, también debe parar y pedir confirmación.

## Convención de artefactos de trabajo

Los agentes siguen una política global para gestionar documentos de planificación:

- No crear `SPEC.md`, `PLAN.md`, `TODO.md`, `NOTES.md`, `CHECKPOINT.md` en la raíz salvo petición explícita.
- Por defecto, trabajar en conversación. Solo crear archivos persistentes si el usuario lo pide, si la tarea es larga o si hay riesgo de perder contexto.
- Artefactos persistentes van en `.ai/tasks/YYYY-MM-DD-slug/{spec.md,plan.md}`.
- Scratch temporal va en `.ai/tmp/`.
- Git ignore: solo `.ai/tmp/` se ignora por defecto. Cada proyecto decide si versiona `.ai/tasks/`.

Esta convención está integrada en las instrucciones globales de OpenCode y Codex. Claude Code no tiene mecanismo de instrucciones globales en este repo, pero puede seguir la misma convención manualmente.

## Aislamiento de sesiones de Claude

`shell/.config/shell/claude-session.zsh` define una función `claude()` que envuelve el binario. Por defecto es transparente: `claude` se ejecuta tal cual. El aislamiento por worktree se activa explícitamente con el flag `--isolate`, para que dos sesiones concurrentes sobre el mismo repo no se pisen ficheros ni ramas cuando lo necesites. El módulo es compatible con bash y zsh; si no usas el paquete `shell/` entero (porque por ejemplo trabajas en bash), basta con sourcearlo: `source ~/Documentos/GitHub/dotmesh/shell/.config/shell/claude-session.zsh` en tu `~/.bashrc` o `~/.zshrc`.

Flujo cuando ejecutas `claude --isolate` dentro de un repo git:

1. Consume el flag `--isolate` (no se reenvía al binario).
2. Crea worktree hermano en `<repo>-session-<timestamp>-<rand4>/`.
3. Crea rama local `session/<id>` desde el `HEAD` actual. **Nunca se hace push automático.**
4. `git fetch --quiet origin` dentro del worktree.
5. Si existe `.claude-session-init.sh` ejecutable en la raíz del worktree —o, como fallback, en la raíz del repo origen— se ejecuta (ver más abajo). El fallback es necesario porque `git worktree add` solo copia ficheros trackeados: si el hook está en `.gitignore` o `.git/info/exclude`, no aparece en el worktree y el wrapper lo busca en el repo origen.
6. Lanza `claude` con el cwd en el worktree.
7. Al salir: si la rama está limpia (sin commits ni cambios sin commitear) borra worktree y rama. Si hay trabajo, lo conserva y te indica la ruta y el id para limpiar después.

Sin `--isolate`, o fuera de un repo git, el wrapper es transparente y ejecuta el binario directamente. Si pasas `--isolate` fuera de un repo git, el wrapper avisa y ejecuta sin aislamiento.

Helpers asociados:

- `claude-sessions` — lista los worktrees de sesión vivos del repo actual.
- `claude-session-cleanup <id>` — borra worktree y rama de una sesión concreta cuando ya no la necesitas.

Convención de promoción de rama: `session/<id>` es local y efímera. Si el trabajo de la sesión va a publicarse, **renómbrala a `<prefix>/<task>`** (siguiendo la convención de `/super-git`) antes de pushear, para que no aparezca como ruido en los listados de ramas remotas.

### Hook por repo: `.claude-session-init.sh`

Permite añadir lógica específica del repo que debe correr al abrir cada sesión aislada, sin tocar el wrapper global.

- Ubicación: raíz del repo (el del worktree, no el de dotmesh). El wrapper prueba primero el worktree y, si ahí no lo encuentra, mira en el repo origen.
- Debe ser ejecutable (`chmod +x`). Si no, se ignora silenciosamente.
- Se ejecuta en un subshell con cwd en el worktree, antes de lanzar `claude` (incluso cuando el script vive en el repo origen).
- Variables exportadas **no** llegan a la sesión de `claude` (procesos independientes). Para variables de entorno usa `~/.zshrc` o `direnv`.
- Si devuelve error (exit ≠ 0), el wrapper avisa y continúa; no bloquea el arranque de la sesión.
- Es síncrono: lo que tarde retrasa el arranque de `claude`. Para tareas lentas, lánzalas en background dentro del script.
- Se ejecuta en **cada** sesión: si reserva recursos (puertos, IDs, servicios) debe ser seguro frente a ejecuciones concurrentes.

Casos de uso típicos: sincronizar ramas remotas antes de allocar IDs, levantar servicios de docker-compose con nombre scoped por sesión, forzar recarga de `direnv`, imprimir avisos sobre convenciones del repo.

### Versionado del hook

El script vive en el root del repo como fichero normal. Tres formas de gestionarlo:

| Opción | Cuándo | Cómo |
|---|---|---|
| `.git/info/exclude` (recomendado) | Solo tú usas el wrapper; el resto del equipo no debe ver el fichero | `echo .claude-session-init.sh >> .git/info/exclude` |
| Commitear al repo | El equipo entero adopta el wrapper como convención compartida | `git add` normal |
| Symlink desde dotmesh | Quieres versionar el script en un sitio central y sobrevivir re-clones | Guardar el script en `dotmesh/` y crear `ln -s` desde el repo destino |

`.git/info/exclude` es un `.gitignore` privado de tu clone: no se versiona, no se sincroniza, solo lo lee tu git local. El fichero existe en disco del repo origen, el wrapper lo encuentra (vía fallback al repo origen, porque el worktree nuevo no recibe ficheros untracked) y lo ejecuta, pero `git status` lo ignora y `git add .` no lo incluye. Caveat: si re-clonas el repo, pierdes tanto el script como la regla de exclude — en ese caso, prefiere la opción de symlink.

## Comandos del Makefile

```bash
make help        # lista los targets
make install     # backup + stow + link-skills + link-warp
make backup      # respalda configs actuales en ~/dotfiles-backup/<timestamp>
make stow        # crea los symlinks
make unstow      # elimina los symlinks
make restow      # unstow + stow (tras añadir o quitar ficheros del repo)
make link-skills # crea ~/.claude/skills -> ~/.agents/skills (idempotente)
make link-warp   # enlaza los temas de Warp en la ruta XDG (solo Linux; macOS usa Stow)
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

- [docs/DESIGN.md](docs/DESIGN.md) — lenguaje visual dotmesh (paleta, tipografía, mapa de sintaxis).
- [docs/INSTALL.md](docs/INSTALL.md) — guía de instalación detallada.
- [docs/SECRETS.md](docs/SECRETS.md) — tokens y cómo cargarlos.
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — problemas comunes.
- [opencode/.config/opencode/README.md](opencode/.config/opencode/README.md) — flujo de los agentes y comandos.

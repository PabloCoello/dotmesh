# terax

Paquete Stow para [Terax](https://terax.app) (terminal de Crynta), en evaluación
como alternativa a Warp.

## Qué enlaza

Todos bajo `~/Library/Application Support/app.crynta.terax/`:

| Fichero | Contenido |
|---|---|
| `terax-settings.json` | Ajustes + `customInstructions` (acuerdo de trabajo global de la IA) |
| `terax-ai-agents.json` | Agentes personalizados (Build, Debate, Docs, Editor, Maths, State, Write) |
| `terax-ai-snippets.json` | Snippets `#super-git`, `#checkpoint`, `#check-last` |

## Qué NO se versiona

- `terax-ai-sessions.json`, `terax-ai-todos.json`, `terax-custom-themes.json`,
  `.window-state.json` — estado volátil (chats, ventanas). Se dejan como
  ficheros locales sin enlazar.

## Paridad con el stack del repo

Terax **no soporta MCP**, así que los servidores de OpenCode (notion, github,
tavily, openalex, zotero) no se pueden portar; `github` se cubre en parte con la
CLI `gh` en el terminal. Sí se trae lo demás:

- **Instrucciones globales** (`customInstructions`): idioma peninsular,
  `anti-ai-style`, Conventional Commits y la regla de no-atribución de IA.
- **Agentes**: los que no tienen equivalente built-in en Terax. Sus built-in
  (Coder, Architect, Code Reviewer, Security, Designer) ya cubren
  `build`/`plan`/`review`/`security`/`design` de OpenCode.
- **Snippets**: equivalentes a los comandos `/super-git`, `/checkpoint`,
  `/check-last`, invocables con `#handle` en el compositor.

## Dependencia: Nerd Font

Terax es una app Tauri → en macOS usa WKWebView. Si el campo de fuente está
vacío, autodetecta una Nerd Font; la **primera candidata es JetBrainsMono Nerd
Font**. Sin una Nerd Font instalada, los glyphs de Starship salen como
cuadraditos (□).

Instálala con `make fonts` (o `brew bundle`). El healthcheck (`make health`) lo
verifica. La config fija `terminalFontFamily` a `JetBrainsMono Nerd Font Mono`
explícitamente para no depender del orden de autodetección.

`terminalWebglEnabled` está en `false`: el render WebGL de xterm corrompe el
atlas de glyphs con Nerd Fonts en algunos macOS (el propio Terax lo avisa).

## Activar

Terax crea su `terax-settings.json` al primer arranque. Como Stow no sobrescribe
ficheros reales:

```bash
make backup
rm "$HOME/Library/Application Support/app.crynta.terax/terax-settings.json"
make stow                      # crea el symlink hacia este paquete
```

Importante: aplica la config con **Terax cerrado**; si está abierto, la
reescribe al cerrarse y machaca los cambios.

## Ruido en git

Terax reescribe el fichero en cada uso (reordena claves, `recentModelIds`,
`defaultModelId`…). Para no ver ese ruido:

```bash
make terax-freeze   # ignora cambios locales (skip-worktree)
make terax-thaw     # vuelve a seguirlo para capturar un nuevo baseline
```

`freeze`/`thaw` son estado local de cada clon; reaplícalos tras clonar.

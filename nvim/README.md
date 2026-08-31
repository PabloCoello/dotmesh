# nvim

Paquete dotmesh que gestiona la configuración de Neovim.

## Qué contiene

- Configuración modular en Lua: opciones, atajos de teclado y autocomandos en `lua/core/`.
- Plugins gestionados por [lazy.nvim](https://github.com/folke/lazy.nvim) en `lua/plugins/`.
- Script de instalación sin `sudo` en `scripts/install-nvim.sh`.

## Instalación

```bash
# 1. Instala Neovim >= 0.11 en ~/.local/bin/nvim
make nvim-install

# 2. Enlaza la configuración en ~/.config/nvim
make stow
```

En el primer arranque lazy.nvim descarga e instala todos los plugins, y Mason instala los servidores LSP (lua_ls, marksman, bashls).

## Plugins incluidos

| Categoría | Plugin |
|---|---|
| Gestor de plugins | lazy.nvim |
| LSP | nvim-lspconfig + Mason |
| Compleción | nvim-cmp (LSP, LuaSnip, buffer, path) |
| Resaltado | nvim-treesitter |
| Búsqueda | Telescope + fzf-native |
| Git | gitsigns.nvim, Neogit |
| UI | lualine, which-key, neo-tree, nvim-notify, dressing |
| Edición | nvim-autopairs, Comment.nvim, nvim-surround, mini.ai |
| Sesiones | persistence.nvim |
| Terminal | toggleterm.nvim |
| Markdown | markdown-preview.nvim |
| Plegado | nvim-ufo |
| IA | opencode.nvim |
| Tema | dotmesh (propio, `colors/dotmesh.lua`); material.nvim disponible como fallback manual |

## Atajos principales

### Navegación

| Atajo | Acción |
|---|---|
| `<Espacio><Espacio>` o `<Espacio>ff` | Buscar ficheros |
| `<Espacio>fg` | Buscar texto (live grep) |
| `<Espacio>fb` | Buffers abiertos |
| `-` | Explorador de ficheros (neo-tree) |
| `j` / `k` / flechas | Bajan y suben por **línea de pantalla**, no de buffer |

Las líneas largas se ajustan al ancho de la ventana (`wrap`) cortando por palabra
(`linebreak`), con sangría continuada (`breakindent`) y un `↳` al principio de cada
fila de continuación (`showbreak`). Por eso `j` y `k` se mueven por fila visible: en un
párrafo ajustado es lo que uno espera. Un count los devuelve a líneas de buffer, así
que `5j` siguen siendo cinco líneas reales.

### LSP

| Atajo | Acción |
|---|---|
| `gd` | Ir a la definición |
| `gr` | Referencias |
| `K` | Documentación (hover) |
| `<Espacio>cr` | Renombrar símbolo |
| `<Espacio>ca` | Acciones de código |
| `<Espacio>f` | Formatear el documento |
| `[d` / `]d` | Diagnóstico anterior / siguiente |

### Git

| Atajo | Acción |
|---|---|
| `<Espacio>gg` | Neogit (interfaz de estado) |
| `]h` / `[h` | Siguiente / anterior hunk |
| `<Espacio>ghp` | Previsualizar hunk |
| `<Espacio>ghs` | Poner en stage el hunk |

### IA (OpenCode)

| Atajo | Acción |
|---|---|
| `<Espacio>aa` | Preguntar con contexto |
| `<Espacio>ai` | Seleccionar acción |
| `<Espacio>at` | Mostrar/ocultar UI |

### Revisión (mesh-review)

**Modo normal:**

| Atajo | Acción |
|---|---|
| `<Espacio>rp` | Abrir panel de revisión del fichero actual |
| `<Espacio>rs` | Levantar la sesión scribe (si no existe) y enviarle los hilos pendientes del documento actual |

**Modo visual** (sobre una selección de texto):

| Atajo | Tipo | Confianza requerida |
|---|---|---|
| `<Espacio>ro` | Selector interactivo (leyenda + una tecla) | según tipo |
| `<Espacio>re` | edita | no |
| `<Espacio>rs` | sugerencia | no |
| `<Espacio>rp` | pregunta | no |
| `<Espacio>rv` | verifica | sí (segunda tecla: `a` alta · `m` media · `b` baja) |
| `<Espacio>rn` | nota | no |
| `<Espacio>rr` | referencia | no |
| `<Espacio>ru` | supuesto | sí (segunda tecla: `a` alta · `m` media · `b` baja) |

`<Espacio>rs` y `<Espacio>rp` existen en modo normal y visual con acciones
distintas. Neovim distingue los modos con precisión; no hay conflicto real.

**Keymaps locales del panel** (buffer `mesh-review://…`):

| Atajo | Acción |
|---|---|
| `r` | Responder al hilo bajo el cursor |
| `x` | Resolver el hilo bajo el cursor |
| `q` / `<Esc>` | Cerrar el panel |

**Comandos:**

| Comando | Acción |
|---|---|
| `:MeshPanel` | Igual que `<Espacio>rp` |
| `:MeshRetract <thread_id> <msg_id> [reason]` | Retractar un mensaje |

El plugin resuelve el CLI de mesh-review en este orden: opción `cli` de `setup()`,
variable de entorno `MESH_REVIEW_CLI`, ruta `~/.claude/skills/doc-review/bin/mesh-review.mjs`.
Si no se encuentra el CLI, los keymaps no se registran y aparece una advertencia.

#### Puente con scribe (`<Espacio>rs` en modo normal)

`<Espacio>rs` envía los hilos pendientes del documento actual a la persona
`scribe` de Claude Code, que los procesa de forma autónoma en un pane lateral
de herdr. El flujo es:

1. Comprueba que `HERDR_ENV=1` (el atajo no hace nada fuera de herdr).
2. Consulta `herdr agent get scribe`:
   - Si la sesión existe, envía el prompt directamente.
   - Si no existe (`agent_not_found`), abre un pane a la derecha del actual
     (sin robar el foco), arranca `claude --settings '{"outputStyle":"scribe"}'`
     en él como agente llamado `scribe`, espera a que esté listo (hasta 60 s)
     y envía el prompt.
3. El texto del prompt es el mismo que el botón «enviar pendientes» de la
   extensión de VS Code:
   ```
   Procesa los hilos pendientes del documento '<ruta>'. Ejecuta: mesh-review project --pending '<ruta>'
   ```
   La ruta viaja entrecomillada (POSIX) y colapsada a una sola línea.

Requisitos: `HERDR_ENV=1` (dentro de un pane herdr), `herdr` y `claude` en el
`PATH`. La sesión se registra en herdr con el nombre `scribe`; si quieres
reutilizarla desde otro pane, ya estará disponible como target de
`herdr agent prompt scribe …`.

**Primera vez en una carpeta nueva:** Claude Code pide confirmación de confianza
antes de trabajar en un directorio que no ha visto antes. Si eso ocurre, el pane
scribe muestra el diálogo con las opciones «No, exit» / «Yes, I trust this folder»
y el plugin detecta ese estado leyendo la pantalla. En ese caso:

- El plugin enfoca el pane automáticamente para que veas el diálogo.
- Aparece una notificación WARN en Neovim explicando que hay que aceptar.
- El prompt **no se envía**: el plugin espera a que lo hagas tú.

Acepta la confianza en el pane scribe («Yes, I trust this folder» + Enter) y vuelve
a pulsar `<líder>rs`. El prompt se enviará en ese segundo intento, con la sesión
ya en marcha.

Todo el flujo es asíncrono: el editor no se congela mientras Claude arranca.

### Terminal

| Atajo | Acción |
|---|---|
| `<C-\>` | Alternar terminal |
| `<Espacio>tf` | Terminal flotante |
| `<Espacio>th` | Terminal horizontal |
| `<Esc><Esc>` | Salir del modo terminal |

## Versión mínima de Neovim

0.11. El script de instalación descarga el AppImage oficial de GitHub releases en `~/.local/bin/nvim` si la versión disponible en el sistema es inferior a ese umbral.

## Stow

`make stow` enlaza `nvim/.config/nvim/` en `~/.config/nvim/`. El directorio `scripts/` queda excluido (véase `.stow-local-ignore`).

## Integridad de la instalación

Neovim no publica checksums ni firmas junto a sus artefactos de release, así que el
script no puede verificar nada contra el proveedor. En su lugar, `install-nvim.sh`
**fija el tag y el SHA-256** del AppImage y aborta si el binario descargado no casa.
El pin se repite en `scripts/vendor/upstreams.tsv`, junto al resto de dependencias
externas del repositorio.

Para subir de versión: cambia `NVIM_TAG`, descarga el AppImage, comprueba su
`sha256sum` y actualiza `NVIM_SHA256` y el TSV.

Tres riesgos quedan aceptados a conciencia, por ser la superficie normal del
ecosistema de Neovim y no tener arreglo proporcionado:

- **lazy.nvim** se clona en el primer arranque desde su rama `stable`, sin commit
  fijado. Es el arranque que documenta el propio proyecto; fijarlo a mano crearía una
  trampa de mantenimiento a cambio de poco.
- **Mason** resuelve los servidores LSP contra sus registros en tiempo de arranque;
  esos binarios no entran en `lazy-lock.json`.
- **markdown-preview.nvim** ejecuta `npm install` como paso de construcción, con el
  `package-lock.json` que trae el commit fijado.

`nvim-treesitter` y `nvim-treesitter-textobjects` llevan `branch = "main"` explícito
en `lua/plugins/treesitter.lua`, y no por gusto: lazy resuelve la rama por defecto
preguntando al clon local, cuyo symref `origin/HEAD` queda cacheado del día que se
clonó. En una máquina que ya tuvo el plugin, ese símbolo sigue apuntando a `master` y
el `update` se queda ahí por mucho que upstream haya movido la rama por defecto.

`master` está congelado upstream y **no soporta Neovim >= 0.11**: sus directivas
propias (`set-lang-from-info-string!`, `set-lang-from-mimetype!`, `downcase!`) leen
`match[id]` como un nodo suelto, pero desde 0.11 el match entrega una lista de nodos.
El handler acaba llamando a `:range()` sobre una tabla, aborta el parseo del buffer
entero y el fichero se queda sin resaltado. Markdown y HTML eran los casos visibles.

La rama `main` cambia la API, y de ahí la forma del fichero:

| `master` (antes) | `main` (ahora) |
|---|---|
| `require("nvim-treesitter.configs").setup{}` | `require("nvim-treesitter").install{}` |
| `ensure_installed` / `auto_install` | lista de parsers pasada a `install()` |
| `highlight.enable = true` | `vim.treesitter.start()` en un autocmd `FileType` |
| `indent.enable = true` | `vim.bo.indentexpr` (experimental; **no** activado) |
| `textobjects` dentro de `configs` | `setup()` propio + un `vim.keymap.set` por atajo |

El `pcall` alrededor de `vim.treesitter.start()` no es decorativo: `start()` usa
`assert()` por dentro, así que sin él la primera sesión tras una instalación limpia
llena `:messages` de errores mientras los parsers todavía se compilan.

La indentación por tree-sitter queda **desactivada** a conciencia: upstream la marca
como experimental y en varios de los idiomas de la lista la nativa de Neovim es
mejor. Se puede añadir después, idioma a idioma, sin tocar nada más.

### Dependencia nueva: tree-sitter CLI

La rama `main` no distribuye parsers precompilados: los construye en la máquina con
`tree-sitter build`. Hace falta el CLI, versión >= 0.26.1.

```bash
brew install tree-sitter-cli   # macOS
```

Ojo con el nombre: la fórmula `tree-sitter` de Homebrew instala solo
`libtree-sitter` y deja el PATH como estaba. El binario está en `tree-sitter-cli`.
En Linux, `cargo install tree-sitter-cli` o el gestor de paquetes de la distro.
`make health` avisa si falta, y el requisito queda anotado en
`scripts/vendor/upstreams.tsv`.

La primera sesión tras una instalación limpia compila los 15 parsers en segundo
plano. Tarda unos minutos y durante ese rato los ficheros abren sin resaltado.

## Plugin mesh-review

El módulo `lua/mesh_review/utf.lua` implementa la conversión bidireccional entre
posiciones `{row, col_bytes}` de Neovim y offsets en unidades de código UTF-16 que
usa el CLI de mesh-review.

### Ejecutar los tests de conversión UTF-16

Los tests corren en Neovim headless sin necesidad de plugins ni de stow. La única
dependencia es la API estándar de Neovim (>= 0.11):

```bash
# Desde la raíz del repositorio dotmesh:
SPEC=$(realpath nvim/.config/nvim/tests/utf_spec.lua)
~/.local/bin/nvim --headless -u NONE -c "luafile $SPEC" -c "qa"
```

Salida esperada: `30 passed, 0 failed` en stderr y código de salida 0.
Con cualquier fallo, el código de salida es 1.

Tras `make stow` también funciona la forma corta:

```bash
~/.local/bin/nvim --headless -u NONE \
  -c "luafile $HOME/.config/nvim/tests/utf_spec.lua" -c "qa"
```

## Más información

- [Documentación de Neovim](https://neovim.io/doc/)
- [lazy.nvim](https://github.com/folke/lazy.nvim)
- [opencode.nvim](https://github.com/NickvanDyke/opencode.nvim)

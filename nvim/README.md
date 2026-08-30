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
| Tema | material.nvim (oceanic) |

## Atajos principales

### Navegación

| Atajo | Acción |
|---|---|
| `<Espacio><Espacio>` o `<Espacio>ff` | Buscar ficheros |
| `<Espacio>fg` | Buscar texto (live grep) |
| `<Espacio>fb` | Buffers abiertos |
| `-` | Explorador de ficheros (neo-tree) |

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
| `<Espacio>rs` | Enviar prompt a scribe (requiere `HERDR_ENV=1`) |

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

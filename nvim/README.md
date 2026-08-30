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

## Más información

- [Documentación de Neovim](https://neovim.io/doc/)
- [lazy.nvim](https://github.com/folke/lazy.nvim)
- [opencode.nvim](https://github.com/NickvanDyke/opencode.nvim)

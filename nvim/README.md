# Neovim Configuration - Pandora Environment

Modern Neovim configuration optimized for data analysis workflows with deep AI integration.

## Features

### Core Capabilities
- **AI-Powered Development** via opencode.nvim (OpenCode) + Ollama
- **Data Analysis Stack**: Python (ETL), R (Statistics), Quarto (Reports)
- **Modern LSP**: pyright, ruff, r_language_server, lua_ls, marksman
- **Smart Completion**: nvim-cmp with LSP, snippets, and buffer sources
- **Syntax Highlighting**: Tree-sitter for all major languages
- **Fuzzy Finding**: Telescope with fzf-native
- **Everforest Theme**: Calm, high-contrast dark palette

### AI Integration (opencode.nvim)
Cliente OpenCode con keymaps simples y proveedores configurables por variables de entorno.

**Proveedores**:
- OpenCode (`OPENCODE_BASE_URL`, `OPENCODE_API_KEY`, opcional `OPENCODE_MODEL`)
- OpenAI/Codex (`OPENAI_BASE_URL`, `OPENAI_API_KEY`, opcional `OPENAI_MODEL`)
- Ollama (`OLLAMA_HOST`, `OLLAMA_MODEL`)

**Keybindings**:
- `<Space>aa` - Preguntar con contexto (selección o cursor)
- `<Space>ai` - Seleccionar acción/prompts
- `<Space>at` - Mostrar/ocultar UI de OpenCode

### Quarto Support
Full Quarto integration for scientific computing and reproducibility.

**Plugins**:
- `quarto-nvim` - Quarto language features
- `molten-nvim` - Jupyter kernel execution
- `otter.nvim` - Embedded language support
- `image.nvim` - Inline image rendering

**Keybindings** (LocalLeader = `,`):
- `,qp` - Preview Quarto document
- `,qq` - Close preview
- `,mi` - Initialize Molten kernel
- `,ml` - Evaluate line
- `,mv` - Evaluate visual selection
- `,mo` - Show output

### Obsidian Knowledge Base
Obsidian vault at `~/Documents/Pandora` (versioned in a separate repo). Auto-loads Obsidian helpers only for vault markdown files.

**Plugins**:
- `obsidian.nvim` - Workspace, daily notes, templates, backlinks

**Keybindings**:
- `<Space>oo` - Quick switch notes
- `<Space>on` - New note
- `<Space>os` - Search vault
- `<Space>ot` - Today note
- `<Space>oy` - Yesterday note
- `<Space>ob` - Backlinks
- `<Space>ol` - Links in current note
- `<Space>oc` - Table of contents
- `<Space>op` - Paste image into `Assets/Images`
- `<Space>od` - List daily notes

### File Navigation
- **neo-tree.nvim**: Sidebar file explorer (`-` to toggle/reveal)
- **Telescope**: Fuzzy finder for files, grep, buffers, etc.

**Telescope Keybindings**:
- `<Space><Space>` or `<Space>ff` - Find files
- `<Space>fg` - Live grep
- `<Space>fb` - Buffers
- `<Space>fh` - Help tags
- `<Space>fr` - Recent files
- `<Space>fz` - Zotero citations (`ZOTERO_BBT_PATH` or `~/Documents/Zotero/betterbibtex.bib`)
- `<Space>fi` - Insert citation into buffer

### LSP Features
**Keybindings**:
- `gd` - Go to definition
- `gr` - Go to references
- `K` - Hover documentation
- `<Space>rn` - Rename symbol
- `<Space>ca` - Code actions
- `<Space>f` - Format document
- `[d` / `]d` - Navigate diagnostics

### Git Integration
- **gitsigns.nvim**: Show git changes in sign column
- **Neogit**: Full `git status`/commit UI inside Neovim
- **Telescope git commands**

**Git Keybindings**:
- `<Space>gg` - Neogit (status UI)
- `]h` / `[h` - Next/previous hunk
- `<Space>ghp` - Preview hunk
- `<Space>ghs` - Stage hunk
- `<Space>ghr` - Reset hunk
- `<Space>ghb` - Blame line

### Text Editing
- **nvim-autopairs**: Auto-close brackets and quotes
- **Comment.nvim**: Smart commenting (`gcc`, `gc`)
- **nvim-surround**: Surround text objects (`ys`, `ds`, `cs`)
- **mini.ai**: Enhanced text objects

### UI Enhancements
- **lualine.nvim**: Statusline with mode, git, diagnostics
- **indent-blankline.nvim**: Indent guides
- **which-key.nvim**: Keybinding hints
- **nvim-notify**: Better notifications
- **dressing.nvim**: Enhanced vim.ui

### Terminal
- **toggleterm.nvim**: Integrated terminal
  - `<Ctrl-\>` - Toggle terminal
  - `<Space>tf` - Floating terminal
  - `<Space>th` - Horizontal terminal
  - `<Space>tv` - Vertical terminal

## Structure

```
nvim/
├── .config/nvim/
│   ├── init.lua                   # Entry point
│   └── lua/
│       ├── core/
│       │   ├── options.lua        # Vim options
│       │   ├── keymaps.lua        # Core keymaps
│       │   └── autocommands.lua   # Autocommands
│       └── plugins/               # Plugin specs (lazy.nvim)
│           ├── colorscheme.lua    # Everforest theme
│           ├── lsp.lua            # LSP configuration
│           ├── treesitter.lua     # Syntax highlighting
│           ├── completion.lua     # nvim-cmp
│           ├── telescope.lua      # Fuzzy finder
│           ├── quarto.lua         # Quarto support
│           ├── obsidian.lua       # Obsidian integration
│           ├── ui.lua             # UI plugins
│           └── utils.lua          # Utility plugins (incl. opencode.nvim)
```

## Installation

The Neovim configuration is part of the dotfiles and is installed with:

```bash
make install
```

On first launch, Neovim will:
1. Install lazy.nvim plugin manager
2. Install all plugins automatically
3. Install LSP servers via Mason

## Configuration

### Update Ollama / OpenCode / OpenAI endpoints
Export env vars (p.ej. en `~/.zshrc.local`):

```bash
export OLLAMA_HOST="http://192.168.1.100:11434"
export OPENCODE_BASE_URL="https://api.openai.com/v1"
export OPENCODE_API_KEY="tu_token"
export OPENAI_API_KEY="tu_token_openai"
```

### Set Obsidian Vault Path
Edit `nvim/.config/nvim/lua/plugins/obsidian.lua` to point to your vault:

```lua
local vault_path = vim.env.OBSIDIAN_VAULT or "~/Documents/Pandora"
```

### Set Zotero export path
Set an environment variable to your BetterBibTeX auto-export:

```bash
export ZOTERO_BBT_PATH="$HOME/Documents/Zotero/betterbibtex.bib"
```

Telescope bibtex uses it via `<Space>fz`.

### Add More LSP Servers
Edit `nvim/.config/nvim/lua/plugins/lsp.lua`:

```lua
local servers = {
  "pyright",
  "ruff_lsp",
  "r_language_server",
  -- Add more here
}
```

### Customize Colorscheme
Material (oceanic) se define en `nvim/.config/nvim/lua/plugins/colorscheme.lua` (plugin `marko-cerovac/material.nvim`).

## Workflows

### Python Development
1. Open Python file
2. LSP provides autocomplete, diagnostics, formatting
3. Use `<Space>ai` for AI assistance on selected code
4. Use `<Space>ap` for Python-specific analysis

### R Statistical Analysis
1. Open R file
2. LSP provides R-specific features
3. Execute code in REPL with Quarto integration
4. Use `<Space>ar` for statistical modeling help

### Quarto Reports
1. Open `.qmd` file
2. Initialize kernel: `,mi python` or `,mi ir`
3. Execute cells: `,ml` (line) or `,mv` (selection)
4. Preview: `,qp`
5. Get AI help on document structure: `<Space>aq`

## Keybinding Cheatsheet

### Leader Keys
- **Leader**: `<Space>`
- **LocalLeader**: `,`

### Essential
- `<Space>ff` - Find files
- `<Space>fg` - Live grep
- `<Space>aa` - AI chat
- `<Space>e` - Show diagnostic
- `-` - File explorer (neo-tree)
- `K` - Hover docs
- `gd` - Go to definition

### Window Management
- `<Ctrl-h/j/k/l>` - Move between splits
- `<Ctrl-Up/Down/Left/Right>` - Resize splits

### Terminal
- `<Ctrl-\>` - Toggle terminal
- `<Esc><Esc>` - Exit terminal mode

### AI (OpenCode)
- `<Space>aa` - Preguntar con contexto (selección/cursor)
- `<Space>ai` - Seleccionar acción/prompts
- `<Space>at` - Mostrar/ocultar UI de OpenCode

## Troubleshooting

### LSP Not Working
```bash
:Mason           # Check installed servers
:LspInfo         # Check LSP status
:checkhealth     # Full health check
```

### AI Not Connecting
1. Check Ollama server: `curl $OLLAMA_HOST/api/tags`
2. Verifica que `OPENCODE_BASE_URL` y `OPENCODE_API_KEY` estén exportadas
3. Restart Neovim

### Plugins Not Loading
```bash
:Lazy            # Open plugin manager
:Lazy sync       # Update all plugins
:Lazy clean      # Remove unused plugins
```

### Performance Issues
1. Check startup time: `nvim --startuptime startup.log`
2. Profile plugins: `:Lazy profile`
3. Disable unused features in plugin configs

## Customization

### Add Custom Keybindings
Edit `nvim/.config/nvim/lua/core/keymaps.lua`

### Add Custom Plugins
Create new file in `nvim/.config/nvim/lua/plugins/` following lazy.nvim format

### Change Theme Colors
Edit `themes/pandora/palette.json` and run `make theme` to regenerate

## Resources

- [Neovim Docs](https://neovim.io/doc/)
- [lazy.nvim](https://github.com/folke/lazy.nvim)
- [opencode.nvim](https://github.com/NickvanDyke/opencode.nvim)
- [quarto-nvim](https://github.com/quarto-dev/quarto-nvim)
- [Ollama](https://ollama.ai/)

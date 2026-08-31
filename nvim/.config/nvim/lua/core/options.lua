-- ============================================================================
-- Core Options — dotmesh Neovim Configuration
-- ============================================================================

local opt = vim.opt
local g = vim.g

-- ============================================================================
-- Leader Keys
-- ============================================================================
g.mapleader = " "
g.maplocalleader = ","

-- ============================================================================
-- General Settings
-- ============================================================================
opt.mouse = "a"                   -- Enable mouse support
opt.clipboard = "unnamedplus"     -- Use system clipboard
opt.swapfile = false              -- Disable swap files
opt.backup = false                -- No backup files
opt.writebackup = false           -- No backup before writing
opt.undofile = true               -- Enable persistent undo
opt.undolevels = 10000            -- Undo history
opt.updatetime = 250              -- Faster completion (default: 4000ms)
opt.timeoutlen = 300              -- Time to wait for mapped sequence
opt.confirm = true                -- Confirm to save changes before exiting

-- ============================================================================
-- UI & Appearance
-- ============================================================================
opt.number = true                 -- Show line numbers
opt.relativenumber = false        -- Use absolute line numbers
opt.signcolumn = "yes"            -- Always show sign column
opt.cursorline = true             -- Highlight current line
opt.wrap = true                   -- Wrap long lines instead of hiding them off-screen
opt.linebreak = true              -- Break at word boundaries, not mid-word
opt.showbreak = "\u{21B3} "         -- Marker on continuation rows
opt.scrolloff = 8                 -- Minimal lines to keep above/below cursor
opt.pumheight = 10                -- Popup menu height
opt.showmode = false              -- Don't show mode (using statusline)
opt.termguicolors = true          -- True color support
opt.background = "dark"           -- Dark background

-- ============================================================================
-- Indentation & Formatting
-- ============================================================================
opt.expandtab = true              -- Use spaces instead of tabs
opt.shiftwidth = 4                -- Size of indent
opt.tabstop = 4                   -- Number of spaces tabs count for
opt.softtabstop = 4               -- Number of spaces for editing
opt.smartindent = true            -- Smart autoindenting
opt.shiftround = true             -- Round indent to multiple of shiftwidth
opt.breakindent = true            -- Wrapped lines continue indented

-- ============================================================================
-- Search & Replace
-- ============================================================================
opt.ignorecase = true             -- Ignore case in search
opt.smartcase = true              -- Override ignorecase if search has uppercase
opt.hlsearch = true               -- Highlight search results
opt.incsearch = true              -- Incremental search

-- ============================================================================
-- Splits
-- ============================================================================
opt.splitright = true             -- Vertical splits go to the right
opt.splitbelow = true             -- Horizontal splits go below

-- ============================================================================
-- Completion
-- ============================================================================
opt.completeopt = "menu,menuone,noselect"
opt.shortmess:append("c")         -- Don't show completion messages

-- ============================================================================
-- File Handling
-- ============================================================================
opt.fileencoding = "utf-8"        -- File encoding
opt.conceallevel = 0              -- Show concealed text
opt.hidden = true                 -- Enable modified buffers in background

-- Markdown: no syntax conceal
g.markdown_syntax_conceal = 0
g.vim_markdown_conceal = 0

-- ============================================================================
-- Disable built-in providers we don't need
-- ============================================================================
g.loaded_perl_provider = 0

-- ============================================================================
-- Netrw (File Browser) — Disabled in favor of neo-tree
-- ============================================================================
g.loaded_netrw = 1
g.loaded_netrwPlugin = 1

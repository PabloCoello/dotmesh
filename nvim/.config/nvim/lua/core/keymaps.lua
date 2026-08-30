-- ============================================================================
-- Core Keymaps - Pandora Neovim Configuration
-- ============================================================================

local keymap = vim.keymap.set
local opts = { noremap = true, silent = true }

-- ============================================================================
-- Better Navigation
-- ============================================================================
-- Move between windows
keymap("n", "<C-h>", "<C-w>h", opts)
keymap("n", "<C-j>", "<C-w>j", opts)
keymap("n", "<C-k>", "<C-w>k", opts)
keymap("n", "<C-l>", "<C-w>l", opts)

-- Resize windows with arrows
keymap("n", "<C-Up>", ":resize +2<CR>", opts)
keymap("n", "<C-Down>", ":resize -2<CR>", opts)
keymap("n", "<C-Left>", ":vertical resize -2<CR>", opts)
keymap("n", "<C-Right>", ":vertical resize +2<CR>", opts)

-- ============================================================================
-- Better Editing
-- ============================================================================
-- Stay in indent mode
keymap("v", "<", "<gv", opts)
keymap("v", ">", ">gv", opts)

-- Move text up and down
keymap("v", "J", ":m '>+1<CR>gv=gv", opts)
keymap("v", "K", ":m '<-2<CR>gv=gv", opts)

-- Keep cursor centered when scrolling
keymap("n", "<C-d>", "<C-d>zz", opts)
keymap("n", "<C-u>", "<C-u>zz", opts)
keymap("n", "n", "nzzzv", opts)
keymap("n", "N", "Nzzzv", opts)

-- Better paste (don't yank replaced text)
keymap("v", "p", '"_dP', opts)

-- ============================================================================
-- Save & Quit
-- ============================================================================
keymap({ "i", "n" }, "<C-s>", "<cmd>w<cr><esc>", { desc = "Save file" })
keymap("n", "<leader>q", "<cmd>q<cr>", { desc = "Quit" })
keymap("n", "<leader>Q", "<cmd>qa<cr>", { desc = "Quit all" })

-- ============================================================================
-- Clear Search Highlighting
-- ============================================================================
keymap("n", "<Esc>", "<cmd>nohlsearch<CR>", opts)

-- ============================================================================
-- Toggles (buffer-local)
-- ============================================================================
keymap("n", "<leader>ts", function()
  vim.opt_local.spell = not vim.opt_local.spell:get()
end, { desc = "Toggle spellcheck" })

keymap("n", "<leader>td", function()
  local bufnr = vim.api.nvim_get_current_buf()
  local disabled = vim.diagnostic.is_enabled({ bufnr = bufnr }) == false
  if disabled then
    vim.diagnostic.enable(nil, { bufnr = bufnr })
  else
    vim.diagnostic.enable(false, { bufnr = bufnr })
  end
end, { desc = "Toggle diagnostics" })

-- ============================================================================
-- Buffer Management
-- ============================================================================
keymap("n", "<S-h>", "<cmd>bprevious<cr>", { desc = "Previous buffer" })
keymap("n", "<S-l>", "<cmd>bnext<cr>", { desc = "Next buffer" })
keymap("n", "<leader>bd", "<cmd>bdelete<cr>", { desc = "Delete buffer" })

-- ============================================================================
-- Terminal
-- ============================================================================
keymap("t", "<Esc><Esc>", "<C-\\><C-n>", { desc = "Exit terminal mode" })

-- ============================================================================
-- Diagnostics
-- ============================================================================
keymap("n", "[d", vim.diagnostic.goto_prev, { desc = "Previous diagnostic" })
keymap("n", "]d", vim.diagnostic.goto_next, { desc = "Next diagnostic" })
keymap("n", "<leader>e", vim.diagnostic.open_float, { desc = "Show diagnostic" })
keymap("n", "<leader>dl", vim.diagnostic.setloclist, { desc = "Diagnostic list" })

-- ============================================================================
-- Quickfix & Location List
-- ============================================================================
keymap("n", "[q", "<cmd>cprev<cr>", { desc = "Previous quickfix" })
keymap("n", "]q", "<cmd>cnext<cr>", { desc = "Next quickfix" })
keymap("n", "[l", "<cmd>lprev<cr>", { desc = "Previous location" })
keymap("n", "]l", "<cmd>lnext<cr>", { desc = "Next location" })

-- ============================================================================
-- Disable Keys
-- ============================================================================
keymap("n", "Q", "<nop>", opts)  -- Disable Ex mode

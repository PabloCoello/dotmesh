-- ============================================================================
-- Core Autocommands - Pandora Neovim Configuration
-- ============================================================================

local autocmd = vim.api.nvim_create_autocmd
local augroup = vim.api.nvim_create_augroup

-- ============================================================================
-- General Autocommands
-- ============================================================================
local general = augroup("General", { clear = true })

-- Highlight on yank
autocmd("TextYankPost", {
  group = general,
  callback = function()
    vim.highlight.on_yank({ higroup = "IncSearch", timeout = 200 })
  end,
})

-- Close some filetypes with <q>
autocmd("FileType", {
  group = general,
  pattern = {
    "qf",
    "help",
    "man",
    "notify",
    "lspinfo",
    "startuptime",
    "checkhealth",
  },
  callback = function(event)
    vim.bo[event.buf].buflisted = false
    vim.keymap.set("n", "q", "<cmd>close<cr>", { buffer = event.buf, silent = true })
  end,
})

-- Auto create dir when saving a file, in case parent dir doesn't exist
autocmd("BufWritePre", {
  group = general,
  callback = function(event)
    if event.match:match("^%w%w+://") then
      return
    end
    local file = vim.loop.fs_realpath(event.match) or event.match
    vim.fn.mkdir(vim.fn.fnamemodify(file, ":p:h"), "p")
  end,
})

-- Remove trailing whitespace on save
autocmd("BufWritePre", {
  group = general,
  pattern = "*",
  command = [[%s/\s\+$//e]],
})

-- ============================================================================
-- Python Specific
-- ============================================================================
local python = augroup("Python", { clear = true })

autocmd("FileType", {
  group = python,
  pattern = "python",
  callback = function()
    vim.opt_local.shiftwidth = 4
    vim.opt_local.tabstop = 4
    vim.opt_local.expandtab = true
  end,
})

-- ============================================================================
-- R Specific
-- ============================================================================
local r = augroup("R", { clear = true })

autocmd("FileType", {
  group = r,
  pattern = "r",
  callback = function()
    vim.opt_local.shiftwidth = 2
    vim.opt_local.tabstop = 2
    vim.opt_local.expandtab = true
  end,
})

-- ============================================================================
-- Quarto Specific
-- ============================================================================
local quarto = augroup("Quarto", { clear = true })

autocmd("FileType", {
  group = quarto,
  pattern = { "quarto", "markdown" },
  callback = function()
    vim.opt_local.wrap = true
    vim.opt_local.linebreak = true
    vim.opt_local.spell = false
    vim.opt_local.conceallevel = 0 -- keep fenced code markers visible
    vim.diagnostic.enable(false, { bufnr = 0 })
  end,
})

-- ============================================================================
-- Terminal
-- ============================================================================
local terminal = augroup("Terminal", { clear = true })

-- Start terminal in insert mode
autocmd("TermOpen", {
  group = terminal,
  callback = function()
    vim.opt_local.number = false
    vim.opt_local.relativenumber = false
    vim.cmd("startinsert")
  end,
})

-- ============================================================================
-- Window Management
-- ============================================================================
local windows = augroup("Windows", { clear = true })

-- Check if we need to reload the file when it changed
autocmd({ "FocusGained", "TermClose", "TermLeave" }, {
  group = windows,
  command = "checktime",
})

-- Resize splits if window got resized
autocmd("VimResized", {
  group = windows,
  callback = function()
    vim.cmd("tabdo wincmd =")
  end,
})

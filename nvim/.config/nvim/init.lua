-- ============================================================================
-- Neovim Configuration - Pandora Environment
-- ============================================================================
-- Data Analyst focused setup: Python ETL, R Stats, Quarto Reports
-- Deep AI integration with Ollama (qwen2.5-coder:32b + gpt-oss:20b)
-- ============================================================================

-- Explicit Python host to avoid pyenv shim issues
vim.g.python3_host_prog = "/Users/pablocoello/.pyenv/versions/3.11.9/bin/python3"

-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable",
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

-- Load core configuration
require("core.options")
require("core.keymaps")
require("core.autocommands")

-- Load plugins via lazy.nvim
require("lazy").setup("plugins", {
  defaults = {
    lazy = false,
    version = false,
  },
  install = {
    colorscheme = { "pandora", "habamax" },
  },
  checker = {
    enabled = true,
    notify = false,
  },
  change_detection = {
    enabled = true,
    notify = false,
  },
  performance = {
    rtp = {
      disabled_plugins = {
        "gzip",
        "matchit",
        "matchparen",
        "netrwPlugin",
        "tarPlugin",
        "tohtml",
        "tutor",
        "zipPlugin",
      },
    },
  },
})

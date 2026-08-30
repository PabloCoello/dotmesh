-- ============================================================================
-- Neovim Configuration — dotmesh
-- ============================================================================
-- General-purpose setup: Lua/Bash/Markdown, LSP, AI integration (opencode.nvim)
-- ============================================================================

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
    colorscheme = { "dotmesh", "habamax" },
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

-- Tema dotmesh. Vive en colors/dotmesh.lua, dentro de esta misma configuración,
-- así que ya está en el runtimepath y no necesita entrada de plugin. Declararlo
-- como spec de lazy con dir = stdpath("config") choca con la entrada local de
-- mesh-review, que apunta al mismo directorio: lazy funde ambas en un solo
-- plugin y solo ejecuta uno de los dos `config`, con lo que el tema se quedaba
-- sin aplicar. Se aplica después de lazy.setup para que sus definiciones ganen
-- a los grupos por defecto que registran los plugins al cargarse.
vim.cmd.colorscheme("dotmesh")

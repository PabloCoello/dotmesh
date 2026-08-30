return {
  -- Colorscheme dotmesh — fuente canónica en colors/dotmesh.lua.
  -- Carga sin dependencias externas; la paleta vive en lua/dotmesh/palette.lua.
  -- priority = 1000 asegura que se aplique antes que cualquier otro plugin.
  {
    dir      = vim.fn.stdpath("config"),
    name     = "dotmesh-colorscheme",
    lazy     = false,
    priority = 1000,
    config   = function()
      vim.cmd.colorscheme("dotmesh")
    end,
  },

  -- material.nvim conserva su entrada pero pasa a lazy = true para no cargarse
  -- al arranque. Se puede activar manualmente con :colorscheme material si se
  -- quiere comparar o hacer fallback.
  {
    "marko-cerovac/material.nvim",
    lazy = true,
    config = function()
      vim.g.material_style = "oceanic"
      require("material").setup({
        contrast = {
          terminal         = false,
          sidebars         = true,
          floating_windows = true,
        },
        styles = {
          comments = { italic = true },
        },
        plugins = {
          "gitsigns",
          "nvim-cmp",
          "nvim-web-devicons",
          "telescope",
          "which-key",
        },
      })
    end,
  },
}

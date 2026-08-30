-- El tema dotmesh NO se declara aquí: `colors/dotmesh.lua` forma parte de esta
-- configuración y se aplica desde init.lua tras lazy.setup. Un spec con
-- dir = stdpath("config") competiría con la entrada local de mesh-review, que
-- apunta al mismo directorio, y lazy solo ejecutaría uno de los dos `config`.

return {
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

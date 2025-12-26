return {
-- Material Palenight (OpenCode default style)
  {
    "marko-cerovac/material.nvim",
    lazy = false,
    priority = 1000,
    config = function()
      -- Try the "oceanic" variant (closer to OpenCode's Material preview)
      vim.g.material_style = "oceanic"
      require("material").setup({
        contrast = {
          terminal = false,
          sidebars = true,
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
      vim.cmd.colorscheme("material")
    end,
  },
}

-- ============================================================================
-- Treesitter Configuration - Syntax Highlighting
-- ============================================================================

-- Ambos plugins se fijan a `master`. La rama por defecto de nvim-treesitter es ya
-- `main`, la reescritura: allí no existe `nvim-treesitter.configs` (solo
-- `nvim-treesitter.config`) y `ensure_installed`/`highlight`/`indent`/`textobjects`
-- desaparecen como opciones de setup. Sin el pin, un clon nuevo cae en `main` y esta
-- configuración revienta al arrancar. Migrar a la API nueva es un cambio aparte.
return {
  {
    "nvim-treesitter/nvim-treesitter",
    branch = "master",
    build = ":TSUpdate",
    dependencies = {
      { "nvim-treesitter/nvim-treesitter-textobjects", branch = "master" },
    },
    config = function()
      require("nvim-treesitter.configs").setup({
        -- Languages for data analysis
        ensure_installed = {
          "python",
          "r",
          "lua",
          "vim",
          "vimdoc",
          "markdown",
          "markdown_inline",
          "bash",
          "sql",
          "json",
          "yaml",
          "toml",
          "html",
          "css",
          "latex",
        },
        auto_install = true,
        highlight = {
          enable = true,
          additional_vim_regex_highlighting = false,
        },
        indent = {
          enable = true,
        },
        textobjects = {
          select = {
            enable = true,
            lookahead = true,
            keymaps = {
              ["af"] = "@function.outer",
              ["if"] = "@function.inner",
              ["ac"] = "@class.outer",
              ["ic"] = "@class.inner",
              ["ab"] = "@block.outer",
              ["ib"] = "@block.inner",
            },
          },
          move = {
            enable = true,
            set_jumps = true,
            goto_next_start = {
              ["]f"] = "@function.outer",
              ["]c"] = "@class.outer",
            },
            goto_next_end = {
              ["]F"] = "@function.outer",
              ["]C"] = "@class.outer",
            },
            goto_previous_start = {
              ["[f"] = "@function.outer",
              ["[c"] = "@class.outer",
            },
            goto_previous_end = {
              ["[F"] = "@function.outer",
              ["[C"] = "@class.outer",
            },
          },
        },
      })
    end,
  },
}

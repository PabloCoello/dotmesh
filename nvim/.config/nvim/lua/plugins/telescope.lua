-- ============================================================================
-- Telescope — Fuzzy Finder
-- ============================================================================

return {
  {
    "nvim-telescope/telescope.nvim",
    cmd = "Telescope",
    dependencies = {
      "nvim-lua/plenary.nvim",
      {
        "nvim-telescope/telescope-fzf-native.nvim",
        build = "make",
      },
    },
    keys = {
      { "<leader><space>", "<cmd>Telescope find_files<cr>",              desc = "Find Files" },
      { "<leader>ff",      "<cmd>Telescope find_files<cr>",              desc = "Find Files" },
      { "<leader>fg",      "<cmd>Telescope live_grep<cr>",               desc = "Live Grep" },
      { "<leader>fb",      "<cmd>Telescope buffers<cr>",                 desc = "Buffers" },
      { "<leader>fh",      "<cmd>Telescope help_tags<cr>",               desc = "Help Tags" },
      { "<leader>fr",      "<cmd>Telescope oldfiles<cr>",                desc = "Recent Files" },
      { "<leader>fc",      "<cmd>Telescope commands<cr>",                desc = "Commands" },
      { "<leader>fk",      "<cmd>Telescope keymaps<cr>",                 desc = "Keymaps" },
      { "<leader>fs",      "<cmd>Telescope lsp_document_symbols<cr>",    desc = "Document Symbols" },
      { "<leader>fw",      "<cmd>Telescope lsp_workspace_symbols<cr>",   desc = "Workspace Symbols" },
    },
    config = function()
      local telescope = require("telescope")
      local actions = require("telescope.actions")

      telescope.setup({
        defaults = {
          prompt_prefix = " ",
          selection_caret = " ",
          path_display = { "truncate" },
          sorting_strategy = "ascending",
          layout_config = {
            horizontal = {
              prompt_position = "top",
              preview_width = 0.55,
            },
            vertical = {
              mirror = false,
            },
            width = 0.87,
            height = 0.80,
            preview_cutoff = 120,
          },
          mappings = {
            i = {
              ["<C-n>"] = actions.move_selection_next,
              ["<C-p>"] = actions.move_selection_previous,
              ["<C-c>"] = actions.close,
              ["<C-j>"] = actions.cycle_history_next,
              ["<C-k>"] = actions.cycle_history_prev,
              ["<C-q>"] = actions.smart_send_to_qflist + actions.open_qflist,
              ["<CR>"] = actions.select_default,
            },
            n = {
              ["<esc>"] = actions.close,
              ["j"] = actions.move_selection_next,
              ["k"] = actions.move_selection_previous,
              ["q"] = actions.close,
            },
          },
        },
        pickers = {
          find_files = {
            hidden = true,
            find_command = { "rg", "--files", "--hidden", "--glob", "!**/.git/*" },
          },
        },
        extensions = {
          fzf = {
            fuzzy = true,
            override_generic_sorter = true,
            override_file_sorter = true,
            case_mode = "smart_case",
          },
        },
      })

      -- Load extensions
      telescope.load_extension("fzf")
    end,
  },
}

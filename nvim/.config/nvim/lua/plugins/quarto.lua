-- ============================================================================
-- Quarto Support - Scientific Computing & Reports
-- ============================================================================

return {
  {
    "quarto-dev/quarto-nvim",
    dependencies = {
      "jmbuhr/otter.nvim",
      "hrsh7th/nvim-cmp",
      "neovim/nvim-lspconfig",
      "nvim-treesitter/nvim-treesitter",
    },
    ft = { "quarto", "markdown" },
    config = function()
      require("quarto").setup({
        debug = false,
        closePreviewOnExit = true,
        lspFeatures = {
          enabled = true,
          languages = { "r", "python", "julia", "bash", "html" },
          chunks = "curly",
          diagnostics = {
            enabled = true,
            triggers = { "BufWritePost" },
          },
          completion = {
            enabled = true,
          },
        },
        codeRunner = {
          enabled = false,  -- Using molten.nvim instead
          default_method = nil,
        },
      })

      -- Keymaps for Quarto
      local keymap = vim.keymap.set
      keymap("n", "<localleader>qp", ":QuartoPreview<CR>", { desc = "Quarto Preview", silent = true })
      keymap("n", "<localleader>qq", ":QuartoClosePreview<CR>", { desc = "Quarto Close Preview", silent = true })
      keymap("n", "<localleader>qh", ":QuartoHelp ", { desc = "Quarto Help" })

      -- Quarto sends handled via toggleterm mapping in utils.lua (<leader><CR>)
    end,
  },
  
  {
    "benlubas/molten-nvim",
    version = "^1.0.0",
    dependencies = { "3rd/image.nvim" },
    build = ":UpdateRemotePlugins",
    init = function()
      vim.g.molten_image_provider = "image.nvim"
      vim.g.molten_output_win_max_height = 20
      vim.g.molten_auto_open_output = false
      vim.g.molten_wrap_output = true
      vim.g.molten_virt_text_output = true
      vim.g.molten_virt_lines_off_by_1 = true
    end,
    keys = {
      { "<localleader>mi", ":MoltenInit<CR>", desc = "Molten Init" },
      { "<localleader>me", ":MoltenEvaluateOperator<CR>", mode = "n", desc = "Molten Evaluate Operator" },
      { "<localleader>ml", ":MoltenEvaluateLine<CR>", mode = "n", desc = "Molten Evaluate Line" },
      { "<localleader>mr", ":MoltenReevaluateCell<CR>", mode = "n", desc = "Molten Re-evaluate Cell" },
      { "<localleader>mv", ":<C-u>MoltenEvaluateVisual<CR>gv", mode = "v", desc = "Molten Evaluate Visual" },
      { "<localleader>md", ":MoltenDelete<CR>", mode = "n", desc = "Molten Delete Cell" },
      { "<localleader>mo", ":MoltenShowOutput<CR>", mode = "n", desc = "Molten Show Output" },
      { "<localleader>mh", ":MoltenHideOutput<CR>", mode = "n", desc = "Molten Hide Output" },
    },
  },
  
  {
    "3rd/image.nvim",
    ft = { "quarto", "markdown", "vimwiki" },
    opts = function()
      -- Detect tmux passthrough; disable images if not available
      local in_tmux = vim.env.TMUX ~= nil
      local term = os.getenv("TERM_PROGRAM") or ""
      local allow = false
      if in_tmux and os.getenv("TMUX") then
        -- tmux passthrough detection: rely on allow-passthrough being set AND terminal supporting it
        allow = term:lower():match("ghostty") or term:lower():match("kitty")
      else
        allow = term:lower():match("ghostty") or term:lower():match("kitty")
      end
      if not allow then
        return { enabled = false }
      end
      return {
        backend = "kitty",
        integrations = {
          markdown = {
            enabled = true,
            clear_in_insert_mode = false,
            download_remote_images = true,
            only_render_image_at_cursor = false,
            filetypes = { "markdown", "quarto" },
          },
        },
        max_width = nil,
        max_height = nil,
        max_width_window_percentage = nil,
        max_height_window_percentage = 50,
        window_overlap_clear_enabled = false,
        window_overlap_clear_ft_ignore = { "cmp_menu", "cmp_docs", "" },
      }
    end,
  },
}

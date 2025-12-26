-- ============================================================================
-- Obsidian Integration - Knowledge Workflow
-- ============================================================================
-- Vault path can be overridden with $OBSIDIAN_VAULT, defaults to ~/Documents/Pandora
local vault_path = vim.env.OBSIDIAN_VAULT or "~/Documents/Pandora"

return {
  {
    "epwalsh/obsidian.nvim",
    version = "*",
    lazy = true,
    cmd = {
      "ObsidianOpen",
      "ObsidianNew",
      "ObsidianQuickSwitch",
      "ObsidianToday",
      "ObsidianYesterday",
      "ObsidianDailies",
      "ObsidianSearch",
      "ObsidianBacklinks",
      "ObsidianLinks",
      "ObsidianTOC",
      "ObsidianPasteImg",
    },
    ft = "markdown",
    event = {
      "BufReadPre " .. vim.fn.expand(vault_path) .. "/**.md",
      "BufNewFile " .. vim.fn.expand(vault_path) .. "/**.md",
    },
    dependencies = { "nvim-lua/plenary.nvim" },
    opts = {
      workspaces = {
        {
          name = "pandora",
          path = vault_path,
        },
      },
      preferred_link_style = "markdown",
      ui = { enable = true, checkboxes = { [" "] = { char = "⬜" }, ["x"] = { char = "✅" } } },
      notes_subdir = "Inbox",
      daily_notes = {
        folder = "Daily",
        date_format = "%Y-%m-%d",
      },
      templates = {
        folder = "Templates",
        date_format = "%Y-%m-%d",
        time_format = "%H:%M",
      },
      completion = { nvim_cmp = true },
      disable_frontmatter = false,
      attachments = {
        img_folder = "Assets/Images",
      },
    },
    keys = {
      { "<leader>oo", "<cmd>ObsidianQuickSwitch<cr>", desc = "Obsidian quick switch" },
      { "<leader>on", "<cmd>ObsidianNew<cr>", desc = "Obsidian new note" },
      { "<leader>os", "<cmd>ObsidianSearch<cr>", desc = "Obsidian search vault" },
      { "<leader>ot", "<cmd>ObsidianToday<cr>", desc = "Obsidian daily note" },
      { "<leader>oy", "<cmd>ObsidianYesterday<cr>", desc = "Obsidian yesterday note" },
      { "<leader>ob", "<cmd>ObsidianBacklinks<cr>", desc = "Obsidian backlinks" },
      { "<leader>ol", "<cmd>ObsidianLinks<cr>", desc = "Obsidian links" },
      { "<leader>oc", "<cmd>ObsidianTOC<cr>", desc = "Obsidian table of contents" },
      { "<leader>op", "<cmd>ObsidianPasteImg<cr>", desc = "Obsidian paste image" },
      { "<leader>od", "<cmd>ObsidianDailies<cr>", desc = "Obsidian list dailies" },
    },
    config = function(_, opts)
      require("obsidian").setup(opts)
    end,
  },
}

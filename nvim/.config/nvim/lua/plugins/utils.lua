-- ============================================================================
-- Utility Plugins
-- ============================================================================

return {
  -- Auto pairs
  {
    "windwp/nvim-autopairs",
    event = "InsertEnter",
    opts = {
      check_ts = true,
      ts_config = {
        lua = { "string" },
        javascript = { "template_string" },
      },
    },
  },

  -- Comments
  {
    "numToStr/Comment.nvim",
    keys = {
      { "gcc", mode = "n", desc = "Comment toggle current line" },
      { "gc", mode = { "n", "o" }, desc = "Comment toggle linewise" },
      { "gc", mode = "x", desc = "Comment toggle linewise (visual)" },
      { "gbc", mode = "n", desc = "Comment toggle current block" },
      { "gb", mode = { "n", "o" }, desc = "Comment toggle blockwise" },
      { "gb", mode = "x", desc = "Comment toggle blockwise (visual)" },
    },
    config = function()
      require("Comment").setup()
    end,
  },

  -- Surround
  {
    "kylechui/nvim-surround",
    version = "*",
    event = "VeryLazy",
    config = function()
      require("nvim-surround").setup({})
    end,
  },

  -- Better text objects
  {
    "echasnovski/mini.ai",
    version = false,
    config = function()
      require("mini.ai").setup()
    end,
  },

  -- Session management
  {
    "folke/persistence.nvim",
    event = "BufReadPre",
    opts = {},
    keys = {
      {
        "<leader>qs",
        function()
          require("persistence").load()
        end,
        desc = "Restore Session",
      },
      {
        "<leader>ql",
        function()
          require("persistence").load({ last = true })
        end,
        desc = "Restore Last Session",
      },
      {
        "<leader>qd",
        function()
          require("persistence").stop()
        end,
        desc = "Don't Save Current Session",
      },
    },
  },

  -- OpenCode client (experimental; alongside CodeCompanion)
  {
    "NickvanDyke/opencode.nvim",
    event = "VeryLazy",
    dependencies = {
      { "folke/snacks.nvim", opts = { input = {}, picker = {}, terminal = {} } },
    },
    config = function()
      -- Opcional: ajusta opts via `vim.g.opencode_opts` antes de cargar el plugin.
      -- Ejemplo: vim.g.opencode_opts = { provider = { enabled = "tmux" } }
      vim.o.autoread = true

      local map = vim.keymap.set
      local opts = { silent = true, noremap = true }
      -- Prefijo <leader>a* (reemplaza al antiguo CodeCompanion)
      map({ "n", "v" }, "<leader>aa", function()
        require("opencode").ask("@this: ", { submit = true })
      end, vim.tbl_extend("force", opts, { desc = "OpenCode Ask (selection/cursor)" }))
      map({ "n", "v" }, "<leader>ai", function()
        require("opencode").select()
      end, vim.tbl_extend("force", opts, { desc = "OpenCode Select Action" }))
      map({ "n", "t" }, "<leader>at", function()
        require("opencode").toggle()
      end, vim.tbl_extend("force", opts, { desc = "OpenCode Toggle UI" }))
    end,
  },

  -- Terminal
  {
    "akinsho/toggleterm.nvim",
    version = "*",
    event = "VeryLazy",
    opts = {
      size = 20,
      open_mapping = [[<c-\>]],
      hide_numbers = true,
      shade_terminals = true,
      start_in_insert = true,
      insert_mappings = true,
      persist_size = true,
      direction = "horizontal",
      close_on_exit = true,
      shell = vim.o.shell,
      float_opts = {
        border = "curved",
        winblend = 0,
      },
    },
    keys = {
      { "<leader>tf", "<cmd>ToggleTerm direction=float<cr>", desc = "Float Terminal" },
      { "<leader>th", "<cmd>ToggleTerm size=10 direction=horizontal<cr>", desc = "Horizontal Terminal" },
      { "<leader>tv", "<cmd>ToggleTerm size=80 direction=vertical<cr>", desc = "Vertical Terminal" },
    },
    config = function(_, opts)
      require("toggleterm").setup(opts)

      -- Simple REPL senders for Python (ipython) and R (radian/R) using toggleterm
      local Terminal = require("toggleterm.terminal").Terminal
      local r_cmd = vim.fn.executable("radian") == 1 and "radian" or "R --no-save"
      local py_cmd = vim.fn.executable("ipython") == 1 and "ipython" or "python3 -i"

      -- Reuse the same terminal instance per language
      local ipy_term = Terminal:new({
        cmd = py_cmd,
        hidden = true,
        direction = "horizontal",
        close_on_exit = false,
        count = 71, -- fixed id to avoid spawning multiple
      })

      local r_term = Terminal:new({
        cmd = r_cmd,
        hidden = true,
        direction = "horizontal",
        close_on_exit = false,
        count = 72, -- fixed id to avoid spawning multiple
      })

      local function send_to_term(term, lines, use_bracketed)
        if not lines or #lines == 0 then
          return
        end
        local prev_win = vim.api.nvim_get_current_win()
        if not term:is_open() then
          term:open()
        elseif term.window and vim.api.nvim_win_is_valid(term.window) then
          vim.fn.win_gotoid(term.window)
        end
        -- Trim trailing empty lines to avoid extra blank prompts in REPLs
        while #lines > 0 and lines[#lines]:match("^%s*$") do
          table.remove(lines, #lines)
        end

        local payload = table.concat(lines, "\n")
        payload = payload:gsub("\n+$", "")
        if use_bracketed then
          -- Bracketed paste with trailing newline to execute
          term:send("\x1b[200~" .. payload .. "\x1b[201~\n")
        else
          -- Plain send for REPLs that don't like bracketed paste (e.g., radian)
          term:send(payload .. "\n")
        end
        if prev_win and vim.api.nvim_win_is_valid(prev_win) and prev_win ~= term.window then
          vim.fn.win_gotoid(prev_win)
          local esc = vim.api.nvim_replace_termcodes("<Esc>", true, false, true)
          vim.api.nvim_feedkeys(esc, "n", false)
        end
      end

      local function visual_lines()
        local mode = vim.fn.mode()
        if mode ~= "v" and mode ~= "V" and mode ~= "\22" then
          return nil
        end
        local start_line = vim.fn.getpos("v")[2]
        local end_line = vim.fn.getpos(".")[2]
        if start_line > end_line then
          start_line, end_line = end_line, start_line
        end
        return vim.fn.getline(start_line, end_line)
      end

      local function indent_level(str)
        return #(str:match("^%s*") or "")
      end

      local function collect_block(start_line, total_lines)
        local base_indent = indent_level(vim.fn.getline(start_line))
        local last = start_line
        for i = start_line + 1, total_lines do
          local l = vim.fn.getline(i)
          if l:match("^%s*$") then
            last = i
          else
            local ind = indent_level(l)
            if ind <= base_indent then
              break
            end
            last = i
          end
        end
        return vim.fn.getline(start_line, last)
      end

      local function block_or_line(ft)
        local bufnr = vim.api.nvim_get_current_buf()
        local total = vim.api.nvim_buf_line_count(bufnr)
        local cur = vim.api.nvim_win_get_cursor(0)[1]
        local line = vim.fn.getline(cur)

        if ft == "python" then
          if line:match("^%s*def%s+") or line:match("^%s*class%s+") or line:match("^%s*for%s+") or line:match("^%s*while%s+") or line:match("^%s*if%s+") or line:match("^%s*elif%s+") or line:match("^%s*else%s*:") or line:match("^%s*try%s*:") or line:match("^%s*except%s+") or line:match("^%s*with%s+") then
            return collect_block(cur, total)
          end
        elseif ft == "r" then
          if line:match("^%s*[%w_%.]+%s*<?-?%s*function%s*%(") or line:match("^%s*if%s*%(") or line:match("^%s*for%s*%(") or line:match("^%s*while%s*%(") then
            return collect_block(cur, total)
          end
        end

        return { line }
      end

      local function map_repl(ft, lhs, term, desc, use_bracketed)
        vim.api.nvim_create_autocmd("FileType", {
          pattern = ft,
          callback = function(event)
            local opts_local = { buffer = event.buf, silent = true, desc = desc }
            vim.keymap.set({ "n", "v" }, lhs, function()
              local lines = visual_lines() or block_or_line(ft)
              send_to_term(term, lines, use_bracketed)
            end, opts_local)
          end,
        })
      end

      -- Shift+Enter in terminals/tmux may not be distinguishable; add fallback with <leader><CR>
      map_repl("python", "<S-CR>", ipy_term, "Send to ipython REPL", true)
      map_repl("python", "<leader><CR>", ipy_term, "Send to ipython REPL (fallback)", true)
      map_repl("r", "<C-CR>", r_term, "Send to R REPL", false)
      map_repl("r", "<leader><CR>", r_term, "Send to R REPL (fallback)", false)

      -- Quarto/Markdown fences: choose REPL by fence language and send fence/block/selection
      local function find_fence_at_cursor()
        local bufnr = vim.api.nvim_get_current_buf()
        local total = vim.api.nvim_buf_line_count(bufnr)
        local cur = vim.api.nvim_win_get_cursor(0)[1]
        local start_fence, end_fence, lang = nil, nil, nil
        for i = cur, 1, -1 do
          local l = vim.fn.getline(i)
          local m = l:match("^%s*```%s*{?(%w+)")
          if m then
            start_fence = i
            lang = m:lower()
            break
          end
          if l:match("^%s*```%s*$") then
            start_fence = i
            lang = nil
            break
          end
        end
        if not start_fence then
          return nil
        end
        for j = start_fence + 1, total do
          local l = vim.fn.getline(j)
          if l:match("^%s*```") then
            end_fence = j
            break
          end
        end
        if not end_fence then
          return nil
        end
        if cur < start_fence or cur > end_fence then
          return nil
        end
        local s = start_fence + 1
        local e = end_fence - 1
        -- trim blank lines inside fence
        while s <= e and vim.fn.getline(s):match("^%s*$") do
          s = s + 1
        end
        while e >= s and vim.fn.getline(e):match("^%s*$") do
          e = e - 1
        end
        return { lang = lang, start = s, finish = e }
      end

      local function map_quarto(lhs)
        vim.api.nvim_create_autocmd("FileType", {
          pattern = { "quarto", "markdown" },
          callback = function(event)
            local opts_local = { buffer = event.buf, silent = true, desc = "Send to REPL (quarto smart)" }
            vim.keymap.set({ "n", "v" }, lhs, function()
              local fence = find_fence_at_cursor()
              local lines = visual_lines()
              local target_term = ipy_term
              local use_bracket = true

              if fence then
                if not lines then
                  lines = vim.fn.getline(fence.start, fence.finish)
                end
                if fence.lang and fence.lang:match("r") then
                  target_term = r_term
                  use_bracket = false
                else
                  target_term = ipy_term
                  use_bracket = true
                end
              else
                -- Fallback: no fence, use selection or block/line based on buffer ft
                if not lines then
                  lines = block_or_line("python")
                end
              end

              send_to_term(target_term, lines, use_bracket)
            end, opts_local)
          end,
        })
      end

      map_quarto("<leader><CR>")
    end,
  },

  -- Markdown preview
  {
    "iamcco/markdown-preview.nvim",
    cmd = { "MarkdownPreviewToggle", "MarkdownPreview", "MarkdownPreviewStop" },
    ft = { "markdown" },
    build = "cd app && npm install",
    init = function()
      vim.g.mkdp_filetypes = { "markdown" }
    end,
    keys = {
      {
        "<leader>mp",
        "<cmd>MarkdownPreviewToggle<cr>",
        desc = "Markdown Preview",
      },
    },
  },

  -- Better folding
  {
    "kevinhwang91/nvim-ufo",
    dependencies = "kevinhwang91/promise-async",
    event = "BufRead",
    opts = {
      provider_selector = function()
        return { "treesitter", "indent" }
      end,
    },
    config = function(_, opts)
      require("ufo").setup(opts)
      vim.o.foldcolumn = "1"
      vim.o.foldlevel = 99
      vim.o.foldlevelstart = 99
      vim.o.foldenable = true
    end,
    keys = {
      { "zR", function() require("ufo").openAllFolds() end, desc = "Open all folds" },
      { "zM", function() require("ufo").closeAllFolds() end, desc = "Close all folds" },
    },
  },
}

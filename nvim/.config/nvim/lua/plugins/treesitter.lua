-- ============================================================================
-- Treesitter Configuration - Syntax Highlighting
-- ============================================================================
--
-- API de la rama `main` de nvim-treesitter (Neovim >= 0.12).
-- `require("nvim-treesitter.configs")` no existe en esta rama; se usa:
--   · require("nvim-treesitter").install({...})  — instalación asíncrona
--   · vim.treesitter.start()                     — resaltado por FileType
--   · require("nvim-treesitter-textobjects")     — setup independiente
--
-- D1 (indentación): NO activada — queda la indentación nativa de Neovim.
-- D2 (parsers bundled): incluidos todos en install() para que parser y
--   queries salgan de la misma fuente y versión.

return {
  {
    "nvim-treesitter/nvim-treesitter",
    -- `main` explícito, no implícito. Lazy resuelve la rama por defecto
    -- preguntando al clon local, cuyo symref origin/HEAD queda cacheado del día
    -- que se clonó: en una máquina que ya tuvo el plugin, ese símbolo sigue
    -- apuntando a `master` y el update se queda ahí. `master` está congelado
    -- upstream y no soporta Neovim >= 0.11.
    branch = "main",
    lazy = false,
    build = ":TSUpdate",
    dependencies = {
      {
        "nvim-treesitter/nvim-treesitter-textobjects",
        branch = "main",
        -- OJO: no_plugin_maps no desactiva keymaps de este plugin — textobjects
        -- `main` no registra ninguno. Desactiva los de los ftplugin que trae
        -- Neovim, para todos los filetypes, y así evitar choques con los
        -- textobjects que se registran abajo. Es la receta del README de
        -- upstream, pero el alcance es global: si echas de menos algún atajo
        -- de ftplugin, empieza mirando aquí.
        init = function()
          vim.g.no_plugin_maps = true
        end,
      },
    },
    config = function()
      -- ------------------------------------------------------------------
      -- 1. Instalación asíncrona de parsers
      --    Los parsers bundled con Neovim (c, lua, markdown, markdown_inline,
      --    query, vim, vimdoc) se reinstalan igualmente para que parser y
      --    queries vengan de la misma versión del plugin (D2).
      -- ------------------------------------------------------------------
      require("nvim-treesitter").install({
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
      })

      -- ------------------------------------------------------------------
      -- 2. Resaltado: activar vim.treesitter.start() por FileType
      --    pcall obligatorio: start() usa assert() internamente y lanza
      --    error si el parser no está disponible todavía. Sin pcall, Neovim
      --    llena :messages de errores mientras los parsers compilan.
      --
      --    Notas de mapeo filetype → parser:
      --      · "sh"   → parser "bash"  (scripts con shebang sin filetype bash)
      --      · "help" → parser "vimdoc"
      --      · "tex"  → parser "latex"
      --      · "markdown_inline" no tiene filetype propio; se activa vía
      --        inyecciones desde el parser "markdown", no va aquí.
      -- ------------------------------------------------------------------
      vim.api.nvim_create_autocmd("FileType", {
        pattern = {
          "python", "r",
          "lua", "vim", "help",
          "bash", "sh",
          "sql", "json", "yaml", "toml",
          "html", "css", "tex",
          "markdown",
        },
        callback = function()
          local ok, err = pcall(vim.treesitter.start)
          if not ok then
            -- Parser no instalado aún; el resaltado regex queda activo
            vim.notify(err, vim.log.levels.DEBUG)
          end
        end,
      })

      -- ------------------------------------------------------------------
      -- 3. textobjects: setup independiente
      --    No va dentro de nvim-treesitter.configs; es una llamada propia.
      -- ------------------------------------------------------------------
      require("nvim-treesitter-textobjects").setup({
        select = { lookahead = true },
        move   = { set_jumps = true },
      })

      -- ------------------------------------------------------------------
      -- 4. textobjects: keymaps de selección (modos x y o)
      --    Las seis capturas (@function/@class/@block, outer e inner) están
      --    comprobadas en la rama main. El movimiento (sección 5) solo cubre
      --    función y clase: saltar de bloque en bloque no aporta gran cosa.
      -- ------------------------------------------------------------------
      local ts_select = require("nvim-treesitter-textobjects.select")
      for _, map in ipairs({
        { "af", "@function.outer" }, { "if", "@function.inner" },
        { "ac", "@class.outer"   }, { "ic", "@class.inner"    },
        { "ab", "@block.outer"   }, { "ib", "@block.inner"    },
      }) do
        vim.keymap.set({ "x", "o" }, map[1], function()
          ts_select.select_textobject(map[2], "textobjects")
        end, { desc = "treesitter: " .. map[2] })
      end

      -- ------------------------------------------------------------------
      -- 5. textobjects: keymaps de movimiento (modos n, x y o)
      -- ------------------------------------------------------------------
      local ts_move = require("nvim-treesitter-textobjects.move")
      local move_maps = {
        { "]f", "goto_next_start",     "@function.outer" },
        { "]F", "goto_next_end",       "@function.outer" },
        { "]c", "goto_next_start",     "@class.outer"    },
        { "]C", "goto_next_end",       "@class.outer"    },
        { "[f", "goto_previous_start", "@function.outer" },
        { "[F", "goto_previous_end",   "@function.outer" },
        { "[c", "goto_previous_start", "@class.outer"    },
        { "[C", "goto_previous_end",   "@class.outer"    },
      }
      for _, map in ipairs(move_maps) do
        vim.keymap.set({ "n", "x", "o" }, map[1], function()
          ts_move[map[2]](map[3], "textobjects")
        end, { desc = "treesitter: " .. map[2] .. " " .. map[3] })
      end
    end,
  },
}

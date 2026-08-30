--- mesh_review — Plugin de Neovim para mesh-review
---
--- Punto de entrada del plugin. setup() resuelve el CLI, registra los keymaps
--- globales y los comandos de usuario.
---
--- Keymaps registrados:
---   <leader>rp (n) → abrir panel del fichero actual
---   <leader>ro (v) → abrir hilo en la selección visual
---   <leader>rs (n) → enviar prompt a scribe (solo si HERDR_ENV=1)
---
--- Comandos registrados:
---   :MeshPanel               → igual que <leader>rp
---   :MeshRetract <tid> <mid> [reason]  → retractar un mensaje

local M = {}

local cli    = require("mesh_review.cli")
local anchor = require("mesh_review.anchor")
local panel  = require("mesh_review.panel")
local utf    = require("mesh_review.utf")

--- Evita registrar los keymaps y comandos más de una vez.
local _setup_done = false

--- Obtiene la ruta absoluta del documento sobre el que operar. Devuelve nil si el
--- buffer actual no corresponde a ningún fichero.
---
--- Si el buffer actual ES el panel, devuelve el documento que lo originó. Sin
--- esto, pulsar el atajo del panel estando dentro del panel tomaría su nombre
--- ("mesh-review://<ruta>") por un documento, lo volvería a prefijar y acabaría
--- pidiendo los hilos de una ruta inexistente: el panel se vaciaba.
local function _current_doc()
  if panel.is_panel(0) then
    return panel.source_doc()
  end
  local name = vim.api.nvim_buf_get_name(0)
  if name == "" then return nil end
  return name
end

--- Abre el panel del fichero actual y refresca los extmarks.
function M.show_panel()
  local doc = _current_doc()
  if not doc then
    vim.notify("[mesh-review] El buffer no tiene nombre de fichero", vim.log.levels.WARN)
    return
  end
  local bufnr = vim.api.nvim_get_current_buf()
  anchor.refresh(bufnr)
  panel.open(doc)
end

--- Abre un hilo en la selección visual actual.
--- Se llama desde el keymap <leader>ro (modo v).
--- Las marcas '< y '> ya están guardadas cuando se ejecuta la función.
function M.open_thread()
  local bufnr = vim.api.nvim_get_current_buf()
  local doc   = vim.api.nvim_buf_get_name(bufnr)
  if doc == "" then
    vim.notify("[mesh-review] El buffer no tiene nombre de fichero", vim.log.levels.WARN)
    return
  end

  -- Leer posiciones de la selección visual.
  -- getpos devuelve { bufnum, lnum (1-indexed), col (1-indexed bytes), offset }.
  local pos_start = vim.fn.getpos("'<")
  local pos_end   = vim.fn.getpos("'>")

  local start_row = pos_start[2] - 1  -- 0-indexed
  local start_col = pos_start[3] - 1  -- 0-indexed bytes
  local end_row   = pos_end[2] - 1
  local end_col   = pos_end[3] - 1    -- primer byte del último carácter seleccionado

  -- Calcular offsets UTF-16.
  -- end_col + 1 avanza un byte más allá del primer byte del último carácter.
  -- utf.to_utf16 acota col al rango válido y str_utfindex redondea al límite de
  -- carácter, dando el offset exclusivo correcto.
  local offset     = utf.to_utf16(bufnr, start_row, start_col)
  local end_offset = utf.to_utf16(bufnr, end_row, end_col + 1)

  -- Pedir tipo de comentario.
  vim.ui.input({ prompt = "Tipo (nota/duda/sugerencia): " }, function(ctype)
    if not ctype or ctype == "" then ctype = "nota" end

    -- Pedir cuerpo del comentario.
    vim.ui.input({ prompt = "Comentario: " }, function(body)
      if not body or body == "" then
        vim.notify("[mesh-review] Comentario cancelado", vim.log.levels.INFO)
        return
      end

      local thread_id, err = cli.open(doc, offset, end_offset, ctype, body)
      if err then
        vim.notify("[mesh-review] open: " .. err, vim.log.levels.ERROR)
        return
      end

      -- Refrescar extmarks y notificar.
      anchor.refresh(bufnr)
      vim.notify("[mesh-review] Hilo creado: " .. (thread_id or "?"), vim.log.levels.INFO)
    end)
  end)
end

--- Envía un prompt a scribe vía herdr.
--- Solo actúa si HERDR_ENV=1; en caso contrario avisa.
--- El argumento del prompt pasa como argv separado, sin interpolación de shell.
function M.prompt_scribe()
  if vim.env.HERDR_ENV ~= "1" then
    vim.notify("[mesh-review] HERDR_ENV no está activo", vim.log.levels.WARN)
    return
  end
  local doc = _current_doc() or ""
  -- Forma de lista: la concatenación arma el texto del prompt en Lua y herdr lo
  -- recibe como UN solo argumento de argv. No pasa por el shell, así que una ruta
  -- con espacios o comillas viaja intacta y no hay inyección posible.
  vim.system({ "herdr", "agent", "prompt", "scribe", "Revisa " .. doc },
    { text = true },
    function(result)
      if result.code ~= 0 then
        vim.schedule(function()
          vim.notify("[mesh-review] herdr: " .. (result.stderr or "error"),
            vim.log.levels.WARN)
        end)
      end
    end)
end

--- Inicializa el plugin.
---
--- @param opts table|nil  Opciones:
---   opts.cli  string  Ruta explícita al bundle mesh-review.mjs (opcional).
function M.setup(opts)
  if _setup_done then return end
  opts = opts or {}

  -- Resolver la ruta al bundle del CLI.
  local found = cli.init_cli(opts.cli)
  if not found or not cli.check_binary() then
    vim.notify(
      "[mesh-review] CLI no encontrado. "
      .. "Pasa la ruta en setup({ cli = '…' }) o define MESH_REVIEW_CLI.",
      vim.log.levels.WARN
    )
    -- Sin CLI no registramos keymaps ni comandos; el plugin queda inactivo.
    return
  end

  -- Registrar grupo which-key para el prefijo <leader>r.
  -- El bloque pcall evita error si which-key no está cargado todavía.
  pcall(function()
    local wk = require("which-key")
    wk.add({ { "<leader>r", group = "mesh-review" } })
  end)

  -- Keymaps globales.
  vim.keymap.set("n", "<leader>rp", M.show_panel,   { desc = "Panel mesh-review" })
  vim.keymap.set("v", "<leader>ro", M.open_thread,   { desc = "Abrir hilo en selección" })
  vim.keymap.set("n", "<leader>rs", M.prompt_scribe, { desc = "Prompt a scribe" })

  -- Comandos de usuario.
  vim.api.nvim_create_user_command("MeshPanel", function()
    M.show_panel()
  end, { desc = "Abrir panel de mesh-review" })

  vim.api.nvim_create_user_command("MeshRetract", function(cmd_opts)
    local args = vim.split(cmd_opts.args, "%s+", { trimempty = true })
    if #args < 2 then
      vim.notify(":MeshRetract <thread_id> <msg_id> [reason]", vim.log.levels.ERROR)
      return
    end
    local thread_id = args[1]
    local msg_id    = args[2]
    -- La razón puede contener espacios: reunir los fragmentos restantes.
    local reason = nil
    if #args >= 3 then
      reason = table.concat(args, " ", 3)
    end
    local doc = _current_doc()
    if not doc then
      vim.notify("[mesh-review] El buffer no tiene nombre de fichero", vim.log.levels.ERROR)
      return
    end
    local event_id, err = cli.retract(doc, thread_id, msg_id, reason)
    if err then
      vim.notify("[mesh-review] retract: " .. err, vim.log.levels.ERROR)
    else
      vim.notify("[mesh-review] Retractado: " .. (event_id or "?"), vim.log.levels.INFO)
    end
  end, {
    nargs = "+",
    desc  = "Retractar un mensaje de hilo",
  })

  -- Registrar un autocmd global para inicializar extmarks en cada buffer que
  -- tenga un fichero real (BufReadPost cubre tanto la apertura inicial como
  -- los buffers ya cargados cuando el plugin arranca).
  local aug = vim.api.nvim_create_augroup("MeshReviewInit", { clear = true })
  vim.api.nvim_create_autocmd("BufReadPost", {
    group    = aug,
    pattern  = "*",
    callback = function(ev)
      local name = vim.api.nvim_buf_get_name(ev.buf)
      -- Solo ficheros reales (no buffers especiales ni el panel).
      if name == "" or name:match("^mesh%-review://") then return end
      anchor.setup(ev.buf)
    end,
  })

  -- Inicializar el buffer activo en este momento si tiene nombre.
  local bufnr = vim.api.nvim_get_current_buf()
  local name  = vim.api.nvim_buf_get_name(bufnr)
  if name ~= "" and not name:match("^mesh%-review://") then
    anchor.setup(bufnr)
  end

  _setup_done = true
end

return M

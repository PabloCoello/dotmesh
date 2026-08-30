--- mesh_review.panel — Buffer de solo lectura con los hilos de revisión
---
--- El panel usa el nombre de buffer "mesh-review://<ruta_del_doc>" para que
--- no colisione con otros buffers. Si ya existe, lo enfoca en lugar de crear uno nuevo.
---
--- Formato de cada hilo (D9 del spec):
---
---   [open] 3f4a… (nota · human:pablo · 2026-08-30)
---     "<texto de la cita>"
---     ────────────────────
---     [human:pablo] Cuerpo del primer mensaje.
---     [ai:claude-sonnet-4-6] Respuesta del agente.
---   ══════════════════════════════════════════════
---
--- Los hilos resueltos se omiten (solo status=="open").

local M = {}

--- Estado del panel (singleton: solo un panel abierto a la vez).
local _state = {
  bufnr        = nil,  -- número de buffer del panel
  winid        = nil,  -- ventana del panel
  source_bufnr = nil,  -- buffer fuente desde el que se abrió
  source_doc   = nil,  -- ruta del documento fuente
  line_to_thread = {},  -- { [lnum_0indexed] = thread_id }
}

local SEPARATOR_THREAD = string.rep("═", 46)
local SEPARATOR_HDR    = string.rep("─", 20)

--- Devuelve el thread_id del hilo cuyo bloque contiene la línea actual del cursor.
--- Busca hacia atrás desde el cursor la última línea registrada en _line_to_thread.
---
--- @return string|nil
function M.thread_at_cursor()
  if _state.bufnr == nil then return nil end
  local cursor_row = vim.api.nvim_win_get_cursor(0)[1] - 1  -- 0-indexed

  -- Buscar la línea de encabezado más cercana por encima del cursor.
  local best_tid  = nil
  local best_line = -1
  for lnum, tid in pairs(_state.line_to_thread) do
    if lnum <= cursor_row and lnum > best_line then
      best_line = lnum
      best_tid  = tid
    end
  end
  return best_tid
end

--- Formatea una fecha ISO 8601 reducida a "AAAA-MM-DD".
---
--- @param iso string  Fecha en formato ISO.
--- @return string
local function _fmt_date(iso)
  if not iso then return "?" end
  return iso:sub(1, 10)
end

--- Formatea el autor como "kind:name".
---
--- @param author table  { kind, name }
--- @return string
local function _fmt_author(author)
  if not author then return "?" end
  local kind = author.kind or "?"
  local name = author.name or "?"
  return kind .. ":" .. name
end

--- Construye las líneas del panel y el mapa lnum→thread_id.
--- Devuelve { lines = string[], highlights = { {group, lnum, col_s, col_e} }[] }.
---
--- @param threads table  Array de hilos (salida de cli.project).
--- @return string[], table, table  lines, highlights, line_to_thread
local function _build_content(threads)
  local lines         = {}
  local highlights    = {}
  local line_to_thread = {}

  -- Filtrar solo hilos abiertos y ordenar por openedAt.
  local open_threads = {}
  for _, t in ipairs(threads) do
    if t.status == "open" then
      table.insert(open_threads, t)
    end
  end
  table.sort(open_threads, function(a, b)
    return (a.openedAt or "") < (b.openedAt or "")
  end)

  if #open_threads == 0 then
    lines[1] = "  Sin hilos abiertos."
    return lines, highlights, line_to_thread
  end

  for _, thread in ipairs(open_threads) do
    local tid_short = (thread.thread_id or "?"):sub(1, 8) .. "…"
    local ctype     = thread.commentType or "?"
    local author    = _fmt_author(thread.openedBy)
    local date      = _fmt_date(thread.openedAt)
    local quote     = (thread.anchor and thread.anchor.quote) or ""

    -- Línea de encabezado: [open] <tid_short> (tipo · autor · fecha)
    local hdr_lnum = #lines  -- 0-indexed
    local hdr = string.format("[open] %s (%s · %s · %s)", tid_short, ctype, author, date)
    table.insert(lines, hdr)
    line_to_thread[hdr_lnum] = thread.thread_id

    -- Highlight: "Identifier" para "[open]" y "Comment" para el resto del encabezado.
    table.insert(highlights, { "Identifier", hdr_lnum, 0, 6 })
    table.insert(highlights, { "Comment", hdr_lnum, 7, #hdr })

    -- Cita (si existe).
    if quote ~= "" then
      local quote_line = '  "' .. quote .. '"'
      table.insert(lines, quote_line)
      table.insert(highlights, { "String", #lines - 1, 0, #quote_line })
    end

    -- Separador de cita/mensajes.
    table.insert(lines, "  " .. SEPARATOR_HDR)
    table.insert(highlights, { "Comment", #lines - 1, 0, -1 })

    -- Mensajes del hilo.
    for _, msg in ipairs(thread.messages or {}) do
      if not msg.retracted then
        local msg_author = _fmt_author(msg.author)
        local prefix     = "  [" .. msg_author .. "] "
        local body_line  = prefix .. (msg.body or "")
        table.insert(lines, body_line)
        -- Author en "Comment", body en "Normal" (sin highlight adicional).
        table.insert(highlights, { "Comment", #lines - 1, 0, #prefix })
      end
    end

    -- Separador entre hilos.
    table.insert(lines, SEPARATOR_THREAD)
    table.insert(highlights, { "Comment", #lines - 1, 0, -1 })
  end

  return lines, highlights, line_to_thread
end

--- Aplica highlights a un buffer ya escrito.
---
--- @param bufnr      number   Buffer.
--- @param highlights table    Array de { group, lnum, col_s, col_e }.
local function _apply_highlights(bufnr, highlights)
  local ns = vim.api.nvim_create_namespace("mesh_review_panel")
  vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
  for _, hl in ipairs(highlights) do
    local group, lnum, col_s, col_e = hl[1], hl[2], hl[3], hl[4]
    if col_e == -1 then
      -- Hasta el final de la línea.
      local line = vim.api.nvim_buf_get_lines(bufnr, lnum, lnum + 1, false)[1] or ""
      col_e = #line
    end
    vim.api.nvim_buf_add_highlight(bufnr, ns, group, lnum, col_s, col_e)
  end
end

--- Registra los keymaps locales del panel (r, x, q, Esc).
--- Necesita saber el bufnr fuente y la ruta del documento para poder operar.
---
--- @param panel_bufnr  number  Buffer del panel.
--- @param source_bufnr number  Buffer del documento fuente.
--- @param doc          string  Ruta del documento fuente.
local function _register_keymaps(panel_bufnr, source_bufnr, doc)
  local cli    = require("mesh_review.cli")
  local anchor = require("mesh_review.anchor")

  local opts = { buffer = panel_bufnr, nowait = true, silent = true }

  -- q / Esc → cerrar panel.
  local function close_panel()
    M.close()
  end
  vim.keymap.set("n", "q",     close_panel, vim.tbl_extend("force", opts, { desc = "Cerrar panel" }))
  vim.keymap.set("n", "<Esc>", close_panel, vim.tbl_extend("force", opts, { desc = "Cerrar panel" }))

  -- r → responder al hilo bajo el cursor.
  vim.keymap.set("n", "r", function()
    local tid = M.thread_at_cursor()
    if not tid then
      vim.notify("[mesh-review] No hay hilo bajo el cursor", vim.log.levels.WARN)
      return
    end
    vim.ui.input({ prompt = "Respuesta: " }, function(body)
      if not body or body == "" then return end
      local _, err = cli.reply(doc, tid, body)
      if err then
        vim.notify("[mesh-review] reply: " .. err, vim.log.levels.ERROR)
        return
      end
      anchor.refresh(source_bufnr)
      -- Refrescar el panel.
      local threads, perr = cli.project(doc)
      if threads then
        M.render(panel_bufnr, threads)
      elseif perr then
        vim.notify("[mesh-review] project: " .. perr, vim.log.levels.WARN)
      end
    end)
  end, vim.tbl_extend("force", opts, { desc = "Responder al hilo" }))

  -- x → resolver el hilo bajo el cursor.
  vim.keymap.set("n", "x", function()
    local tid = M.thread_at_cursor()
    if not tid then
      vim.notify("[mesh-review] No hay hilo bajo el cursor", vim.log.levels.WARN)
      return
    end
    local _, err = cli.resolve(doc, tid)
    if err then
      vim.notify("[mesh-review] resolve: " .. err, vim.log.levels.ERROR)
      return
    end
    anchor.refresh(source_bufnr)
    -- Refrescar el panel.
    local threads, perr = cli.project(doc)
    if threads then
      M.render(panel_bufnr, threads)
    elseif perr then
      vim.notify("[mesh-review] project: " .. perr, vim.log.levels.WARN)
    end
  end, vim.tbl_extend("force", opts, { desc = "Resolver hilo" }))
end

--- Escribe el contenido del panel en el buffer dado.
--- Actualiza _state.line_to_thread.
---
--- @param bufnr   number  Buffer del panel.
--- @param threads table   Array de hilos (de cli.project).
function M.render(bufnr, threads)
  local lines, highlights, l2t = _build_content(threads)

  -- Desbloquear el buffer temporalmente para escribir.
  vim.api.nvim_buf_set_option(bufnr, "modifiable", true)
  vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
  vim.api.nvim_buf_set_option(bufnr, "modifiable", false)

  _apply_highlights(bufnr, highlights)
  _state.line_to_thread = l2t
end

--- Abre (o enfoca) el panel para el documento dado.
---
--- @param doc string  Ruta del documento fuente.
function M.open(doc)
  local source_bufnr = vim.api.nvim_get_current_buf()
  local buf_name     = "mesh-review://" .. doc

  -- Buscar si ya existe un buffer con ese nombre.
  local existing_bufnr = nil
  for _, bn in ipairs(vim.api.nvim_list_bufs()) do
    if vim.api.nvim_buf_get_name(bn) == buf_name then
      existing_bufnr = bn
      break
    end
  end

  local panel_bufnr

  -- Función auxiliar: abre una ventana para el buffer del panel.
  local function _open_window(bufnr)
    local height = math.max(10, math.floor(vim.o.lines * 0.30))
    vim.cmd("botright " .. height .. "split")
    local winid = vim.api.nvim_get_current_win()
    vim.api.nvim_win_set_buf(winid, bufnr)
    vim.api.nvim_win_set_option(winid, "number", false)
    vim.api.nvim_win_set_option(winid, "relativenumber", false)
    vim.api.nvim_win_set_option(winid, "signcolumn", "no")
    vim.api.nvim_win_set_option(winid, "wrap", false)
    _state.winid = winid
  end

  if existing_bufnr then
    panel_bufnr = existing_bufnr
    -- Enfocar la ventana existente si sigue abierta; reabrirla si no.
    if _state.winid and vim.api.nvim_win_is_valid(_state.winid) then
      vim.api.nvim_set_current_win(_state.winid)
    else
      -- La ventana fue cerrada externamente (p. ej. con q); reabrir.
      _open_window(panel_bufnr)
    end
  else
    -- Crear nuevo buffer.
    panel_bufnr = vim.api.nvim_create_buf(false, true)  -- unlisted, scratch
    vim.api.nvim_buf_set_name(panel_bufnr, buf_name)
    vim.api.nvim_buf_set_option(panel_bufnr, "filetype", "mesh-review")
    vim.api.nvim_buf_set_option(panel_bufnr, "buftype", "nofile")
    vim.api.nvim_buf_set_option(panel_bufnr, "swapfile", false)
    vim.api.nvim_buf_set_option(panel_bufnr, "modifiable", false)

    _open_window(panel_bufnr)
  end

  _state.bufnr        = panel_bufnr
  _state.source_bufnr = source_bufnr
  _state.source_doc   = doc

  -- Registrar keymaps del panel.
  _register_keymaps(panel_bufnr, source_bufnr, doc)

  -- Cargar y renderizar hilos.
  local cli = require("mesh_review.cli")
  local threads, err = cli.project(doc)
  if threads == nil then
    -- Fichero sin hilos: renderizar vacío.
    threads = {}
    if err and not err:match("ENOENT") and not err:match("no sidecar") then
      vim.notify("[mesh-review] project: " .. err, vim.log.levels.WARN)
    end
  end
  M.render(panel_bufnr, threads)
end

--- Cierra la ventana del panel si está abierta.
function M.close()
  if _state.winid and vim.api.nvim_win_is_valid(_state.winid) then
    vim.api.nvim_win_close(_state.winid, true)
  end
  _state.winid = nil
end

return M

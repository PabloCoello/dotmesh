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
---
--- APIs modernas usadas en este fichero:
---   vim.bo[bufnr].xxx    en lugar de nvim_buf_set_option (deprecada desde 0.10)
---   vim.wo[winid].xxx    en lugar de nvim_win_set_option (deprecada desde 0.10)
---   nvim_buf_set_extmark en lugar de nvim_buf_add_highlight (deprecada desde 0.10)

local M = {}

local types = require("mesh_review.types")

--- Estado del panel (singleton: solo un panel abierto a la vez).
--- Prefijo del nombre de los buffers del panel. Sirve para reconocerlos: el
--- panel es un buffer con nombre, y sin esto `<leader>rp` pulsado desde dentro
--- del propio panel lo tomaría por un documento y volvería a prefijarlo.
M.PANEL_PREFIX = "mesh-review://"

local _state = {
  bufnr        = nil,  -- número de buffer del panel
  winid        = nil,  -- ventana del panel
  source_bufnr = nil,  -- buffer fuente desde el que se abrió
  source_doc   = nil,  -- ruta del documento fuente
  line_to_thread = {},  -- { [lnum_0indexed] = thread_id }
}

local SEPARATOR_THREAD = string.rep("═", 46)
local SEPARATOR_HDR    = string.rep("─", 20)

-- ---------------------------------------------------------------------------
-- Geometría del panel
-- ---------------------------------------------------------------------------

--- Valores por defecto y límites de la ventana del panel.
---
--- `min_width` y `min_height` son mínimos nominales: por debajo de ellos el
--- panel no se lee. Ceden ante la pantalla —ver _clamp_size— porque un panel
--- más ancho que la mitad del terminal deja el documento inservible, y ese es
--- el problema peor de los dos.
local GEO_DEFAULTS = {
  position     = "right",
  width        = 60,
  min_width    = 30,
  min_height   = 5,
  height_ratio = 0.30,
  height_floor = 10,
}

--- Config efectiva fijada por configure(). nil = valores por defecto.
local _config = nil

--- Acota un tamaño pedido al intervalo [minimo, maximo].
---
--- Cuando la pantalla no da ni para el mínimo nominal (maximo < minimo), manda
--- la pantalla: el resultado es `maximo`, no `minimo`.
---
--- @param pedido number
--- @param minimo number
--- @param maximo number
--- @return number
local function _clamp_size(pedido, minimo, maximo)
  local lo = math.min(minimo, maximo)
  return math.max(lo, math.min(pedido, maximo))
end

--- Resuelve la geometría del panel a partir de la config y el tamaño de la UI.
---
--- Es pura: no abre ventanas, no lee vim.o y no notifica. Devuelve los avisos
--- en una lista para que los emita quien corresponda. Así el acotado se prueba
--- con pantallas simuladas, que en headless no coinciden con las del usuario.
---
--- @param cfg table|nil  { position, width, height }. nil usa la config guardada.
--- @param ui  table      { columns, lines } de la interfaz.
--- @return table          { position = "right"|"bottom", size = number }
--- @return string[]       Avisos de validación, vacío si la config es correcta.
function M._resolve_geometry(cfg, ui)
  cfg = cfg or _config or {}
  local avisos = {}

  local position = GEO_DEFAULTS.position
  if cfg.position ~= nil then
    if cfg.position == "right" or cfg.position == "bottom" then
      position = cfg.position
    else
      table.insert(avisos, string.format(
        "panel.position = %s no reconocido (right | bottom); se usa \"%s\"",
        vim.inspect(cfg.position), GEO_DEFAULTS.position))
    end
  end

  -- Cada posición mide en su eje: la lateral en columnas, la inferior en filas.
  -- La opción del otro eje se ignora en silencio: pasar `height` con el panel a
  -- la derecha no es un error, solo una opción que no aplica.
  local clave, por_defecto, minimo, disponible
  if position == "right" then
    clave       = "width"
    por_defecto = GEO_DEFAULTS.width
    minimo      = GEO_DEFAULTS.min_width
    disponible  = math.floor(ui.columns / 2)
  else
    clave       = "height"
    por_defecto = math.max(GEO_DEFAULTS.height_floor,
                           math.floor(ui.lines * GEO_DEFAULTS.height_ratio))
    minimo      = GEO_DEFAULTS.min_height
    disponible  = math.floor(ui.lines / 2)
  end

  local pedido = por_defecto
  local valor  = cfg[clave]
  if valor ~= nil then
    if type(valor) == "number" and valor >= 1 then
      -- Un valor fraccionario no es un error del usuario: se trunca callando.
      pedido = math.floor(valor)
    else
      table.insert(avisos, string.format(
        "panel.%s = %s no es un número >= 1; se usa %d",
        clave, vim.inspect(valor), por_defecto))
    end
  end

  return { position = position, size = _clamp_size(pedido, minimo, disponible) }, avisos
end

--- Fija la config del panel. La llama setup() con opts.panel.
---
--- Los avisos de validación se emiten aquí, al arrancar, y no al abrir el panel:
--- dependen solo de la config, no del tamaño de la pantalla, así que repetirlos
--- en cada apertura sería ruido.
---
--- @param opts table|nil  { position, width, height }. nil restaura los defaults.
function M.configure(opts)
  _config = opts
  if opts == nil then return end

  local _, avisos = M._resolve_geometry(opts, { columns = vim.o.columns, lines = vim.o.lines })
  for _, aviso in ipairs(avisos) do
    vim.notify("[mesh-review] " .. aviso, vim.log.levels.WARN)
  end
end

--- ¿Es este buffer el panel? Se usa para que los comandos que parten del buffer
--- actual sepan reconducirse al documento fuente.
---
--- @param bufnr number|nil  Buffer a comprobar (por defecto, el actual).
--- @return boolean
function M.is_panel(bufnr)
  bufnr = bufnr or vim.api.nvim_get_current_buf()
  if not vim.api.nvim_buf_is_valid(bufnr) then return false end
  return vim.api.nvim_buf_get_name(bufnr):sub(1, #M.PANEL_PREFIX) == M.PANEL_PREFIX
end

--- Documento que originó el panel abierto, o nil si no hay ninguno.
---
--- @return string|nil
function M.source_doc()
  return _state.source_doc
end

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
--- Parte un texto en líneas aptas para nvim_buf_set_lines, que rechaza cualquier
--- cadena con saltos de línea. Un cuerpo multilínea es normal: `mesh-review open
--- --body` acepta saltos de línea, así que llegan por la vía corriente, no solo
--- desde un sidecar manipulado. Sin esto, un único comentario de dos líneas
--- aborta el render del panel entero.
---
--- Los caracteres de control restantes (tabuladores, retornos de carro sueltos)
--- se sustituyen por espacios para no descuadrar las columnas.
---
--- @param texto string|nil
--- @return string[]  Al menos un elemento.
local function _split_lines(texto)
  local limpio = (texto or ""):gsub("\r\n", "\n"):gsub("[\r\t]", " ")
  limpio = limpio:gsub("%c", function(c) return c == "\n" and c or " " end)

  local partes = {}
  for trozo in (limpio .. "\n"):gmatch("([^\n]*)\n") do
    table.insert(partes, trozo)
  end
  if #partes == 0 then partes = { "" } end
  return partes
end

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

    -- La subcadena del tipo en el encabezado puede contener saltos (raro pero
    -- posible si el sidecar viene de una herramienta externa). Se limpia igual
    -- que el resto del texto para que la búsqueda de posición funcione.
    local ctype_clean = table.concat(_split_lines(ctype), " ")

    -- Línea de encabezado: [open] <tid_short> (tipo · autor · fecha)
    local hdr_lnum = #lines  -- 0-indexed
    local hdr = string.format("[open] %s (%s · %s · %s)", tid_short,
      ctype_clean,
      table.concat(_split_lines(author), " "),
      table.concat(_split_lines(date), " "))
    table.insert(lines, hdr)
    line_to_thread[hdr_lnum] = thread.thread_id

    -- Highlight: "Identifier" para "[open]" y "Comment" para el resto.
    table.insert(highlights, { "Identifier", hdr_lnum, 0, 6 })
    table.insert(highlights, { "Comment", hdr_lnum, 7, #hdr })

    -- Highlight del tipo dentro del encabezado: buscar la subcadena del tipo
    -- en el encabezado empezando desde la posición 8 (tras "[open] ").
    -- Esto permite que la etiqueta del tipo aparezca en su color específico
    -- mientras el resto del encabezado queda en "Comment".
    -- Se usa mark_hl (solo fg, color canónico) en lugar de hl (solo bg): en un
    -- buffer de texto el fondo tintado quedaría invisible sobre el fondo de Normal,
    -- mientras que el fg del tipo resalta la etiqueta exactamente como en VS Code.
    -- Tipo desconocido o no reconocido → grupo atenuado "MeshReviewDetached".
    local tipo_entry = types.by_label[ctype]
    local tipo_hl    = tipo_entry and tipo_entry.mark_hl or "MeshReviewDetached"
    if ctype_clean ~= "" then
      local tipo_s, tipo_e = string.find(hdr, ctype_clean, 8, true)
      if tipo_s then
        -- tipo_e es el índice del último byte (1-indexed); col_e es exclusivo.
        table.insert(highlights, { tipo_hl, hdr_lnum, tipo_s - 1, tipo_e })
      end
    end

    -- Cita (si existe).
    if quote ~= "" then
      -- La cita se colapsa a una línea: en una tarjeta de hilo interesa el
      -- fragmento anclado, no su maquetación.
      local quote_line = '  "' .. table.concat(_split_lines(quote), " ") .. '"'
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
        local cuerpo     = _split_lines(msg.body)

        -- Primera línea con el autor delante; las siguientes, indentadas hasta
        -- donde empieza el texto, para que el cuerpo se lea como un bloque.
        table.insert(lines, prefix .. cuerpo[1])
        table.insert(highlights, { "Comment", #lines - 1, 0, #prefix })

        local sangria = string.rep(" ", #prefix)
        for i = 2, #cuerpo do
          table.insert(lines, sangria .. cuerpo[i])
        end
      end
    end

    -- Separador entre hilos.
    table.insert(lines, SEPARATOR_THREAD)
    table.insert(highlights, { "Comment", #lines - 1, 0, -1 })
  end

  return lines, highlights, line_to_thread
end

--- Aplica highlights a un buffer ya escrito.
--- Usa nvim_buf_set_extmark (API moderna) en lugar de nvim_buf_add_highlight
--- (deprecada desde Neovim 0.10). Cada highlight es un extmark de rango sin
--- posición de cursor ni virt_text: solo hl_group sobre un intervalo de bytes.
---
--- @param bufnr      number   Buffer.
--- @param highlights table    Array de { group, lnum, col_s, col_e }.
local function _apply_highlights(bufnr, highlights)
  local ns = vim.api.nvim_create_namespace("mesh_review_panel")
  vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
  for _, hl in ipairs(highlights) do
    local group, lnum, col_s, col_e = hl[1], hl[2], hl[3], hl[4]
    if col_e == -1 then
      -- Hasta el final de la línea: calcular la longitud real en bytes.
      local line = vim.api.nvim_buf_get_lines(bufnr, lnum, lnum + 1, false)[1] or ""
      col_e = #line
    end
    vim.api.nvim_buf_set_extmark(bufnr, ns, lnum, col_s, {
      end_row  = lnum,
      end_col  = col_e,
      hl_group = group,
    })
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
  vim.bo[bufnr].modifiable = true
  vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
  vim.bo[bufnr].modifiable = false

  _apply_highlights(bufnr, highlights)
  _state.line_to_thread = l2t
end

--- Abre (o enfoca) el panel para el documento dado.
---
--- @param doc string  Ruta del documento fuente.
function M.open(doc)
  local source_bufnr = vim.api.nvim_get_current_buf()
  local buf_name     = M.PANEL_PREFIX .. doc

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
    local geo = M._resolve_geometry(nil, { columns = vim.o.columns, lines = vim.o.lines })
    -- botright ancla la ventana al borde de la pantalla, no a la ventana actual:
    -- el panel sale pegado al lateral derecho (o al fondo) aunque se abra desde
    -- un split cualquiera.
    if geo.position == "right" then
      vim.cmd("botright " .. geo.size .. "vsplit")
    else
      vim.cmd("botright " .. geo.size .. "split")
    end
    local winid = vim.api.nvim_get_current_win()
    vim.api.nvim_win_set_buf(winid, bufnr)
    vim.wo[winid].number         = false
    vim.wo[winid].relativenumber = false
    vim.wo[winid].signcolumn     = "no"
    vim.wo[winid].wrap           = false
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
    vim.bo[panel_bufnr].filetype  = "mesh-review"
    vim.bo[panel_bufnr].buftype   = "nofile"
    vim.bo[panel_bufnr].swapfile  = false
    vim.bo[panel_bufnr].modifiable = false

    _open_window(panel_bufnr)
  end

  _state.bufnr        = panel_bufnr
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

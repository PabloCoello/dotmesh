--- mesh_review.panel — Buffer de solo lectura con los hilos de revisión
---
--- El panel usa el nombre de buffer "mesh-review://<ruta_del_doc>" para que
--- no colisione con otros buffers. Si ya existe, lo enfoca en lugar de crear uno nuevo.
---
--- Cada hilo abierto se dibuja como una caja cerrada enmarcada en el color de su
--- tipo (los hilos resueltos se omiten):
---
---   ┌ nota · pablo · hoy ──────────────────────┐
---   │ "<texto de la cita>"                     │
---   │                                          │
---   │  pablo                                   │
---   │  Cuerpo del primer mensaje.              │
---   │                                          │
---   │  claude-opus-5                           │
---   │  Respuesta del agente.                   │
---   └──────────────────────────────────────────┘
---
--- El borde solo cuadra si todas las líneas miden lo mismo EN CELDAS, no en
--- bytes; de ahí que el wrap y el relleno vivan en mesh_review.box y no aquí.
--- Por el mismo motivo la ventana va con wrap=false: si plegara las líneas,
--- lo haría por fuera del marco.
---
--- APIs modernas usadas en este fichero:
---   vim.bo[bufnr].xxx    en lugar de nvim_buf_set_option (deprecada desde 0.10)
---   vim.wo[winid].xxx    en lugar de nvim_win_set_option (deprecada desde 0.10)
---   nvim_buf_set_extmark en lugar de nvim_buf_add_highlight (deprecada desde 0.10)

local M = {}

local types = require("mesh_review.types")
local box   = require("mesh_review.box")

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
  threads      = {},   -- últimos hilos renderizados, para recomponer sin CLI
  ancho        = nil,  -- ancho en celdas del último render
}

--- Grupo de autocomandos del panel. Uno solo, con clear, para que reabrir el
--- panel no acumule vigilantes de redimensionado.
local AUGROUP = vim.api.nvim_create_augroup("MeshReviewPanel", { clear = true })

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

--- Días de calendario entre una fecha ISO y un instante de referencia.
---
--- Ambas se normalizan al mediodía para que un cambio de horario de verano no
--- desplace la cuenta un día entero.
---
--- @param iso   string  Fecha ISO 8601.
--- @param ahora number|nil  Timestamp de referencia (por defecto, os.time()).
--- @return number|nil  Días transcurridos, o nil si la fecha no es reconocible.
local function _dias_desde(iso, ahora)
  local y, m, d = iso:match("^(%d%d%d%d)-(%d%d)-(%d%d)")
  if not y then return nil end

  local entonces = os.time({ year = tonumber(y), month = tonumber(m), day = tonumber(d), hour = 12 })
  local hoy      = os.date("*t", ahora or os.time())
  local referencia = os.time({ year = hoy.year, month = hoy.month, day = hoy.day, hour = 12 })
  if not entonces or not referencia then return nil end

  return math.floor((referencia - entonces) / 86400 + 0.5)
end

--- Formatea una fecha ISO 8601 en forma relativa corta.
---
--- Dentro de la semana la distancia es lo que se quiere saber («ayer», «hace 3
--- d»); más allá deja de decir nada útil y manda la fecha. Una fecha futura
--- —reloj desajustado, sidecar de otra máquina— también cae a la fecha, porque
--- «hace -2 d» no se entiende.
---
--- @param iso   string|nil  Fecha en formato ISO.
--- @param ahora number|nil  Timestamp de referencia; solo lo usan los tests.
--- @return string
function M._fmt_date(iso, ahora)
  if not iso then return "?" end

  local dias = _dias_desde(iso, ahora)
  if dias == nil then return iso end  -- irreconocible: se muestra tal cual

  if dias == 0 then return "hoy" end
  if dias == 1 then return "ayer" end
  if dias >= 2 and dias <= 6 then return string.format("hace %d d", dias) end
  return iso:sub(1, 10)
end
local _fmt_date = M._fmt_date

--- Nombre visible del autor de un evento.
---
--- El esquema de los sidecars no le da `name` a un agente: su identidad es
--- `model` (ver $defs/author). La versión anterior leía `name` para los dos
--- casos, y por eso TODOS los mensajes de agente aparecían como «ai:?».
---
--- El prefijo «human:» / «ai:» desaparece: ocupa columna en un sidebar estrecho
--- y la distinción ya la lleva el color del nombre en el render.
---
--- @param author table|nil  { kind = "human", name } o { kind = "ai", model }.
--- @return string
function M._fmt_author(author)
  if not author then return "?" end
  if author.kind == "ai" then
    return author.model or "agente"
  end
  return author.name or "?"
end
local _fmt_author = M._fmt_author

--- ¿El autor es un agente? Decide el color con el que se pinta su nombre.
---
--- @param author table|nil
--- @return boolean
local function _es_agente(author)
  return author ~= nil and author.kind == "ai"
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

--- Caracteres del marco. Se agrupan aquí para que cambiar el estilo de caja sea
--- un solo sitio y no una búsqueda por todo el render.
local BORDES = {
  sup_izq = "┌", sup_der = "┐",
  inf_izq = "└", inf_der = "┘",
  h       = "─", v       = "│",
}

--- Ancho mínimo con el que una caja sigue siendo una caja: los cuatro caracteres
--- de estructura (│, espacio, espacio, │) más algo de texto.
local ANCHO_MINIMO = 8

--- Construye el borde superior con el título embebido:  ┌ titulo ──────┐
---
--- El título se trunca si no cabe, dejando siempre al menos un ─: un borde sin
--- esquina derecha se lee como una caja rota, y eso es peor que un título corto.
---
--- @param titulo string
--- @param W      number  Ancho total en celdas.
--- @return string
--- @return number  Offset en BYTES donde empieza el título dentro de la línea.
local function _borde_superior(titulo, W)
  -- Estructura fija en celdas: ┌ + espacio + espacio + ┐
  local FIJO = 4
  local disponible = math.max(0, W - FIJO - 1)
  local t = box.truncate(titulo, disponible)
  local relleno = math.max(0, W - FIJO - box.width(t))
  local linea = BORDES.sup_izq .. " " .. t .. " " .. string.rep(BORDES.h, relleno) .. BORDES.sup_der
  return linea, #BORDES.sup_izq + 1
end

--- Construye el borde inferior:  └──────────┘
---
--- @param W number
--- @return string
local function _borde_inferior(W)
  return BORDES.inf_izq .. string.rep(BORDES.h, math.max(0, W - 2)) .. BORDES.inf_der
end

--- Construye una línea de contenido:  │ texto            │
---
--- El texto se rellena hasta el ancho exacto; ahí es donde cuadra el borde
--- derecho. La sangría es para los cuerpos de mensaje, que van un paso dentro
--- de la cita.
---
--- @param texto   string
--- @param W       number  Ancho total en celdas.
--- @param sangria number  Espacios extra tras el margen izquierdo.
--- @return string
--- @return number  Offset en BYTES donde empieza el texto dentro de la línea.
local function _linea_interior(texto, W, sangria)
  sangria = sangria or 0
  local hueco = math.max(0, W - 4 - sangria)
  local linea = BORDES.v .. " " .. string.rep(" ", sangria)
             .. box.pad(texto, hueco) .. " " .. BORDES.v
  return linea, #BORDES.v + 1 + sangria
end

--- Construye las líneas del panel, sus highlights y el mapa lnum→thread_id.
---
--- Cada hilo abierto se dibuja como una caja cerrada enmarcada en el color de su
--- tipo. El wrap se hace aquí y no lo hace la ventana: con `wrap` de Neovim una
--- línea larga se plegaría por fuera del marco y rompería el borde derecho.
---
--- @param threads table   Array de hilos (salida de cli.project).
--- @param ancho   number  Ancho de la ventana en celdas.
--- @return string[]  lines
--- @return table     highlights, array de { group, lnum, col_s, col_e } en bytes
--- @return table     line_to_thread
function M._build_content(threads, ancho)
  local W = math.max(ANCHO_MINIMO, math.floor(tonumber(ancho) or 60))

  local lines          = {}
  local highlights     = {}
  local line_to_thread = {}

  -- Filtrar solo hilos abiertos y ordenar por openedAt.
  local open_threads = {}
  for _, t in ipairs(threads or {}) do
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

  for idx, thread in ipairs(open_threads) do
    -- Una línea en blanco separa las cajas. No se emite tras la última: el
    -- render anterior dejaba ahí un separador colgante sin nada que separar.
    if idx > 1 then table.insert(lines, "") end

    local ctype  = thread.commentType or "?"
    local author = _fmt_author(thread.openedBy)
    local date   = _fmt_date(thread.openedAt)
    local quote  = (thread.anchor and thread.anchor.quote) or ""

    -- El texto que llega puede traer saltos: se colapsan antes de medir nada.
    local ctype_limpio  = table.concat(_split_lines(ctype), " ")
    local author_limpio = table.concat(_split_lines(author), " ")

    local tipo_entry = types.by_label[ctype]
    local tipo_hl    = tipo_entry and tipo_entry.mark_hl or "MeshReviewDetached"

    -- Cabecera: tipo · autor · fecha. Sin thread_id: en una columna estrecha se
    -- come el sitio del texto y no se usa a ojo. Se copia con `y`.
    local titulo = string.format("%s · %s · %s", ctype_limpio, author_limpio, date)

    local hdr_lnum = #lines
    local hdr, titulo_col = _borde_superior(titulo, W)
    table.insert(lines, hdr)
    line_to_thread[hdr_lnum] = thread.thread_id

    -- Toda la línea en el color del tipo, y encima el tramo de autor y fecha
    -- atenuado: el extmark posterior se dibuja sobre el anterior, así que la
    -- etiqueta del tipo se queda con el color fuerte y el resto baja a Comment.
    table.insert(highlights, { tipo_hl, hdr_lnum, 0, -1 })
    local resto_col = titulo_col + #ctype_limpio
    if resto_col < #hdr then
      table.insert(highlights, { "Comment", hdr_lnum, resto_col, titulo_col + #titulo })
    end

    -- Cita del ancla, envuelta. Se entrecomilla solo la primera y la última
    -- línea para que se lea como una cita sin repetir comillas por fila.
    if quote ~= "" then
      local plano  = table.concat(_split_lines(quote), " ")
      local trozos = box.wrap('"' .. plano .. '"', W - 4)
      for _, trozo in ipairs(trozos) do
        local linea, col = _linea_interior(trozo, W, 0)
        table.insert(lines, linea)
        table.insert(highlights, { "String", #lines - 1, col, col + #trozo })
      end
    end

    -- Mensajes del hilo, separados por una línea vacía dentro de la caja.
    for _, msg in ipairs(thread.messages or {}) do
      if not msg.retracted then
        table.insert(lines, (_linea_interior("", W, 0)))

        local msg_author = table.concat(_split_lines(_fmt_author(msg.author)), " ")
        local linea, col = _linea_interior(msg_author, W, 1)
        table.insert(lines, linea)
        -- Special es teal en dotmesh, el color de «lo especial»: distingue al
        -- agente del humano sin inventar un grupo de highlight propio.
        local autor_hl = _es_agente(msg.author) and "Special" or "Comment"
        table.insert(highlights, { autor_hl, #lines - 1, col, col + #msg_author })

        for _, parrafo in ipairs(_split_lines(msg.body)) do
          for _, trozo in ipairs(box.wrap(parrafo, W - 5)) do
            table.insert(lines, (_linea_interior(trozo, W, 1)))
          end
        end
      end
    end

    local inf = _borde_inferior(W)
    table.insert(lines, inf)
    table.insert(highlights, { tipo_hl, #lines - 1, 0, -1 })

    -- Bordes verticales de todas las líneas interiores de esta caja, en el color
    -- del tipo. Se pintan al final, cuando ya se sabe dónde empieza y acaba la
    -- caja, en vez de repetir la inserción en cada rama de arriba.
    for lnum = hdr_lnum + 1, #lines - 2 do
      local linea = lines[lnum + 1]
      table.insert(highlights, { tipo_hl, lnum, 0, #BORDES.v })
      table.insert(highlights, { tipo_hl, lnum, #linea - #BORDES.v, #linea })
    end
  end

  return lines, highlights, line_to_thread
end

--- Alias interno: el resto del módulo lo llama sin el prefijo.
local _build_content = M._build_content

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

  -- Y → copiar el thread_id del hilo bajo el cursor.
  --
  -- Va en Y y no en y porque `y` es el operador de copia: remapearlo dejaría el
  -- panel sin yy ni yiw, y copiar el texto de un comentario es justo lo que se
  -- quiere hacer aquí. Y (copiar hasta fin de línea) sí es prescindible.
  vim.keymap.set("n", "Y", function()
    local tid = M.thread_at_cursor()
    if not tid then
      vim.notify("[mesh-review] No hay hilo bajo el cursor", vim.log.levels.WARN)
      return
    end
    -- Al portapapeles del sistema y al registro por defecto: el id se usa tanto
    -- pegándolo fuera como con p dentro de Neovim.
    vim.fn.setreg("+", tid)
    vim.fn.setreg('"', tid)
    vim.notify("[mesh-review] thread_id copiado: " .. tid)
  end, vim.tbl_extend("force", opts, { desc = "Copiar thread_id" }))

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
  -- El ancho de la caja se fija al renderizar, así que se lee de la ventana del
  -- panel si sigue viva. Sin ventana —render antes de abrirla, o en un test— se
  -- cae al ancho de la pantalla.
  local ancho = vim.o.columns
  if _state.winid and vim.api.nvim_win_is_valid(_state.winid) then
    ancho = vim.api.nvim_win_get_width(_state.winid)
  end

  local lines, highlights, l2t = M._build_content(threads, ancho)

  -- Desbloquear el buffer temporalmente para escribir.
  vim.bo[bufnr].modifiable = true
  vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
  vim.bo[bufnr].modifiable = false

  _apply_highlights(bufnr, highlights)
  _state.line_to_thread = l2t
  -- Se memorizan para que un redimensionado recomponga las cajas sin volver a
  -- lanzar el CLI, que es un proceso externo y se dispararía en cada arrastre.
  _state.threads = threads
  _state.ancho   = ancho
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

  -- Registrar keymaps del panel y el vigilante de redimensionado.
  _register_keymaps(panel_bufnr, source_bufnr, doc)
  M._watch_resize()

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

--- Vigila los cambios de tamaño para recomponer las cajas al ancho nuevo.
---
--- El ancho de la caja se fija al renderizar, así que sin esto un redimensionado
--- deja los bordes derechos partidos o flotando a media ventana. Se recompone
--- con los hilos memorizados, sin volver al CLI.
---
--- WinResized cubre el arrastre de un separador; VimResized, el cambio de tamaño
--- del terminal entero, que no siempre emite el primero.
function M._watch_resize()
  vim.api.nvim_create_autocmd({ "WinResized", "VimResized" }, {
    group = AUGROUP,
    callback = function()
      if not (_state.bufnr and vim.api.nvim_buf_is_valid(_state.bufnr)) then return end
      if not (_state.winid and vim.api.nvim_win_is_valid(_state.winid)) then return end

      -- Solo si de verdad ha cambiado el ancho: WinResized se dispara también
      -- cuando cambia la altura, y recomponer entonces sería trabajo perdido.
      if vim.api.nvim_win_get_width(_state.winid) == _state.ancho then return end

      M.render(_state.bufnr, _state.threads)
    end,
  })
end

--- Cierra la ventana del panel si está abierta.
function M.close()
  if _state.winid and vim.api.nvim_win_is_valid(_state.winid) then
    vim.api.nvim_win_close(_state.winid, true)
  end
  _state.winid = nil
  -- Sin ventana no hay nada que recomponer: el vigilante se va con ella.
  vim.api.nvim_clear_autocmds({ group = AUGROUP })
end

return M

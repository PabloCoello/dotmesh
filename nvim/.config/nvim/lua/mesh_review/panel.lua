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
---   │                                          │
---   │ ⏎ ancla · r responder · d borrar · a → IA │
---   └──────────────────────────────────────────┘
---
--- El pie de cada caja lleva los atajos que operan sobre ESE hilo. Va dentro del
--- marco y no en una línea de ayuda del panel porque las acciones son por hilo:
--- puesto arriba una sola vez, habría que mirar dónde está el cursor para saber
--- sobre qué actúa.
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
  line_to_message = {}, -- { [lnum_0indexed] = { thread_id, msg_id } }
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

--- Devuelve el mensaje sobre el que está el cursor, o nil si no hay ninguno.
---
--- A diferencia de thread_at_cursor, aquí la consulta es por línea EXACTA: solo
--- las líneas de autor y de cuerpo de un mensaje cuentan. Borrar es la única
--- acción del panel que opera sobre algo más fino que el hilo, y una búsqueda
--- «hacia atrás» retractaría el último mensaje con el cursor puesto en el pie o
--- en la cabecera, donde nadie apunta a un mensaje concreto.
---
--- @return table|nil  { thread_id, msg_id }.
function M.message_at_cursor()
  if _state.bufnr == nil then return nil end
  local cursor_row = vim.api.nvim_win_get_cursor(0)[1] - 1  -- 0-indexed
  return _state.line_to_message[cursor_row]
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

-- ---------------------------------------------------------------------------
-- Pie de atajos de la caja
-- ---------------------------------------------------------------------------

--- Atajos que operan sobre el hilo de la caja, en el orden en que se anuncian.
---
--- Es la misma tabla que registra los keymaps: si se añade una acción aquí y no
--- allí (o al revés), la caja anuncia algo que no existe. Ver _register_keymaps.
--- El pie NO lista `Y` (copiar el thread_id): los seis juntos miden 61 celdas y
--- se irían a dos líneas en el ancho por defecto, con «Y id» solo en la segunda.
--- Es el único atajo que no actúa sobre el hilo, sino que se lleva su id fuera,
--- así que es el que menos pierde por vivir solo en el README.
M.ATAJOS = {
  -- El campo key es la ETIQUETA que se dibuja, no siempre la notación del
  -- keymap: «⏎» se registra como <CR>. U+23CE es de ancho Neutral en Unicode,
  -- o sea una celda en cualquier terminal, así que no descuadra la caja.
  { key = "⏎", label = "ancla"     },
  { key = "r", label = "responder" },
  { key = "d", label = "borrar"    },
  { key = "a", label = "→ IA"      },
  { key = "x", label = "resolver"  },
}

--- Atajos del panel que NO salen en el pie de la caja, pero existen. Se listan
--- aquí para que el aviso de solo lectura los nombre sin repetir literales.
M.ATAJOS_EXTRA = {
  { key = "Y", label = "id"     },
  { key = "q", label = "cerrar" },
}

--- Teclas que editarían el buffer en modo normal. El panel es de solo lectura,
--- así que lo único que producen es «E21: Cannot make changes, 'modifiable' is
--- off»: un error de Neovim que no dice que estás en un panel ni qué puedes
--- hacer en él. Se cambian por el aviso con los atajos que sí existen.
---
--- No están las que ya son acciones del panel (a, d, r, x): con nowait, las de
--- dos pulsaciones —cc, dd— no llegan a dispararse.
M._TECLAS_EDICION = {
  "i", "I", "A", "o", "O", "c", "C", "s", "S", "p", "P",
  "X", "D", "R", "J", "~", "gJ", "u", "<C-r>", "<BS>", "<Del>",
}

--- Ídem en modo visual, donde el panel se usa de verdad: seleccionar el texto de
--- un comentario para copiarlo es el motivo de no haber remapeado `y`.
---
--- Aquí NO van `i` ni `a`: en visual son los prefijos de los objetos de texto
--- (`viw`, `vap`), justo lo que se usa para seleccionar. Mapearlos rompería el
--- gesto que esta lista pretende proteger.
M._TECLAS_EDICION_VISUAL = {
  "c", "C", "s", "S", "d", "D", "x", "X", "p", "P", "r", "R",
  "~", "J", "<BS>", "<Del>",
}

--- Separador entre atajos del pie.
local SEP_ATAJO = " · "

--- Reparte los atajos en líneas que caben en `ancho` celdas.
---
--- Devuelve, por línea, el texto y la posición en BYTES de cada tecla, para que
--- el render la pinte en el color del tipo sin volver a medir nada. El wrap se
--- hace por segmentos enteros y no con box.wrap porque partir «d borrar» entre
--- dos líneas dejaría una tecla huérfana, ilegible como atajo.
---
--- Un atajo que no cabe ni solo en una línea se emite igualmente: lo truncará
--- _linea_interior, que es quien sabe cuadrar el borde.
---
--- @param atajos table   Array de { key, label }.
--- @param ancho  number  Celdas disponibles para el texto.
--- @return table  Array de { texto = string, teclas = { { col_s, col_e } } }.
function M._hint_lines(atajos, ancho)
  if type(ancho) ~= "number" or ancho < 1 then return {} end

  local lineas = {}
  local actual, teclas = "", {}

  local function emitir()
    if actual ~= "" then
      table.insert(lineas, { texto = actual, teclas = teclas })
      actual, teclas = "", {}
    end
  end

  for _, atajo in ipairs(atajos or {}) do
    local pieza  = atajo.key .. " " .. atajo.label
    local prefijo = (actual == "") and "" or SEP_ATAJO
    if actual ~= "" and box.width(actual .. prefijo .. pieza) > ancho then
      emitir()
      prefijo = ""
    end
    local col = #actual + #prefijo
    table.insert(teclas, { col, col + #atajo.key })
    actual = actual .. prefijo .. pieza
  end
  emitir()

  return lineas
end

--- Enumera todos los atajos del panel en una línea, para el aviso de solo
--- lectura. Sale de las mismas tablas que el pie, así que no se desincroniza.
---
--- @return string
function M._texto_atajos()
  local partes = {}
  for _, atajo in ipairs(M.ATAJOS) do
    table.insert(partes, atajo.key .. " " .. atajo.label)
  end
  for _, atajo in ipairs(M.ATAJOS_EXTRA) do
    table.insert(partes, atajo.key .. " " .. atajo.label)
  end
  return table.concat(partes, SEP_ATAJO)
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
--- @return table     line_to_message, { [lnum] = { thread_id, msg_id } }
function M._build_content(threads, ancho)
  local W = math.max(ANCHO_MINIMO, math.floor(tonumber(ancho) or 60))

  local lines           = {}
  local highlights      = {}
  local line_to_thread  = {}
  local line_to_message = {}

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
    return lines, highlights, line_to_thread, line_to_message
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

        -- Las líneas del mensaje —autor y cuerpo— quedan registradas para que
        -- `d` sepa qué retractar. Se registran solo estas: el mapa se consulta
        -- por línea exacta, no «la más cercana por arriba», y así el cursor
        -- sobre la cabecera o el pie no borra un mensaje que no se ve.
        local referencia = { thread_id = thread.thread_id, msg_id = msg.id }
        if msg.id then line_to_message[#lines - 1] = referencia end

        for _, parrafo in ipairs(_split_lines(msg.body)) do
          for _, trozo in ipairs(box.wrap(parrafo, W - 5)) do
            table.insert(lines, (_linea_interior(trozo, W, 1)))
            if msg.id then line_to_message[#lines - 1] = referencia end
          end
        end
      end
    end

    -- Pie de atajos del hilo, precedido por una línea en blanco para que no se
    -- confunda con el último cuerpo de mensaje.
    table.insert(lines, (_linea_interior("", W, 0)))
    for _, hint in ipairs(M._hint_lines(M.ATAJOS, W - 4)) do
      local linea, col = _linea_interior(hint.texto, W, 0)
      table.insert(lines, linea)
      table.insert(highlights, { "Comment", #lines - 1, col, col + #hint.texto })
      -- Las teclas, encima y en el color del tipo: el extmark posterior gana,
      -- así que la etiqueta se queda atenuada y la tecla resalta.
      for _, tecla in ipairs(hint.teclas) do
        table.insert(highlights, { tipo_hl, #lines - 1, col + tecla[1], col + tecla[2] })
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

  return lines, highlights, line_to_thread, line_to_message
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

--- Registra los keymaps locales del panel (CR, r, d, a, x, Y, q, Esc).
--- Necesita saber el bufnr fuente y la ruta del documento para poder operar.
---
--- Los atajos por hilo son los que anuncia el pie de cada caja (M.ATAJOS): si se
--- toca uno, hay que tocar la tabla también, o la caja anuncia lo que no hay.
---
--- @param panel_bufnr  number  Buffer del panel.
--- @param source_bufnr number  Buffer del documento fuente.
--- @param doc          string  Ruta del documento fuente.
local function _register_keymaps(panel_bufnr, source_bufnr, doc)
  local cli    = require("mesh_review.cli")
  local anchor = require("mesh_review.anchor")

  local opts = { buffer = panel_bufnr, nowait = true, silent = true }

  --- Vuelve a proyectar los hilos y repinta el panel y las marcas del documento.
  --- Lo hacen igual r, d y x: cualquier escritura en el sidecar deja lo que se ve
  --- desfasado, en el panel y en el margen del documento.
  local function refrescar()
    anchor.refresh(source_bufnr)
    local threads, perr = cli.project(doc)
    if threads then
      M.render(panel_bufnr, threads)
    elseif perr then
      vim.notify("[mesh-review] project: " .. perr, vim.log.levels.WARN)
    end
  end

  --- Devuelve el hilo bajo el cursor, avisando si no hay ninguno.
  --- @return string|nil
  local function hilo_o_aviso()
    local tid = M.thread_at_cursor()
    if not tid then
      vim.notify("[mesh-review] No hay hilo bajo el cursor", vim.log.levels.WARN)
    end
    return tid
  end

  -- Teclas de edición: en vez del E21 de Neovim, el aviso con los atajos.
  -- Las listas viven al nivel del módulo (M._TECLAS_EDICION*) para que los tests
  -- puedan comprobarlas sin abrir el panel.
  local function aviso_solo_lectura()
    vim.notify("[mesh-review] Panel de solo lectura. Atajos: " .. M._texto_atajos())
  end
  for _, tecla in ipairs(M._TECLAS_EDICION) do
    vim.keymap.set("n", tecla, aviso_solo_lectura,
      vim.tbl_extend("force", opts, { desc = "Panel de solo lectura" }))
  end
  for _, tecla in ipairs(M._TECLAS_EDICION_VISUAL) do
    vim.keymap.set("x", tecla, aviso_solo_lectura,
      vim.tbl_extend("force", opts, { desc = "Panel de solo lectura" }))
  end

  -- q / Esc → cerrar panel.
  local function close_panel()
    M.close()
  end
  vim.keymap.set("n", "q",     close_panel, vim.tbl_extend("force", opts, { desc = "Cerrar panel" }))
  vim.keymap.set("n", "<Esc>", close_panel, vim.tbl_extend("force", opts, { desc = "Cerrar panel" }))

  -- <CR> → saltar al fragmento anclado, en la ventana del documento.
  --
  -- El foco se va al documento: se salta para leer o editar ahí, y volver es
  -- <C-h>. Se lee la posición del extmark vivo, no el ancla del sidecar, para
  -- caer donde está el fragmento ahora y no donde estaba al guardar.
  vim.keymap.set("n", "<CR>", function()
    local tid = hilo_o_aviso()
    if not tid then return end

    local winid = vim.fn.bufwinid(source_bufnr)
    if winid == -1 then
      vim.notify("[mesh-review] El documento no está visible en ninguna ventana",
        vim.log.levels.WARN)
      return
    end

    local row, col = anchor.position_of(source_bufnr, tid)
    if row == nil then
      -- Sin extmark: hilo desanclado, o el documento se recargó sin refrescar.
      vim.notify("[mesh-review] Este hilo no tiene ancla en el documento",
        vim.log.levels.WARN)
      return
    end

    vim.api.nvim_set_current_win(winid)

    -- Se acota DESPUÉS de cambiar de ventana, no antes: set_current_win dispara
    -- WinEnter y BufEnter, y un autocmd ajeno puede acortar el buffer o cerrar la
    -- ventana justo ahí. nvim_win_set_cursor aborta ante una fila o una columna
    -- fuera de rango, y el error subiría como un volcado de pila en el keymap.
    if not vim.api.nvim_win_is_valid(winid) then return end

    local ultima = vim.api.nvim_buf_line_count(source_bufnr) - 1
    row = math.max(0, math.min(row, ultima))
    local linea = vim.api.nvim_buf_get_lines(source_bufnr, row, row + 1, false)[1] or ""
    col = math.max(0, math.min(col, #linea))

    vim.api.nvim_win_set_cursor(winid, { row + 1, col })
    -- Centrar: el ancla suele caer al borde de la ventana y el contexto de
    -- alrededor es justo lo que se va a leer.
    vim.cmd("normal! zz")
  end, vim.tbl_extend("force", opts, { desc = "Saltar al fragmento anclado" }))

  -- r → responder al hilo bajo el cursor.
  vim.keymap.set("n", "r", function()
    local tid = hilo_o_aviso()
    if not tid then return end
    vim.ui.input({ prompt = "Respuesta: " }, function(body)
      if not body or body == "" then return end
      local _, err = cli.reply(doc, tid, body)
      if err then
        vim.notify("[mesh-review] reply: " .. err, vim.log.levels.ERROR)
        return
      end
      refrescar()
    end)
  end, vim.tbl_extend("force", opts, { desc = "Responder al hilo" }))

  -- d → retractar el mensaje bajo el cursor.
  --
  -- Opera sobre el mensaje, no sobre el hilo: en el modelo de eventos no hay
  -- «borrar un hilo», y borrar el hilo entero por error es mucho más caro que
  -- retractar un mensaje. Por eso exige el cursor puesto sobre el mensaje.
  --
  -- Remapear d no quita nada: el buffer es nomodifiable, así que dd y dw no
  -- borran nada de todos modos.
  vim.keymap.set("n", "d", function()
    local ref = M.message_at_cursor()
    if not ref then
      vim.notify("[mesh-review] Pon el cursor sobre el mensaje que quieres borrar",
        vim.log.levels.WARN)
      return
    end
    -- La razón queda en el evento message.retracted, que es el registro de por
    -- qué desapareció. Vacía es válida; <Esc> (nil) cancela.
    vim.ui.input({ prompt = "Retractar mensaje — razón (vacía = sin razón): " }, function(reason)
      if reason == nil then
        vim.notify("[mesh-review] Cancelado", vim.log.levels.INFO)
        return
      end
      local _, err = cli.retract(doc, ref.thread_id, ref.msg_id, reason)
      if err then
        vim.notify("[mesh-review] retract: " .. err, vim.log.levels.ERROR)
        return
      end
      refrescar()
    end)
  end, vim.tbl_extend("force", opts, { desc = "Retractar el mensaje bajo el cursor" }))

  -- a → mandar este hilo a la IA (sesión scribe de herdr).
  --
  -- El mismo puente que <líder>rs, pero con el hilo concreto en el prompt en vez
  -- del documento entero: desde el panel se está mirando un hilo, no la lista.
  vim.keymap.set("n", "a", function()
    local tid = hilo_o_aviso()
    if not tid then return end
    if vim.env.HERDR_ENV ~= "1" then
      vim.notify("[mesh-review] HERDR_ENV no está activo", vim.log.levels.WARN)
      return
    end
    local scribe = require("mesh_review.scribe")
    scribe.ensure_and_prompt(doc, scribe.build_thread_prompt(doc, tid))
  end, vim.tbl_extend("force", opts, { desc = "Mandar el hilo a la IA" }))

  -- Y → copiar el thread_id del hilo bajo el cursor.
  --
  -- Va en Y y no en y porque `y` es el operador de copia: remapearlo dejaría el
  -- panel sin yy ni yiw, y copiar el texto de un comentario es justo lo que se
  -- quiere hacer aquí. Y (copiar hasta fin de línea) sí es prescindible.
  vim.keymap.set("n", "Y", function()
    local tid = hilo_o_aviso()
    if not tid then return end
    -- Al portapapeles del sistema y al registro por defecto: el id se usa tanto
    -- pegándolo fuera como con p dentro de Neovim.
    vim.fn.setreg("+", tid)
    vim.fn.setreg('"', tid)
    vim.notify("[mesh-review] thread_id copiado: " .. tid)
  end, vim.tbl_extend("force", opts, { desc = "Copiar thread_id" }))

  -- x → resolver el hilo bajo el cursor.
  vim.keymap.set("n", "x", function()
    local tid = hilo_o_aviso()
    if not tid then return end
    local _, err = cli.resolve(doc, tid)
    if err then
      vim.notify("[mesh-review] resolve: " .. err, vim.log.levels.ERROR)
      return
    end
    refrescar()
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

  local lines, highlights, l2t, l2m = M._build_content(threads, ancho)

  -- Desbloquear el buffer temporalmente para escribir.
  vim.bo[bufnr].modifiable = true
  vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
  vim.bo[bufnr].modifiable = false

  _apply_highlights(bufnr, highlights)
  _state.line_to_thread  = l2t
  _state.line_to_message = l2m
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
  _state.source_bufnr = source_bufnr
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

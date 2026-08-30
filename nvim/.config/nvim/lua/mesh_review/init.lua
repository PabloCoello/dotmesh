--- mesh_review — Plugin de Neovim para mesh-review
---
--- Punto de entrada del plugin. setup() resuelve el CLI, registra los keymaps
--- globales y los comandos de usuario.
---
--- Keymaps registrados:
---   <leader>rp (n)  → abrir panel del fichero actual
---   <leader>rs (n)  → enviar prompt a scribe (solo si HERDR_ENV=1)
---   <leader>ro (v)  → selector de tipo (leyenda en una línea + una tecla)
---   <leader>re (v)  → hilo tipo edita
---   <leader>rs (v)  → hilo tipo sugerencia  [modo distinto de <leader>rs normal]
---   <leader>rp (v)  → hilo tipo pregunta     [modo distinto de <leader>rp normal]
---   <leader>rv (v)  → hilo tipo verifica (segunda tecla: confianza)
---   <leader>rn (v)  → hilo tipo nota
---   <leader>rr (v)  → hilo tipo referencia
---   <leader>ru (v)  → hilo tipo supuesto (segunda tecla: confianza)
---
--- Nota sobre conflictos aparentes: <leader>rs y <leader>rp existen tanto en
--- modo normal como visual, pero con acciones distintas. Neovim distingue los
--- modos con precisión, así que no hay conflicto real. Se documenta aquí para
--- que no sorprenda al leer los keymaps.
---
--- Comandos registrados:
---   :MeshPanel               → igual que <leader>rp
---   :MeshRetract <tid> <mid> [reason]  → retractar un mensaje

local M = {}

local cli    = require("mesh_review.cli")
local anchor = require("mesh_review.anchor")
local hl     = require("mesh_review.hl")
local panel  = require("mesh_review.panel")
local utf    = require("mesh_review.utf")
local types  = require("mesh_review.types")

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

--- Calcula el rango de la selección visual activa en el buffer dado.
---
--- Debe llamarse DENTRO del callback del keymap visual, antes de cualquier
--- prompt o vim.fn.getcharstr(), porque esas funciones salen del modo visual y
--- a partir de ese momento getpos("v") y getpos(".") dejan de reflejar la
--- selección en curso.
---
--- Por qué NO usamos '< y '>:
--- Con vim.keymap.set("v", …, function() … end), Neovim ejecuta el callback
--- sin salir del modo visual. En ese estado, getpos("'<") y getpos("'>")
--- devuelven la selección ANTERIOR (la de la última vez que se usó el modo v),
--- no la actual. Medido en Neovim 0.12.5: '<=(1,1), '>=(1,3) para la selección
--- previa mientras v=(3,7), .=(3,11) para la selección real.
--- getpos("v") y getpos(".") reflejan el estado vivo del modo visual.
---
--- Modos contemplados:
---   v   (por caracteres) — rango tal cual; end_col+1 da el offset exclusivo
---                          (igual que el código original con '>').
---   V   (por líneas)     — col inicial 0; col final = fin real de la última
---                          línea (v:maxcol se acota en to_utf16).
---   \22 (por bloques)    — rectángulo envolvente (simplificación): de la
---                          primera a la última línea, de la columna menor a la
---                          mayor. No replica la semántica exacta del bloque,
---                          pero produce un ancla útil para selecciones
---                          homogéneas. Documentado en el README.
---
--- @param bufnr number  Número de buffer.
--- @return number, number  Offset UTF-16 de inicio y de fin (exclusivo) desde
---                         el inicio del fichero.
function M._selection_range(bufnr)
  local mode  = vim.fn.mode()
  -- getpos("v") devuelve el extremo ancla de la selección activa.
  -- getpos(".") devuelve la posición del cursor.
  -- Formato: { bufnum, lnum (1-indexed), col (1-indexed bytes), off }.
  local pos_v = vim.fn.getpos("v")
  local pos_c = vim.fn.getpos(".")

  -- Convertir a 0-indexed.
  local v_row = pos_v[2] - 1
  local v_col = pos_v[3] - 1
  local c_row = pos_c[2] - 1
  local c_col = pos_c[3] - 1

  local offset, end_offset

  if mode == "V" then
    -- Selección por líneas completas. La columna final se pasa como v:maxcol
    -- (2147483647); utf.to_utf16 la acota al número de bytes reales de la
    -- última línea, que es la semántica correcta para «hasta el final de línea».
    local r1 = math.min(v_row, c_row)
    local r2 = math.max(v_row, c_row)
    offset     = utf.to_utf16(bufnr, r1, 0)
    end_offset = utf.to_utf16(bufnr, r2, 2147483647)

  elseif mode == "\22" then
    -- Selección por bloques (Ctrl-V): rectángulo envolvente.
    -- Se trata como un rango lineal desde la esquina superior-izquierda hasta
    -- la inferior-derecha. No es la semántica exacta del bloque de Vim, pero
    -- produce un ancla válida cuando el usuario selecciona texto homogéneo en
    -- varias líneas (p.ej. una columna de datos).
    local r1 = math.min(v_row, c_row)
    local r2 = math.max(v_row, c_row)
    local c1 = math.min(v_col, c_col)
    local c2 = math.max(v_col, c_col)
    offset     = utf.to_utf16(bufnr, r1, c1)
    end_offset = utf.to_utf16(bufnr, r2, c2 + 1)

  else
    -- Modo v (por caracteres) y cualquier otro modo visual.
    -- Normalizar: la selección puede haberse hecho de atrás hacia delante
    -- (cursor antes del ancla en el buffer).
    local s_row, s_col, e_row, e_col
    if v_row < c_row or (v_row == c_row and v_col <= c_col) then
      s_row, s_col = v_row, v_col
      e_row, e_col = c_row, c_col
    else
      s_row, s_col = c_row, c_col
      e_row, e_col = v_row, v_col
    end
    offset = utf.to_utf16(bufnr, s_row, s_col)
    -- e_col es el primer byte del último carácter seleccionado (0-indexed).
    -- e_col+1 avanza más allá de ese byte; to_utf16 redondea al siguiente
    -- límite de carácter completo, dando el offset UTF-16 exclusivo correcto.
    end_offset = utf.to_utf16(bufnr, e_row, e_col + 1)
  end

  return offset, end_offset
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

--- Completa el flujo de apertura de un hilo dado el tipo ya elegido.
---
--- Gestiona el prompt de confianza para tipos que lo necesitan (verifica y
--- supuesto) y solicita el cuerpo del comentario, luego llama a cli.open con
--- todos los parámetros correctos.
---
--- Debe invocarse DESPUÉS de haber capturado offset y end_offset, porque
--- vim.ui.input y vim.fn.getcharstr sacan del modo visual e invalidan las
--- posiciones "v" y ".".
---
--- @param tipo       MeshReviewType  Tipo elegido (entrada de types.list).
--- @param bufnr      number          Buffer origen.
--- @param doc        string          Ruta al documento.
--- @param offset     number          Offset UTF-16 de inicio.
--- @param end_offset number          Offset UTF-16 de fin (exclusivo).
local function _open_with_type(tipo, bufnr, doc, offset, end_offset)
  local confidence = nil

  if tipo.needs_confidence then
    -- Segunda pulsación: nivel de confianza. Cualquier tecla no reconocida
    -- (incluido Esc y Ctrl-C) cancela limpiamente.
    vim.api.nvim_echo(
      { { "Confianza: a alta · m media · b baja  (<Esc> / <C-c> cancela)", "Question" } },
      false, {}
    )
    local key = vim.fn.getcharstr()
    -- Limpiar el área de echo antes de continuar.
    vim.api.nvim_echo({ { "" } }, false, {})

    if     key == "a" then confidence = "alta"
    elseif key == "m" then confidence = "media"
    elseif key == "b" then confidence = "baja"
    else
      vim.notify("[mesh-review] Cancelado", vim.log.levels.INFO)
      return
    end
  end

  -- El cuerpo del comentario no puede reducirse a una sola tecla: se mantiene
  -- el prompt de texto libre.
  vim.ui.input({ prompt = "[mesh-review] Comentario (" .. tipo.label .. "): " }, function(body)
    if not body or body == "" then
      vim.notify("[mesh-review] Comentario cancelado", vim.log.levels.INFO)
      return
    end

    local opts = {}
    if confidence then opts.confidence = confidence end

    local thread_id, err = cli.open(doc, offset, end_offset, tipo.label, body, opts)
    if err then
      vim.notify("[mesh-review] open: " .. err, vim.log.levels.ERROR)
      return
    end

    anchor.refresh(bufnr)
    vim.notify("[mesh-review] Hilo creado: " .. (thread_id or "?"), vim.log.levels.INFO)
  end)
end

--- Selector de tipo interactivo: muestra la leyenda y espera una pulsación.
---
--- Captura la selección visual ANTES de mostrar cualquier prompt, porque
--- getcharstr y vim.ui.input sacan del modo visual e invalidan getpos("v").
--- Se asigna a <leader>ro en modo visual.
function M.open_thread_selector()
  local bufnr = vim.api.nvim_get_current_buf()
  local doc   = vim.api.nvim_buf_get_name(bufnr)
  if doc == "" then
    vim.notify("[mesh-review] El buffer no tiene nombre de fichero", vim.log.levels.WARN)
    return
  end

  -- Capturar ANTES de cualquier prompt: getcharstr y vim.ui.input salen del
  -- modo visual e invalidan getpos("v") y getpos(".").
  local offset, end_offset = M._selection_range(bufnr)

  vim.api.nvim_echo(
    { { "Tipo: e edita · s sugerencia · p pregunta · v verifica · n nota · r referencia · u supuesto  (<Esc> cancela)", "Question" } },
    false, {}
  )
  local key = vim.fn.getcharstr()
  -- Limpiar la leyenda antes de continuar.
  vim.api.nvim_echo({ { "" } }, false, {})

  local tipo = types.by_letter[key]
  if not tipo then
    -- Escape (\27) y Ctrl-C (\3) son cancelaciones silenciosas.
    if key ~= "\27" and key ~= "\3" then
      vim.notify("[mesh-review] Tecla no reconocida: " .. vim.fn.strtrans(key),
        vim.log.levels.INFO)
    else
      vim.notify("[mesh-review] Cancelado", vim.log.levels.INFO)
    end
    return
  end

  _open_with_type(tipo, bufnr, doc, offset, end_offset)
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
  -- La ruta acaba dentro del texto del prompt que lee un agente. `herdr agent
  -- prompt` toma el texto como UN argumento, así que la ruta no puede ir aparte;
  -- lo que sí se puede es impedir que un nombre de fichero con saltos de línea
  -- o caracteres de control finja un turno nuevo dentro del prompt. El texto
  -- suelto de un nombre raro sigue llegando, pero ya no puede maquetarse como
  -- instrucción separada.
  doc = doc:gsub("%c", " ")
  -- Lista de argumentos: la ruta viaja como argv independiente, sin shell.
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

  -- Registrar el grupo <leader>r en which-key para modo normal Y visual.
  -- El bloque pcall evita error si which-key no está cargado todavía.
  pcall(function()
    local wk = require("which-key")
    wk.add({
      { "<leader>r", group = "mesh-review",        mode = "n" },
      { "<leader>r", group = "mesh-review (hilo)", mode = "v" },
    })
  end)

  -- Keymaps en modo normal (sin cambio respecto a versiones anteriores).
  vim.keymap.set("n", "<leader>rp", M.show_panel,           { desc = "Panel mesh-review" })
  vim.keymap.set("n", "<leader>rs", M.prompt_scribe,        { desc = "Prompt a scribe" })

  -- Selector de tipo interactivo en modo visual (leyenda + una tecla).
  vim.keymap.set("v", "<leader>ro", M.open_thread_selector, { desc = "Selector de tipo (leyenda)" })

  -- Atajos directos por tipo en modo visual: una tecla, sin leyenda.
  -- Nota: <leader>rs (v) = sugerencia; <leader>rp (v) = pregunta. No
  -- colisionan con sus homólogos de modo normal porque Neovim distingue modos.
  for _, t in ipairs(types.list) do
    local tipo = t  -- captura local para el closure
    vim.keymap.set("v", "<leader>r" .. tipo.letter, function()
      local bufnr_ = vim.api.nvim_get_current_buf()
      local doc_   = vim.api.nvim_buf_get_name(bufnr_)
      if doc_ == "" then
        vim.notify("[mesh-review] El buffer no tiene nombre de fichero", vim.log.levels.WARN)
        return
      end
      -- Capturar selección ANTES de cualquier prompt.
      local off, end_off = M._selection_range(bufnr_)
      _open_with_type(tipo, bufnr_, doc_, off, end_off)
    end, { desc = "Hilo " .. tipo.label })
  end

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

  -- Grupos de highlight del plugin (fondo tintado por tipo, signo y etiqueta).
  -- Se definen aquí y no solo en el colorscheme porque el tinte se calcula sobre
  -- el fondo real de Normal: con otro tema activo (o con el del usuario), el
  -- valor correcto es distinto. El autocmd los recalcula en cada cambio de tema,
  -- que es cuando ese fondo cambia; sin él, los rangos quedarían tintados sobre
  -- el fondo del tema anterior.
  hl.setup()
  local aug_hl = vim.api.nvim_create_augroup("MeshReviewHL", { clear = true })
  vim.api.nvim_create_autocmd("ColorScheme", {
    group    = aug_hl,
    pattern  = "*",
    callback = function() hl.setup() end,
  })

  -- Autocmd global para inicializar extmarks en cada buffer que tenga un
  -- fichero real (BufReadPost cubre tanto la apertura inicial como los buffers
  -- ya cargados cuando el plugin arranca).
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

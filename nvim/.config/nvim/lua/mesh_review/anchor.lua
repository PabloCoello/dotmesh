--- mesh_review.anchor — Gestión de extmarks para hilos de revisión
---
--- Un extmark por hilo abierto, colocado sobre el fragmento resuelto o, si
--- la cita no se encuentra, en la fila line_hint (0-indexed).
--- El namespace es "mesh_review" (compartido por todos los buffers).
--- En BufWritePost se llama a cli.reanchor para actualizar los offsets en disco.
---
--- Exposición de API interna para tests:
---   M._place_extmarks(bufnr, threads) — función local expuesta con prefijo _
---   para que los specs puedan llamarla con datos de prueba sin depender del CLI.
---   El guión bajo señala que es un hook de test, no parte de la API pública.
---   Documentado aquí para que quede claro ante cualquier lector.

local M = {}

local cli     = require("mesh_review.cli")
local resolve = require("mesh_review.resolve")
local types   = require("mesh_review.types")

--- Namespace de Neovim para todos los extmarks de mesh-review.
--- Se crea una sola vez y reutiliza en todos los buffers.
local _ns = nil

local function _get_ns()
  if _ns == nil then
    _ns = vim.api.nvim_create_namespace("mesh_review")
  end
  return _ns
end

--- Mapa de extmark_id (integer) → thread_id (string) por buffer.
--- Estructura: { [bufnr] = { [extmark_id] = thread_id } }
local _extmark_to_thread = {}

--- Contador global de IDs para extmarks (los IDs deben ser enteros > 0).
local _id_counter = 0

local function _next_id()
  _id_counter = _id_counter + 1
  return _id_counter
end

--- Coloca extmarks para los hilos dados en el buffer.
--- Limpia todos los extmarks anteriores en el namespace antes de colocar los nuevos.
---
--- Para cada hilo abierto con ancla:
---
---   Caso detached: signo gris "? " (MeshReviewDetached) sin rango ni virt_text.
---   El hilo no tiene texto anclado; marcar con "?" indica que se perdió el ancla.
---
---   Caso normal: se intenta resolver la cita con resolve.find_quote.
---   — Cita encontrada, cierta: rango tintado con hl_group del tipo + virt_text.
---   — Cita encontrada, incierta: rango con MeshReviewDetached (bg degradado) para
---     no señalar la posición como exacta; signo y virt_text mantienen el tipo.
---   — Cita no encontrada: extmark en line_hint sin rango; sign + virt_text del tipo.
---
--- El signo usa dos celdas: letra del tipo + barra sólida (▎).
--- La combinación supera al triángulo fino anterior (▸) porque:
---   1. La letra identifica el tipo a golpe de vista sin iconos externos.
---   2. ▎ (U+258E, un cuarto de bloque vertical) da cuerpo a la marca con suficiente
---      contraste sobre el fondo oscuro (#121212) sin tapar la letra adyacente.
---   3. El color del tipo en sign_hl_group añade la señal cromática que faltaba.
---
--- @param bufnr   number   Buffer de Neovim.
--- @param threads table    Array de hilos devuelto por cli.project.
local function _place_extmarks(bufnr, threads)
  local ns = _get_ns()

  -- Limpiar extmarks previos y el mapa del buffer.
  vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
  _extmark_to_thread[bufnr] = {}

  local num_lines = vim.api.nvim_buf_line_count(bufnr)
  if num_lines == 0 then return end

  --- Acota una posición (row, col) al rango real del buffer.
  ---
  --- nvim_buf_set_extmark aborta con «Invalid 'end_col': out of range» ante una
  --- columna que no existe, y ese error sube por refresh() y deja el documento
  --- SIN NINGÚN extmark: una sola ancla malformada apagaría la revisión entera.
  --- Acotar degrada esa ancla a un rango algo más corto y deja vivas las demás.
  --- El caso conocido —cita terminada en '\n'— ya se resuelve en resolve.lua;
  --- esto es la red por debajo, para anclas venidas de otro editor o escritas
  --- a mano en el sidecar.
  ---
  --- @param row number  Fila 0-indexed.
  --- @param col number  Columna 0-indexed en bytes.
  --- @return number, number  Fila y columna acotadas.
  local function clamp(row, col)
    row = math.max(0, math.min(row, num_lines - 1))
    local line = vim.api.nvim_buf_get_lines(bufnr, row, row + 1, false)[1] or ""
    return row, math.max(0, math.min(col, #line))
  end

  for _, thread in ipairs(threads) do
    if thread.status == "open" and thread.anchor then
      local anchor = thread.anchor
      local ctype  = thread.commentType or "?"
      local tipo   = types.by_label[ctype]  -- nil si tipo desconocido

      local eid = _next_id()

      if anchor.detached then
        -- Hilo desanclado: el usuario eliminó el texto o el ancla nunca tuvo cita.
        -- Marcar con "?" en gris para que se distinga de los comentarios normales.
        local row = math.max(0, math.min(anchor.line_hint or 0, num_lines - 1))
        vim.api.nvim_buf_set_extmark(bufnr, ns, row, 0, {
          id            = eid,
          sign_text     = "? ",
          sign_hl_group = "MeshReviewDetached",
        })
      else
        -- Grupo de rango: solo `bg` (mezcla al 0.18). Se usa para hl_group del
        -- extmark de rango; no lleva `fg` para no recolorear la prosa del documento.
        local hl_group = tipo and tipo.hl or "MeshReviewDetached"
        -- Grupo de marca: solo `fg` = color canónico del tipo, sin `bg`.
        -- Se usa para sign_hl_group y el hl de virt_text para que la letra del
        -- signo y la etiqueta de fin de línea se vean en el color del tipo.
        local mark_hl  = tipo and tipo.mark_hl or "MeshReviewDetached"
        -- sign_text: letra del tipo + barra sólida para rellenar la segunda celda.
        -- Tipo desconocido → "? " (dos celdas, sin barra, para no confundir).
        local sign_text = tipo and (tipo.letter .. "▎") or "? "

        -- Fila y columna de respaldo: line_hint acotada al rango válido del buffer.
        local row = math.max(0, math.min(anchor.line_hint or 0, num_lines - 1))
        local col = 0

        -- Intentar resolver la cita en el buffer.
        local pos = resolve.find_quote(bufnr, anchor.quote, anchor.char_offset)

        local opts = {
          id            = eid,
          sign_text     = sign_text,
          sign_hl_group = mark_hl,   -- color del tipo como fg; sin bg intrusivo
          virt_text     = { { "● " .. ctype, mark_hl } },  -- ídem para la etiqueta eol
          virt_text_pos = "eol",
        }

        if pos then
          -- Cita resuelta: el extmark arranca en la posición exacta del fragmento.
          -- La columna inicial (pos.start_col) es importante: nvim_buf_set_extmark
          -- usa el par (row, col) como origen del rango de hl_group. Si se coloca
          -- en col=0 con end_col=7, el fondo tintado cubriría desde la columna 0
          -- en lugar del fragmento real. El signo se muestra en la línea del extmark
          -- independientemente de col, así que mover col a start_col no lo afecta.
          row = pos.start_row
          col = pos.start_col
          -- Incertidumbre alta: el fondo tintado se degrada a Detached para no
          -- señalar como exacta una posición en la que tenemos poca confianza.
          -- El signo y el virt_text mantienen el color del tipo (mark_hl): el
          -- usuario sigue viendo qué tipo de comentario es aunque el ancla sea
          -- aproximada; solo el rango de fondo pierde el tinte canónico.
          local range_hl = pos.uncertain and "MeshReviewDetached" or hl_group

          row, col = clamp(row, col)
          local end_row, end_col = clamp(pos.end_row, pos.end_col)

          -- Si el acotado ha dejado el fin por detrás del inicio, el rango ya no
          -- describe nada: se cae a extmark sin rango (solo signo y virt_text)
          -- en vez de pedirle a Neovim un rango invertido.
          if end_row > row or (end_row == row and end_col >= col) then
            opts.hl_group = range_hl
            opts.end_row  = end_row
            opts.end_col  = end_col
          end
        end
        -- Cita no resuelta: opts sin end_row/end_col ni hl_group (solo sign + virt_text).

        vim.api.nvim_buf_set_extmark(bufnr, ns, row, col, opts)
      end

      _extmark_to_thread[bufnr][eid] = thread.thread_id
    end
  end
end

--- Hook de test: expone _place_extmarks para que los specs puedan llamarla
--- directamente con datos de prueba sin necesitar el CLI ni un sidecar real.
--- El prefijo _ indica que no es parte de la API pública del módulo.
M._place_extmarks = _place_extmarks

--- Inicializa el seguimiento de extmarks para un buffer:
--- coloca extmarks iniciales y registra el autocmd BufWritePost.
--- Es idempotente: llamarlo dos veces sobre el mismo buffer no duplica el autocmd.
---
--- @param bufnr number  Buffer de Neovim (normalmente el buffer actual).
function M.setup(bufnr)
  -- Cargar hilos y colocar extmarks.
  M.refresh(bufnr)

  -- Registrar BufWritePost para reanclar en disco tras cada guardado.
  -- Usamos un augroup con nombre derivado del bufnr para que sea idempotente.
  local aug = vim.api.nvim_create_augroup("MeshReviewAnchor_" .. bufnr, { clear = true })
  vim.api.nvim_create_autocmd("BufWritePost", {
    group  = aug,
    buffer = bufnr,
    callback = function()
      local doc = vim.api.nvim_buf_get_name(bufnr)
      if doc == "" then return end
      cli.reanchor(doc)
    end,
  })
end

--- Refresca los extmarks del buffer: llama a cli.project y recoloca las marcas.
--- Llamado desde panel.open() y después de operaciones de escritura.
---
--- El buffer puede haber dejado de existir: el panel sigue abierto cuando se
--- cierra el documento que lo originó, y sus atajos siguen llamando aquí. La
--- guarda va en refresh y no en cada punto de llamada para que valga también
--- para los que se añadan después.
---
--- @param bufnr number  Buffer de Neovim.
function M.refresh(bufnr)
  if not bufnr or not vim.api.nvim_buf_is_valid(bufnr) then return end

  local doc = vim.api.nvim_buf_get_name(bufnr)
  if doc == "" then return end

  local threads, err = cli.project(doc)
  if threads == nil then
    -- Fichero sin sidecar (no es un error grave; simplemente no hay hilos).
    -- Solo avisamos si es un error distinto de "no sidecar".
    if err and not err:match("no sidecar") and not err:match("ENOENT") then
      vim.notify("[mesh-review] project: " .. err, vim.log.levels.WARN)
    end
    -- Limpiar extmarks existentes.
    local ns = _get_ns()
    vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
    _extmark_to_thread[bufnr] = {}
    return
  end

  _place_extmarks(bufnr, threads)
end

--- Devuelve el thread_id del extmark más cercano al cursor en el buffer dado.
--- Útil cuando el cursor está en el documento fuente (no en el panel).
---
--- @param bufnr number  Buffer fuente.
--- @return string|nil   thread_id o nil si no hay extmarks.
function M.thread_at_cursor(bufnr)
  local ns = _get_ns()
  local cursor_row = vim.api.nvim_win_get_cursor(0)[1] - 1  -- 0-indexed

  -- Obtener todos los extmarks del buffer con su posición.
  local marks = vim.api.nvim_buf_get_extmarks(bufnr, ns, 0, -1, {})
  if #marks == 0 then return nil end

  local best_id   = nil
  local best_dist = math.huge

  for _, mark in ipairs(marks) do
    -- mark = {id, row, col}
    local dist = math.abs(mark[2] - cursor_row)
    if dist < best_dist then
      best_dist = dist
      best_id   = mark[1]
    end
  end

  if best_id == nil then return nil end
  local buf_map = _extmark_to_thread[bufnr]
  if buf_map == nil then return nil end
  return buf_map[best_id]
end

return M

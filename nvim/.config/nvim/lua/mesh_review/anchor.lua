--- mesh_review.anchor — Gestión de extmarks para hilos de revisión
---
--- Un extmark por hilo abierto, colocado en la fila line_hint (0-indexed).
--- El namespace es "mesh_review" (compartido por todos los buffers).
--- En BufWritePost se llama a cli.reanchor para actualizar los offsets en disco.

local M = {}

local cli = require("mesh_review.cli")

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
--- @param bufnr   number   Buffer de Neovim.
--- @param threads table    Array de hilos devuelto por cli.project.
local function _place_extmarks(bufnr, threads)
  local ns = _get_ns()

  -- Limpiar extmarks previos y el mapa del buffer.
  vim.api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
  _extmark_to_thread[bufnr] = {}

  local num_lines = vim.api.nvim_buf_line_count(bufnr)
  if num_lines == 0 then return end

  for _, thread in ipairs(threads) do
    if thread.status == "open" and thread.anchor then
      local row = thread.anchor.line_hint or 0
      -- Acotar la fila al rango válido del buffer.
      row = math.max(0, math.min(row, num_lines - 1))

      local eid = _next_id()
      vim.api.nvim_buf_set_extmark(bufnr, ns, row, 0, {
        id            = eid,
        sign_text     = "▸",
        sign_hl_group = "Identifier",
      })
      _extmark_to_thread[bufnr][eid] = thread.thread_id
    end
  end
end

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
--- @param bufnr number  Buffer de Neovim.
function M.refresh(bufnr)
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

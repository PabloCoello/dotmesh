--- mesh_review.utf — Conversión de posición byte ↔ offset UTF-16 absoluto
---
--- mesh-review almacena offsets en unidades de código UTF-16 (índices de cadena
--- JavaScript) contadas desde el inicio del fichero. Neovim expone posiciones como
--- {row, col} donde col es el desplazamiento en bytes desde el inicio de la línea.
---
--- Este módulo implementa la conversión bidireccional usando las APIs estándar de
--- Neovim: vim.str_utfindex y vim.str_byteindex (firma de tres argumentos,
--- disponible desde Neovim 0.10).
---
--- No tiene dependencias externas: solo vim.api y las funciones de cadena de Neovim.

local M = {}

--- Convierte una posición (row, col en bytes) a offset UTF-16 absoluto desde el
--- inicio del buffer.
---
--- El algoritmo acumula la longitud UTF-16 de cada línea anterior más un +1 por
--- el carácter '\n' que las separa. Después añade el desplazamiento parcial dentro
--- de la línea objetivo.
---
--- @param bufnr number  Número de buffer de Neovim.
--- @param row   number  Fila 0-indexed.
--- @param col   number  Columna en bytes desde el inicio de la línea (0-indexed).
--- @return      number  Offset en unidades de código UTF-16 desde el inicio del fichero.
function M.to_utf16(bufnr, row, col)
  -- Recuperar las líneas 0..row (inclusive). nvim_buf_get_lines es 0-indexed y
  -- el extremo superior es exclusivo, por lo que row+1 incluye la fila objetivo.
  local lines = vim.api.nvim_buf_get_lines(bufnr, 0, row + 1, false)
  local offset = 0

  -- Sumar la longitud UTF-16 de cada línea previa más el \n que la termina.
  -- En Lua los arrays son 1-indexed; lines[1] corresponde a la fila 0.
  for i = 1, row do
    local line = lines[i]
    offset = offset + vim.str_utfindex(line, "utf-16", #line)
    offset = offset + 1  -- '\n' cuenta 1 unidad de código UTF-16
  end

  -- Añadir el desplazamiento parcial dentro de la línea objetivo.
  -- str_utfindex(str, "utf-16", byte_idx) devuelve el número de unidades UTF-16
  -- en str[0..byte_idx-1], que es exactamente el offset dentro de la línea.
  local current_line = lines[row + 1] or ""
  offset = offset + vim.str_utfindex(current_line, "utf-16", col)

  return offset
end

--- Convierte un offset UTF-16 absoluto a posición {row, col} en bytes.
---
--- Recorre las líneas del buffer acumulando su longitud en UTF-16 (+1 por el \n).
--- Cuando la acumulación supera el offset objetivo, la posición cae en esa línea;
--- str_byteindex convierte el resto del offset al desplazamiento en bytes.
---
--- @param bufnr  number  Número de buffer de Neovim.
--- @param offset number  Offset en unidades de código UTF-16 desde el inicio del fichero.
--- @return       table   {row: number, col: number} con col en bytes (0-indexed).
---                       Devuelve nil si el offset está fuera del rango del buffer.
function M.from_utf16(bufnr, offset)
  local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
  local acum = 0

  for i, line in ipairs(lines) do
    -- +1 por el '\n' que sigue a esta línea (el +1 de la última línea es inofensivo
    -- porque para offsets válidos la condición se cumple antes de sobrepasarla).
    local utf16_line = vim.str_utfindex(line, "utf-16", #line) + 1

    if acum + utf16_line > offset then
      -- El offset cae dentro de esta línea. Convertir a bytes.
      -- str_byteindex(str, "utf-16", utf16_idx) devuelve el desplazamiento en bytes
      -- correspondiente a utf16_idx unidades dentro de str.
      local byte_col = vim.str_byteindex(line, "utf-16", offset - acum)
      return { row = i - 1, col = byte_col }  -- i es 1-indexed; row es 0-indexed
    end

    acum = acum + utf16_line
  end

  -- Offset fuera del rango del buffer (no debería ocurrir con offsets válidos).
  return nil
end

return M

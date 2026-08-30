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
--- Entradas fuera de rango se acoten en lugar de propagar un error:
---   - row se acota a [0, num_lines-1].
---   - col se acota a [0, #line]. Esto convierte v:maxcol (2147483647), que Neovim
---     asigna a '> en selecciones por línea completa (modo V), en el final de línea,
---     que es la semántica correcta para «hasta el último byte».
---
--- Redondeo en mitad de carácter multibyte: si col cae dentro de un carácter
--- multi-byte (p. ej. en medio de los 4 bytes de un emoji), str_utfindex extiende
--- al siguiente límite de carácter completo. El comportamiento es determinista y
--- consistente con str_byteindex en from_utf16.
---
--- @param bufnr number  Número de buffer de Neovim.
--- @param row   number  Fila 0-indexed. Se acota al rango válido del buffer.
--- @param col   number  Columna en bytes desde el inicio de la línea (0-indexed).
---                      Se acota a [0, #line]. v:maxcol (2147483647) es seguro.
--- @return      number  Offset en unidades de código UTF-16 desde el inicio del fichero.
function M.to_utf16(bufnr, row, col)
  -- Obtener el número de líneas para acotar row antes de pedir las líneas.
  local num_lines = vim.api.nvim_buf_line_count(bufnr)
  if num_lines == 0 then return 0 end
  row = math.max(0, math.min(row, num_lines - 1))

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
  -- Acotar col a [0, #current_line]: valores negativos van a 0, valores mayores que
  -- #line (incluido v:maxcol) van al final de la línea.
  col = math.max(0, math.min(col, #current_line))
  offset = offset + vim.str_utfindex(current_line, "utf-16", col)

  return offset
end

--- Convierte un offset UTF-16 absoluto a posición {row, col} en bytes.
---
--- Recorre las líneas del buffer acumulando su longitud en UTF-16 (+1 por el \n).
--- Cuando la acumulación supera el offset objetivo, la posición cae en esa línea;
--- str_byteindex convierte el resto del offset al desplazamiento en bytes.
---
--- Devuelve nil para offsets fuera del rango del buffer (negativos o más allá del
--- último carácter). Esto es simétrico con to_utf16: entradas inválidas no propagan
--- errores.
---
--- Redondeo en mitad de par sustituto: si offset cae en el segundo código del par
--- sustituto de un emoji (p. ej. offset=2 para el 🎉 de "a🎉b"), str_byteindex
--- devuelve el byte de inicio del siguiente carácter, redondeando hacia adelante.
--- El comportamiento es simétrico con to_utf16.
---
--- @param bufnr  number  Número de buffer de Neovim.
--- @param offset number  Offset en unidades de código UTF-16 desde el inicio del fichero.
---                       Un valor negativo devuelve nil.
--- @return       table|nil  {row: number, col: number} con col en bytes (0-indexed),
---                          o nil si el offset está fuera del rango del buffer.
function M.from_utf16(bufnr, offset)
  -- Offset negativo: fuera de rango, igual que un offset pasado del final.
  if offset < 0 then return nil end

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

--- mesh_review.resolve — Resolución del ancla de hilo en un buffer de Neovim.
---
--- Replica la lógica de resolveAnchor del CLI (mesh-review.mjs) en Lua puro.
--- Busca todas las ocurrencias literales de `quote` en el buffer, convierte cada
--- posición a offset UTF-16 absoluto (igual que el CLI que trabaja en JavaScript
--- con índices de cadena UTF-16) y elige la más cercana a char_offset. Si la
--- distancia supera ANCHOR_UNCERTAINTY_THRESHOLD, el resultado se marca uncertain.
---
--- Dependencias: mesh_review.utf (conversión byte ↔ UTF-16 absoluto).

local M = {}

--- Umbral de incertidumbre en unidades de código UTF-16. Replicado del CLI.
--- Si la distancia entre el match más cercano y char_offset supera este valor,
--- uncertain = true y el caller puede degradar el resaltado.
local ANCHOR_UNCERTAINTY_THRESHOLD = 200

local utf = require("mesh_review.utf")

--- Convierte una posición 1-indexed en el texto concatenado (líneas unidas por
--- un solo carácter '\n') a (row, col_byte) con semántica 0-indexed para Neovim.
---
--- El texto que procesa es `table.concat(lines, "\n")`, que no añade '\n' final.
--- Cada línea ocupa `#line` bytes seguidos de un byte '\n', excepto la última.
---
--- Se usa para el INICIO de la ocurrencia (byte_start). Si byte_pos cae en el
--- '\n' de separación —una cita que empieza en el salto de línea— se devuelve la
--- columna del fin de la línea correspondiente, que es una posición válida.
--- Para el extremo final del rango existe text_end_to_rowcol, con semántica
--- exclusiva: ver allí por qué no basta con «inclusivo + 1».
---
--- @param lines    table   Array de strings (líneas del buffer, sin '\n').
--- @param byte_pos number  Posición 1-indexed en el texto concatenado.
--- @return number, number  row 0-indexed, col 0-indexed en bytes dentro de la línea.
local function text_pos_to_rowcol(lines, byte_pos)
  local p = 1  -- posición 1-indexed del inicio de la línea actual en el texto
  for i, line in ipairs(lines) do
    local llen = #line
    if byte_pos <= p + llen - 1 then
      -- Dentro de esta línea.
      return i - 1, byte_pos - p
    end
    if byte_pos == p + llen then
      -- El byte es el '\n' de separación: se devuelve fin de la línea actual.
      return i - 1, llen
    end
    p = p + llen + 1  -- saltar los bytes de la línea y el '\n' separador
  end
  -- Pasada del final (no debería ocurrir con entradas válidas derivadas de text).
  local last = lines[#lines] or ""
  return #lines - 1, #last
end

--- Convierte el extremo FINAL EXCLUSIVO de una ocurrencia a (row, col) 0-indexed.
---
--- byte_pos es la posición 1-indexed del primer byte que ya NO forma parte de la
--- cita, es decir byte_start + #quote.
---
--- No vale calcularlo como «posición del último byte + 1»: cuando la cita termina
--- en '\n' eso da col = #linea + 1, una columna que no existe, y
--- nvim_buf_set_extmark aborta el refresco entero con
--- «Invalid 'end_col': out of range». Citas terminadas en '\n' son habituales:
--- una selección visual por caracteres que baja hasta una línea vacía produce un
--- end_offset situado al inicio de la línea siguiente, y el CLI recorta la cita
--- con ese offset, salto incluido.
---
--- Recorriendo el texto con semántica exclusiva el caso se resuelve solo. Con la
--- línea i empezando en el byte p y midiendo llen bytes:
---   - byte_pos < p + llen  → el fin cae dentro de la línea: (i, byte_pos - p).
---   - byte_pos == p + llen → la cita agota la línea sin llevarse el '\n':
---     (i, llen), que como columna exclusiva es válida.
---   - byte_pos == p + llen + 1 → la cita SÍ se lleva el '\n'. La condición del
---     bucle falla, se pasa a la línea siguiente y allí byte_pos == p, o sea
---     (i+1, 0): el mismo punto del documento, expresado donde Neovim lo acepta.
---     Este es el caso que rompía.
---
--- @param lines    table   Array de strings (líneas del buffer, sin '\n').
--- @param byte_pos number  Posición 1-indexed exclusiva en el texto concatenado.
--- @return number, number  row 0-indexed, col 0-indexed en bytes (exclusiva).
local function text_end_to_rowcol(lines, byte_pos)
  local p = 1  -- posición 1-indexed del inicio de la línea actual en el texto
  for i, line in ipairs(lines) do
    local llen = #line
    -- byte_pos == p + llen es la cita que agota la línea sin incluir su '\n':
    -- col == llen es una columna exclusiva válida. Si la cita se lleva el salto
    -- (byte_pos == p + llen + 1) esta condición falla a propósito y el fin acaba
    -- resolviéndose como (línea siguiente, 0) en la iteración de después.
    if byte_pos <= p + llen then
      return i - 1, byte_pos - p
    end
    p = p + llen + 1  -- saltar los bytes de la línea y el '\n' separador
  end
  -- Pasada del final (no debería ocurrir con entradas válidas derivadas de text).
  local last = lines[#lines] or ""
  return #lines - 1, #last
end

--- Busca la ocurrencia de `quote` en `bufnr` más cercana a `char_offset`.
---
--- Algoritmo (idéntico a resolveAnchor del CLI):
---   1. Reconstruir el texto completo con table.concat(líneas, "\n").
---   2. Buscar todas las ocurrencias de quote con string.find(..., plain=true).
---      El argumento plain=true es imprescindible: sin él, caracteres como
---      %, ., -, (, ), [ se interpretarían como metacaracteres de Lua y
---      romperían la búsqueda sobre texto real.
---   3. Para cada ocurrencia, convertir el byte_start a (row, col) y luego a
---      offset UTF-16 absoluto con utf.to_utf16, que es el mismo espacio de
---      coordenadas que usa el CLI (índices de cadena JavaScript).
---   4. Calcular |utf16_offset - char_offset| y elegir el mínimo.
---   5. Si no hay ninguna ocurrencia, devolver nil.
---   6. Marcar uncertain = true si la distancia mínima supera 200.
---   7. Calcular end_row, end_col (exclusivo) con text_end_to_rowcol a partir
---      de byte_start + #quote.
---
--- El caller no debe invocar find_quote cuando anchor.detached == true.
---
--- @param bufnr       number  Número de buffer de Neovim.
--- @param quote       string  Subcadena literal a buscar. Puede ser multilínea
---                            (el CLI lo permite: string.find con plain=true
---                            busca '\n' como byte ordinario dentro del texto
---                            concatenado).
--- @param char_offset number  Offset UTF-16 absoluto de referencia, tal como lo
---                            almacena el sidecar (calculado por el CLI desde el
---                            inicio del fichero).
--- @return table|nil  { start_row, start_col, end_row, end_col, uncertain }
---                    Filas 0-indexed, columnas en bytes (end_* exclusivo).
---                    Listo para pasar directamente a nvim_buf_set_extmark.
---                    nil si no se encuentra ninguna ocurrencia.
function M.find_quote(bufnr, quote, char_offset)
  -- Guardia temprana: quote vacía o nil produce un bucle infinito en string.find
  -- (la cadena vacía siempre aparece en cualquier posición) y carece de sentido.
  if not quote or quote == "" then return nil end

  -- El ancla llega de un sidecar en disco: un fichero de `.ai/review/` escrito a
  -- mano, o venido en un repo ajeno, puede no traer char_offset. Sin esta
  -- coerción la resta de la comparación de distancias reventaría con un error de
  -- Lua en mitad del refresco. Con 0 la búsqueda sigue siendo útil: gana la
  -- primera ocurrencia, que es la mejor conjetura sin más información.
  char_offset = tonumber(char_offset) or 0

  local lines = vim.api.nvim_buf_get_lines(bufnr, 0, -1, false)
  -- Buffer sin líneas: nada que buscar.
  if #lines == 0 then return nil end

  -- Reconstruir el texto completo. table.concat NO añade '\n' final, igual que
  -- el CLI que lee el fichero con readFile y no añade un newline artificial.
  local text = table.concat(lines, "\n")

  -- Recopilar todas las ocurrencias con sus offsets UTF-16 ya calculados.
  local occurrences = {}
  local search_from = 1

  while true do
    -- plain = true: sin interpretación de patrones de Lua.
    local byte_start = string.find(text, quote, search_from, true)
    if not byte_start then break end

    local row, col = text_pos_to_rowcol(lines, byte_start)
    -- utf.to_utf16 trabaja en el mismo espacio de coordenadas que el CLI:
    -- unidades de código UTF-16 desde el inicio del fichero.
    local utf16_off = utf.to_utf16(bufnr, row, col)

    table.insert(occurrences, {
      byte_start = byte_start,
      utf16      = utf16_off,
      row        = row,
      col        = col,
    })

    -- Avanzar desde el inicio de esta ocurrencia + longitud de la cita, igual
    -- que el CLI (searchFrom = idx + quote.length). Esto evita solapamientos
    -- y es coherente con la lógica que generó los offsets en el sidecar.
    search_from = byte_start + #quote
  end

  if #occurrences == 0 then return nil end

  -- Seleccionar la ocurrencia más cercana a char_offset.
  local best      = occurrences[1]
  local best_dist = math.abs(occurrences[1].utf16 - char_offset)

  for i = 2, #occurrences do
    local dist = math.abs(occurrences[i].utf16 - char_offset)
    if dist < best_dist then
      best_dist = dist
      best      = occurrences[i]
    end
  end

  -- Calcular el extremo final del rango directamente en coordenadas exclusivas
  -- (la semántica de nvim_buf_set_extmark y de las APIs de rango de Neovim).
  -- byte_end_exclusive es el primer byte que ya no pertenece a la cita.
  local byte_end_exclusive  = best.byte_start + #quote
  local end_row, end_col    = text_end_to_rowcol(lines, byte_end_exclusive)

  return {
    start_row = best.row,
    start_col = best.col,
    end_row   = end_row,
    end_col   = end_col,
    uncertain = best_dist > ANCHOR_UNCERTAINTY_THRESHOLD,
  }
end

return M

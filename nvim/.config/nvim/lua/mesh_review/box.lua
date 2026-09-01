--- mesh_review.box — Medida, wrap y relleno de texto para las tarjetas del panel
---
--- El panel dibuja cada hilo como una caja cerrada. Un borde derecho solo cuadra
--- si TODAS las líneas del bloque miden exactamente lo mismo, y «lo mismo» son
--- celdas de terminal, no bytes: "institución" son 11 celdas y 12 bytes, y medir
--- con `#s` descuadra la caja justo en el texto en español, que aquí es el caso
--- corriente. Todo este módulo existe para no volver a confundir las dos cosas.
---
--- El wrap lo hace el render y no la ventana: con `wrap` de Neovim una línea
--- larga se plegaría por fuera de la caja y partiría el borde derecho.
---
--- Responsabilidad única: opera sobre UNA línea de texto. Los saltos de línea
--- los trocea quien llama (panel._split_lines) antes de pasar por aquí.
---
--- El módulo no toca el estado de Neovim: solo llama a funciones de medida de
--- vim.fn, así que se prueba headless sin abrir buffers ni ventanas.

local M = {}

--- Ancho de un texto en celdas de terminal.
---
--- @param s string|nil
--- @return number  0 para nil o cadena vacía.
function M.width(s)
  if s == nil or s == "" then return 0 end
  return vim.fn.strdisplaywidth(s)
end

--- Corta un texto para que no pase de `ancho` celdas.
---
--- Nunca parte un carácter por la mitad: cortar un emoji de dos celdas en un
--- hueco impar produciría bytes inválidos, así que prefiere dejar una celda sin
--- usar. Por el mismo motivo, un carácter más ancho que el hueco entero da "".
---
--- @param s     string|nil
--- @param ancho number  Celdas disponibles.
--- @return string
function M.truncate(s, ancho)
  s = tostring(s or "")
  if type(ancho) ~= "number" or ancho < 1 then return "" end
  if M.width(s) <= ancho then return s end

  local out, acumulado = "", 0
  for i = 0, vim.fn.strcharlen(s) - 1 do
    local ch = vim.fn.strcharpart(s, i, 1)
    local w  = M.width(ch)
    if acumulado + w > ancho then break end
    out = out .. ch
    acumulado = acumulado + w
  end
  return out
end

--- Parte un texto en líneas de como mucho `ancho` celdas, cortando por espacios.
---
--- Una palabra más larga que el ancho se parte en trozos del ancho completo: en
--- una columna estrecha, una URL o un identificador largo desbordarían la caja,
--- y el borde roto se lee peor que la palabra partida.
---
--- Los espacios consecutivos se colapsan; no se emiten líneas vacías por ellos.
---
--- @param texto string|nil
--- @param ancho number  Celdas disponibles por línea.
--- @return string[]  Al menos un elemento, posiblemente "".
function M.wrap(texto, ancho)
  texto = tostring(texto or "")
  if type(ancho) ~= "number" or ancho < 1 then return { "" } end

  local lineas = {}
  local actual = ""

  local function emitir()
    if actual ~= "" then
      table.insert(lineas, actual)
      actual = ""
    end
  end

  for palabra in texto:gmatch("%S+") do
    -- Palabra que no cabe ni sola en una línea entera: se trocea antes de
    -- intentar encajarla junto a lo que ya hay.
    while M.width(palabra) > ancho do
      emitir()
      local trozo = M.truncate(palabra, ancho)
      -- truncate devuelve "" si el primer carácter ya es más ancho que la línea
      -- (un emoji en una columna de 1). Sin esta salida el bucle no avanzaría:
      -- se deja desbordar ese carácter, que es lo único que se puede hacer.
      if trozo == "" then trozo = vim.fn.strcharpart(palabra, 0, 1) end
      table.insert(lineas, trozo)
      palabra = palabra:sub(#trozo + 1)
    end

    local candidato = (actual == "") and palabra or (actual .. " " .. palabra)
    if M.width(candidato) <= ancho then
      actual = candidato
    else
      emitir()
      actual = palabra
    end
  end
  emitir()

  if #lineas == 0 then lineas = { "" } end
  return lineas
end

--- Deja una línea con exactamente `ancho` celdas: la trunca o la rellena.
---
--- Es lo que hace cuadrar el borde derecho de la caja.
---
--- @param linea string|nil
--- @param ancho number
--- @return string
function M.pad(linea, ancho)
  if type(ancho) ~= "number" or ancho < 1 then return "" end
  local cortada = M.truncate(tostring(linea or ""), ancho)
  return cortada .. string.rep(" ", math.max(0, ancho - M.width(cortada)))
end

return M

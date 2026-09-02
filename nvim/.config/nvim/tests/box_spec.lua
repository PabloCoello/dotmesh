--- tests/box_spec.lua — Runner headless para mesh_review.box
---
--- Cubre el wrap por palabras y el relleno a un ancho de display exacto, que es
--- lo que sostiene los bordes de las tarjetas del panel.
---
--- El punto de todo el módulo: medir en CELDAS, no en bytes. "institución" son
--- 11 celdas y 12 bytes; con #s la caja se descuadra justo en el texto en
--- español, que es el caso corriente aquí.
---
--- No depende de plenary, del CLI de mesh-review ni de la red.
--- Termina con cq (exit 1) si alguna aserción falla; exit 0 si todo pasa.
---
--- Cómo ejecutar (desde la raíz del repo):
---
---   SPEC=$(realpath nvim/.config/nvim/tests/box_spec.lua)
---   timeout 60 ~/.local/bin/nvim --headless -u NONE -c "luafile $SPEC" -c "qa!"

local src = debug.getinfo(1, "S").source:match("^@?(.+)$")
if not src or not src:match("^/") then
  io.stderr:write(
    "ERROR: ejecuta con ruta absoluta:\n" ..
    "  SPEC=$(realpath nvim/.config/nvim/tests/box_spec.lua)\n" ..
    "  timeout 60 ~/.local/bin/nvim --headless -u NONE -c \"luafile $SPEC\" -c qa!\n"
  )
  vim.cmd("cq")
  return
end

local test_dir = src:match("(.+)/[^/]+$")
local lua_dir  = vim.fn.fnamemodify(test_dir .. "/../lua/", ":p")
package.path = lua_dir .. "?.lua;" .. lua_dir .. "?/init.lua;" .. package.path

local ok, box = pcall(require, "mesh_review.box")
if not ok then
  io.stderr:write("ERROR cargando mesh_review.box: " .. tostring(box) .. "\n")
  vim.cmd("cq")
  return
end

-- ---------------------------------------------------------------------------
-- Mini-runner
-- ---------------------------------------------------------------------------
local pass = 0
local fail = 0

local function assert_eq(desc, got, esperado)
  if got == esperado then
    io.stderr:write("  ok  " .. desc .. "\n")
    pass = pass + 1
  else
    io.stderr:write(string.format("  FAIL %s\n       got=%q  esperaba=%q\n",
      desc, tostring(got), tostring(esperado)))
    fail = fail + 1
  end
end

--- Compara una lista de líneas con la esperada, elemento a elemento.
local function assert_lines(desc, got, esperado)
  local igual = #got == #esperado
  if igual then
    for i = 1, #got do
      if got[i] ~= esperado[i] then igual = false break end
    end
  end
  if igual then
    io.stderr:write("  ok  " .. desc .. "\n")
    pass = pass + 1
  else
    io.stderr:write(string.format("  FAIL %s\n       got={%s}\n       esperaba={%s}\n",
      desc,
      table.concat(vim.tbl_map(function(l) return string.format("%q", l) end, got), ", "),
      table.concat(vim.tbl_map(function(l) return string.format("%q", l) end, esperado), ", ")))
    fail = fail + 1
  end
end

--- Verifica que todas las líneas miden exactamente `ancho` celdas.
local function assert_all_width(desc, lineas, ancho)
  local malas = {}
  for i, l in ipairs(lineas) do
    local w = vim.fn.strdisplaywidth(l)
    if w ~= ancho then
      table.insert(malas, string.format("[%d]=%d", i, w))
    end
  end
  if #malas == 0 then
    io.stderr:write("  ok  " .. desc .. "\n")
    pass = pass + 1
  else
    io.stderr:write(string.format("  FAIL %s  esperaba %d celdas; desvían: %s\n",
      desc, ancho, table.concat(malas, " ")))
    fail = fail + 1
  end
end

-- ---------------------------------------------------------------------------
-- width
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== width ===\n")

assert_eq("ascii mide sus caracteres",            box.width("hola"), 4)
assert_eq("cadena vacía mide 0",                  box.width(""), 0)
assert_eq("nil mide 0",                           box.width(nil), 0)
-- 11 caracteres, 12 bytes: el acento es la trampa que descuadra las cajas.
assert_eq("acento mide 1 celda, no 2 bytes",      box.width("institución"), 11)
assert_eq("comillas angulares miden 1 celda",     box.width("«a»"), 3)
assert_eq("guion largo mide 1 celda",             box.width("—"), 1)
assert_eq("emoji mide 2 celdas",                  box.width("🎉"), 2)

-- ---------------------------------------------------------------------------
-- truncate
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== truncate ===\n")

assert_eq("texto más corto que el ancho se deja igual", box.truncate("hola", 10), "hola")
assert_eq("texto justo al ancho se deja igual",         box.truncate("hola", 4), "hola")
assert_eq("texto más largo se corta",                   box.truncate("hola mundo", 4), "hola")
assert_eq("corta por carácter, no por byte",            box.truncate("institución", 6), "instit")
assert_eq("ancho 0 devuelve vacío",                     box.truncate("hola", 0), "")
assert_eq("ancho negativo devuelve vacío",              box.truncate("hola", -1), "")
-- Un emoji ocupa 2 celdas: en un hueco de 3 solo cabe uno entero. Partirlo por
-- la mitad produciría bytes inválidos, así que sobra una celda a propósito.
assert_eq("no parte un carácter de doble ancho",        box.truncate("🎉🎉", 3), "🎉")
assert_eq("carácter más ancho que el hueco: vacío",     box.truncate("🎉", 1), "")

-- ---------------------------------------------------------------------------
-- wrap
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== wrap ===\n")

assert_lines("texto vacío da una línea vacía",  box.wrap("", 10), { "" })
assert_lines("nil da una línea vacía",          box.wrap(nil, 10), { "" })
assert_lines("solo espacios dan línea vacía",   box.wrap("   ", 10), { "" })
assert_lines("cabe entero en una línea",        box.wrap("hola mundo", 20), { "hola mundo" })
assert_lines("parte por espacios",              box.wrap("hola mundo", 5), { "hola", "mundo" })
assert_lines("varios espacios no dan líneas vacías",
  box.wrap("hola    mundo", 20), { "hola mundo" })
assert_lines("ancho 0 da una línea vacía",      box.wrap("hola mundo", 0), { "" })
assert_lines("ancho no numérico da una línea vacía",
  box.wrap("hola mundo", "ancho"), { "" })

-- Palabra que no cabe ni sola: se parte en trozos del ancho completo.
assert_lines("palabra más larga que el ancho se parte",
  box.wrap("supercalifragilistico", 5),
  { "super", "calif", "ragil", "istic", "o" })

-- El acento tiene que contar 1: en 11 celdas cabe entera.
assert_lines("palabra acentuada cabe por celdas, no por bytes",
  box.wrap("institución", 11), { "institución" })
assert_lines("palabra acentuada de 12 bytes no cabe en 10 celdas",
  box.wrap("institución", 10), { "institució", "n" })

assert_lines("frase en español respeta el ancho",
  box.wrap("por lo que omar dice en la reunión", 20),
  { "por lo que omar dice", "en la reunión" })

-- Ninguna línea puede desbordar, ni con texto real largo.
do
  local texto = "Confirmado en el transcript, y más fuerte de lo que apuntaba el "
             .. "comentario. Omar lo dice tres veces: «how can we embed it in our "
             .. "data warehouse» — y ahí está el encuadre."
  local lineas = box.wrap(texto, 42)
  local desborda = false
  for _, l in ipairs(lineas) do
    if box.width(l) > 42 then desborda = true end
  end
  assert_eq("texto largo real: ninguna línea desborda", desborda, false)
end

-- ---------------------------------------------------------------------------
-- pad
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== pad ===\n")

assert_eq("rellena con espacios hasta el ancho", box.pad("ab", 5), "ab   ")
assert_eq("texto justo no se toca",              box.pad("abcde", 5), "abcde")
assert_eq("texto largo se trunca al ancho",      box.pad("abcdefg", 5), "abcde")
assert_eq("vacío da solo espacios",              box.pad("", 3), "   ")
assert_eq("nil da solo espacios",                box.pad(nil, 3), "   ")
assert_eq("ancho 0 da vacío",                    box.pad("ab", 0), "")

-- La razón de ser del módulo: el relleno se mide en celdas.
assert_eq("acento: rellena por celdas",   box.width(box.pad("institución", 15)), 15)
assert_eq("emoji: rellena por celdas",    box.width(box.pad("🎉", 5)), 5)
-- 2 celdas del emoji no caben en el hueco impar: se trunca y se rellena.
assert_eq("emoji en ancho impar cuadra",  box.width(box.pad("🎉🎉", 3)), 3)

-- ---------------------------------------------------------------------------
-- wrap + pad: todas las líneas de una caja miden lo mismo
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== wrap + pad componen una caja ===\n")

do
  local texto = "por lo que omar dice en la reunión, a él le interesa presentar "
             .. "behavioral como un layer completo para la institución"
  local lineas = vim.tbl_map(function(l) return box.pad(l, 30) end, box.wrap(texto, 30))
  assert_all_width("todas las líneas miden 30 celdas", lineas, 30)
end

do
  local lineas = vim.tbl_map(function(l) return box.pad(l, 12) end,
    box.wrap("«nudge» — 🎉 fin", 12))
  assert_all_width("mezcla de comillas, guion y emoji cuadra", lineas, 12)
end

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
io.stderr:write(string.format("\n%d passed, %d failed\n", pass, fail))

if fail > 0 then
  vim.cmd("cq")
end

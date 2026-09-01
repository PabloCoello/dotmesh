--- tests/resolve_spec.lua — Runner headless para mesh_review.resolve
---
--- No depende de plenary ni de ningún plugin: solo usa la API estándar de Neovim.
--- Termina con `vim.cmd("cq")` (exit 1) si alguna aserción falla; si todos pasan,
--- el `-c "qa!"` exterior da exit 0.
---
--- Cómo ejecutar (requiere ruta absoluta para que debug.getinfo resuelva el módulo):
---
---   SPEC=$(realpath nvim/.config/nvim/tests/resolve_spec.lua)
---   timeout 60 ~/.local/bin/nvim --headless -u NONE -c "luafile $SPEC" -c "qa!"
---
--- Nota sobre el plan (C9): el plan indica char_offset=9 para "bar" en
---   {"aaa","foo bar baz"}, pero el valor correcto es 8 (comprobado con
---   'aaa\nfoo bar baz'.indexOf('bar') en JS). La diferencia es una errata en
---   el plan; la implementación usa el valor correcto.

-- ---------------------------------------------------------------------------
-- Localizar el módulo a partir de la ruta de este fichero.
-- luafile con ruta absoluta produce source = "@/ruta/absoluta/...".
-- ---------------------------------------------------------------------------
local src = debug.getinfo(1, "S").source:match("^@?(.+)$")
if not src or not src:match("^/") then
  io.stderr:write(
    "ERROR: ejecuta con ruta absoluta:\n" ..
    "  SPEC=$(realpath nvim/.config/nvim/tests/resolve_spec.lua)\n" ..
    "  timeout 60 ~/.local/bin/nvim --headless -u NONE -c \"luafile $SPEC\" -c qa!\n"
  )
  vim.cmd("cq")
  return
end

local test_dir = src:match("(.+)/[^/]+$")
-- fnamemodify ":p" normaliza ".." y devuelve ruta absoluta con "/" final.
local lua_dir = vim.fn.fnamemodify(test_dir .. "/../lua/", ":p")
package.path = lua_dir .. "?.lua;" .. lua_dir .. "?/init.lua;" .. package.path

local ok, resolve = pcall(require, "mesh_review.resolve")
if not ok then
  io.stderr:write("ERROR cargando mesh_review.resolve: " .. tostring(resolve) .. "\n")
  vim.cmd("cq")
  return
end

-- ---------------------------------------------------------------------------
-- Mini-runner
-- ---------------------------------------------------------------------------
local pass = 0
local fail = 0

--- Verifica que `got` es nil.
local function assert_nil(desc, got)
  if got == nil then
    io.stderr:write("  ok  " .. desc .. "\n")
    pass = pass + 1
  else
    io.stderr:write(
      string.format("  FAIL %s  esperaba nil, got={%s,%s→%s,%s unc=%s}\n",
        desc,
        tostring(got.start_row), tostring(got.start_col),
        tostring(got.end_row),   tostring(got.end_col),
        tostring(got.uncertain))
    )
    fail = fail + 1
  end
end

--- Verifica que `got` coincide con la tabla `expected`.
--- expected = { start_row, start_col, end_row, end_col, uncertain }
local function assert_range(desc, got, expected)
  if got == nil then
    io.stderr:write(
      string.format("  FAIL %s  got=nil, esperaba={%d,%d→%d,%d unc=%s}\n",
        desc,
        expected.start_row, expected.start_col,
        expected.end_row,   expected.end_col,
        tostring(expected.uncertain))
    )
    fail = fail + 1
    return
  end
  if  got.start_row == expected.start_row
  and got.start_col == expected.start_col
  and got.end_row   == expected.end_row
  and got.end_col   == expected.end_col
  and got.uncertain == expected.uncertain then
    io.stderr:write("  ok  " .. desc .. "\n")
    pass = pass + 1
  else
    io.stderr:write(
      string.format("  FAIL %s\n    got={%d,%d→%d,%d unc=%s}\n    exp={%d,%d→%d,%d unc=%s}\n",
        desc,
        got.start_row, got.start_col, got.end_row, got.end_col, tostring(got.uncertain),
        expected.start_row, expected.start_col, expected.end_row, expected.end_col,
        tostring(expected.uncertain))
    )
    fail = fail + 1
  end
end

--- Crea un buffer de scratch con el contenido dado (array de líneas).
local function make_buf(lines)
  local bufnr = vim.api.nvim_create_buf(false, true)  -- unlisted, scratch
  vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
  return bufnr
end

-- ---------------------------------------------------------------------------
-- Guardias: entradas inválidas → nil
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== guardias (nil) ===\n")

-- quote nil → nil
do
  local b = make_buf({"foo"})
  assert_nil("quote nil → nil", resolve.find_quote(b, nil, 0))
end

-- quote vacía → nil
do
  local b = make_buf({"foo"})
  assert_nil("quote vacía → nil", resolve.find_quote(b, "", 0))
end

-- buffer con una línea vacía y quote ausente → nil
do
  local b = make_buf({""})
  assert_nil("buffer vacío + quote ausente → nil", resolve.find_quote(b, "foo", 0))
end

-- buffer de cero líneas → nil
do
  local b = make_buf({})
  assert_nil("make_buf({}) → nil", resolve.find_quote(b, "foo", 0))
end

-- quote ausente del buffer → nil
do
  local b = make_buf({"foo bar baz"})
  assert_nil("quote ausente → nil", resolve.find_quote(b, "xyz", 0))
end

-- ---------------------------------------------------------------------------
-- Match simple en primera línea
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== match simple ===\n")

-- {"foo bar baz"}, quote="bar", char_offset=4 → {0,4→0,7 uncertain=false}
-- Verificado: "foo bar baz".indexOf("bar") == 4 (UTF-16/ASCII coinciden).
do
  local b = make_buf({"foo bar baz"})
  assert_range("match simple primera línea",
    resolve.find_quote(b, "bar", 4),
    { start_row=0, start_col=4, end_row=0, end_col=7, uncertain=false })
end

-- Match al inicio de línea
do
  local b = make_buf({"hello world"})
  assert_range("match al inicio",
    resolve.find_quote(b, "hello", 0),
    { start_row=0, start_col=0, end_row=0, end_col=5, uncertain=false })
end

-- Match al final de línea
do
  local b = make_buf({"foo bar"})
  assert_range("match al final",
    resolve.find_quote(b, "bar", 4),
    { start_row=0, start_col=4, end_row=0, end_col=7, uncertain=false })
end

-- ---------------------------------------------------------------------------
-- Match en segunda línea (buffer de varias líneas)
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== segunda línea ===\n")

-- {"aaa", "foo bar baz"}, quote="bar", char_offset=8
-- 'aaa\nfoo bar baz'.indexOf('bar') == 8 en JS (UTF-16 absoluto).
-- El plan indicaba 9 por error; el valor correcto es 8.
do
  local b = make_buf({"aaa", "foo bar baz"})
  assert_range("match en segunda línea (char_offset=8)",
    resolve.find_quote(b, "bar", 8),
    { start_row=1, start_col=4, end_row=1, end_col=7, uncertain=false })
end

-- Tres líneas, match en la tercera
do
  local b = make_buf({"aa", "bb", "cc foo dd"})
  -- "aa\nbb\ncc foo dd".indexOf("foo") == 9 en JS
  assert_range("match en tercera línea",
    resolve.find_quote(b, "foo", 9),
    { start_row=2, start_col=3, end_row=2, end_col=6, uncertain=false })
end

-- ---------------------------------------------------------------------------
-- Dos ocurrencias: gana la más cercana a char_offset
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== dos ocurrencias ===\n")

-- {"abc abc"}: primera en col=0 (utf16=0), segunda en col=4 (utf16=4).
-- Con char_offset=5 → dist0=5, dist1=1 → segunda gana.
do
  local b = make_buf({"abc abc"})
  assert_range("dos ocurrencias → gana la segunda (char_offset=5)",
    resolve.find_quote(b, "abc", 5),
    { start_row=0, start_col=4, end_row=0, end_col=7, uncertain=false })
end

-- Con char_offset=1 → dist0=1, dist1=3 → primera gana.
do
  local b = make_buf({"abc abc"})
  assert_range("dos ocurrencias → gana la primera (char_offset=1)",
    resolve.find_quote(b, "abc", 1),
    { start_row=0, start_col=0, end_row=0, end_col=3, uncertain=false })
end

-- ---------------------------------------------------------------------------
-- uncertain = true cuando la distancia supera 200
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== uncertain ===\n")

-- {"foo"}: única ocurrencia en utf16=0; char_offset=300 → dist=300 > 200.
do
  local b = make_buf({"foo"})
  assert_range("distancia 300 > 200 → uncertain=true",
    resolve.find_quote(b, "foo", 300),
    { start_row=0, start_col=0, end_row=0, end_col=3, uncertain=true })
end

-- dist=200 exactos: en el límite, NO es incierto (> 200, no >=).
do
  local b = make_buf({"foo"})
  assert_range("distancia exacta 200 → uncertain=false",
    resolve.find_quote(b, "foo", 200),
    { start_row=0, start_col=0, end_row=0, end_col=3, uncertain=false })
end

-- dist=201 → uncertain=true
do
  local b = make_buf({"foo"})
  assert_range("distancia 201 → uncertain=true",
    resolve.find_quote(b, "foo", 201),
    { start_row=0, start_col=0, end_row=0, end_col=3, uncertain=true })
end

-- ---------------------------------------------------------------------------
-- Quote multilínea
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== multilínea ===\n")

-- {"hello", "world"}, quote="hello\nworld" → rango desde (0,0) hasta (1,5).
-- byte_end_inclusive para "hello\nworld" (11 bytes): texto concatenado es
-- "hello\nworld"; byte 11 (1-indexed) es 'd', en row=1, col=4, end_col=5.
do
  local b = make_buf({"hello", "world"})
  assert_range("quote multilínea completa",
    resolve.find_quote(b, "hello\nworld", 0),
    { start_row=0, start_col=0, end_row=1, end_col=5, uncertain=false })
end

-- Quote que empieza al final de la primera línea y termina en la segunda.
-- {"foo bar", "baz"}, quote="bar\nbaz" → empieza en col=4 de fila 0.
-- "foo bar\nbaz".indexOf("bar\nbaz") == 4 (UTF-16/ASCII).
-- end: "bar\nbaz" tiene 7 bytes; byte_end_inclusive en texto = 4+7-1+1 = 11
--   ↑ byte_start = posición 1-indexed = 5 (col=4 → byte_start=5)
--   byte_end_inclusive = 5+7-1 = 11
-- text = "foo bar\nbaz" (11 bytes)
-- text_pos_to_rowcol({"foo bar","baz"}, 11):
--   p=1, "foo bar"=7, 11 <= 7? No. 11==8? No. p=9.
--   "baz"=3, 11 <= 9+3-1=11? Yes. col=11-9=2. end_col=3.
do
  local b = make_buf({"foo bar", "baz"})
  assert_range("quote multilínea parcial",
    resolve.find_quote(b, "bar\nbaz", 4),
    { start_row=0, start_col=4, end_row=1, end_col=3, uncertain=false })
end

-- Cita que termina en salto de línea. Es el caso que produce una selección
-- visual por caracteres que baja hasta una línea vacía: end_offset acaba siendo
-- el inicio de la línea siguiente, así que la cita del sidecar se lleva el '\n'.
-- El fin exclusivo correcto es (fila siguiente, col 0), NO (fila actual, #linea+1),
-- que nvim_buf_set_extmark rechaza con "Invalid 'end_col': out of range".
do
  local b = make_buf({"## Slide 1", "", "texto"})
  assert_range("cita terminada en \\n → fin en la fila siguiente",
    resolve.find_quote(b, " Slide 1\n", 2),
    { start_row=0, start_col=2, end_row=1, end_col=0, uncertain=false })
end

-- Varias líneas terminando en '\n': el fin cae al inicio de la línea posterior.
do
  local b = make_buf({"uno", "dos", "tres"})
  assert_range("cita multilínea terminada en \\n",
    resolve.find_quote(b, "uno\ndos\n", 0),
    { start_row=0, start_col=0, end_row=2, end_col=0, uncertain=false })
end

-- Cita terminada en '\n' cuando la línea siguiente es la última y está vacía:
-- el fin es (última fila, 0), dentro del buffer.
do
  local b = make_buf({"solo", ""})
  assert_range("cita terminada en \\n con última línea vacía",
    resolve.find_quote(b, "solo\n", 0),
    { start_row=0, start_col=0, end_row=1, end_col=0, uncertain=false })
end

-- ---------------------------------------------------------------------------
-- Caracteres especiales de patrón Lua (%, ., -, (, ), [)
-- plain=true en string.find los trata como literales, no como metacaracteres.
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== caracteres especiales de patrón Lua ===\n")

-- quote con "%" — en modo patrón "%f" sería un ancla de frontera
do
  local b = make_buf({"precio: 50% descuento"})
  -- "50%" empieza en byte 9 (1-indexed), col=8 (0-indexed), todo ASCII
  assert_range("quote con % (literal, no patrón)",
    resolve.find_quote(b, "50%", 8),
    { start_row=0, start_col=8, end_row=0, end_col=11, uncertain=false })
end

-- quote con "(" y ")" — metacaracteres de captura en modo patrón
do
  local b = make_buf({"texto (con) paréntesis"})
  -- "(con)" empieza en byte 7 (1-indexed), col=6, todo ASCII
  assert_range("quote con paréntesis (literal)",
    resolve.find_quote(b, "(con)", 6),
    { start_row=0, start_col=6, end_row=0, end_col=11, uncertain=false })
end

-- quote con "." y "-" — any-char y lazy-repeat en modo patrón
do
  local b = make_buf({"a.b-c end"})
  -- "a.b-c" empieza en col=0
  assert_range("quote con punto y guión (literales)",
    resolve.find_quote(b, "a.b-c", 0),
    { start_row=0, start_col=0, end_row=0, end_col=5, uncertain=false })
end

-- quote con "[" — inicio de clase de caracteres en modo patrón
do
  local b = make_buf({"lista [a,b,c] fin"})
  -- "[a,b,c]" empieza en byte 7 (1-indexed), col=6, todo ASCII
  assert_range("quote con corchetes (literales)",
    resolve.find_quote(b, "[a,b,c]", 6),
    { start_row=0, start_col=6, end_row=0, end_col=13, uncertain=false })
end

-- ---------------------------------------------------------------------------
-- Caracteres multibyte: acentos (BMP) y emoji (fuera del BMP)
-- Verifica que el mapeo byte↔UTF-16 no se desalinea con multibyte.
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== caracteres multibyte ===\n")

-- Acentos BMP: "café résumé"
-- "café" = 5 bytes (UTF-8), "résumé" = 8 bytes (UTF-8)
-- En UTF-16, "café " ocupa 5 unidades de código (é=1 unidad, BMP).
-- 'café résumé'.indexOf('résumé') == 5 en JS.
-- start_col en bytes = #"café " = 6 bytes (0-indexed).
-- end_col = start_col + #"résumé" = 6 + 8 = 14 (exclusivo en bytes).
do
  local b = make_buf({"café résumé"})
  assert_range("acentos BMP (café résumé)",
    resolve.find_quote(b, "résumé", 5),
    { start_row=0, start_col=6, end_row=0, end_col=14, uncertain=false })
end

-- Emoji fuera del BMP: "a🎉z"
-- "a🎉z" = 6 bytes (a=1, 🎉=4, z=1).
-- '🎉' en UTF-16 ocupa 2 unidades de código (par sustituto).
-- 'a🎉z'.indexOf('🎉') == 1 en JS (UTF-16 offset).
-- start_col en bytes = 1 (byte 'a').
-- end_col = 1 + 4 = 5 (byte después del emoji, exclusivo).
do
  local b = make_buf({"a🎉z"})
  assert_range("emoji fuera del BMP (a🎉z)",
    resolve.find_quote(b, "🎉", 1),
    { start_row=0, start_col=1, end_row=0, end_col=5, uncertain=false })
end

-- Mix: buffer multilínea con emoji en primera línea, búsqueda en segunda.
-- {"a🎉b", "hola"}: "hola" empieza en UTF-16 offset a+🎉+b+\n = 1+2+1+1 = 5.
-- start_col = 0 (bytes), end_col = 4.
do
  local b = make_buf({"a🎉b", "hola"})
  assert_range("emoji en línea anterior, match en segunda",
    resolve.find_quote(b, "hola", 5),
    { start_row=1, start_col=0, end_row=1, end_col=4, uncertain=false })
end

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
io.stderr:write(string.format("\n%d passed, %d failed\n", pass, fail))

if fail > 0 then
  vim.cmd("cq")  -- exit 1
end
-- Si llegamos aquí, el -c "qa!" exterior da exit 0.

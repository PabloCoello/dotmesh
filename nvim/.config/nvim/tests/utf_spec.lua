--- tests/utf_spec.lua — Runner mínimo headless para mesh_review.utf
---
--- No depende de plenary ni de ningún plugin: solo usa la API estándar de Neovim.
--- Salida por stderr (visible en headless). Termina con `vim.cmd("cq")` (exit 1)
--- si alguna aserción falla; si todos pasan, el comando -c "qa" posterior da exit 0.
---
--- Cómo ejecutar (requiere ruta absoluta para que debug.getinfo resuelva el módulo):
---
---   SPEC=$(realpath nvim/.config/nvim/tests/utf_spec.lua)   # desde la raíz del repo
---   ~/.local/bin/nvim --headless -u NONE -c "luafile $SPEC" -c "qa"
---
--- O tras `make stow`:
---
---   ~/.local/bin/nvim --headless -u NONE \
---     -c "luafile $HOME/.config/nvim/tests/utf_spec.lua" -c "qa"
---
--- Resultado esperado: "N passed, 0 failed" en stderr y exit 0.

-- ---------------------------------------------------------------------------
-- Localizar el módulo a partir de la ruta de este fichero.
-- luafile con ruta absoluta produce source = "@/ruta/absoluta/...".
-- ---------------------------------------------------------------------------
local src = debug.getinfo(1, "S").source:match("^@?(.+)$")
if not src or not src:match("^/") then
  io.stderr:write(
    "ERROR: ejecuta con ruta absoluta:\n" ..
    "  SPEC=$(realpath nvim/.config/nvim/tests/utf_spec.lua)\n" ..
    "  ~/.local/bin/nvim --headless -u NONE -c \"luafile $SPEC\" -c qa\n"
  )
  vim.cmd("cq")
  return
end

local test_dir = src:match("(.+)/[^/]+$")
-- fnamemodify ":p" normaliza ".." y devuelve ruta absoluta con "/" final
local lua_dir = vim.fn.fnamemodify(test_dir .. "/../lua/", ":p")
package.path = lua_dir .. "?.lua;" .. lua_dir .. "?/init.lua;" .. package.path

local ok, utf = pcall(require, "mesh_review.utf")
if not ok then
  io.stderr:write("ERROR cargando mesh_review.utf: " .. tostring(utf) .. "\n")
  vim.cmd("cq")
  return
end

-- ---------------------------------------------------------------------------
-- Mini-runner
-- ---------------------------------------------------------------------------
local pass = 0
local fail = 0

local function eq(desc, got, expected)
  if got == expected then
    io.stderr:write("  ok  " .. desc .. "\n")
    pass = pass + 1
  else
    io.stderr:write(
      "  FAIL " .. desc ..
      "  got=" .. tostring(got) ..
      "  expected=" .. tostring(expected) .. "\n"
    )
    fail = fail + 1
  end
end

local function eq_pos(desc, got, expected)
  if type(got) == "table" and got.row == expected.row and got.col == expected.col then
    io.stderr:write("  ok  " .. desc .. "\n")
    pass = pass + 1
  else
    local gs = type(got) == "table"
      and ("{row=" .. tostring(got.row) .. ", col=" .. tostring(got.col) .. "}")
      or tostring(got)
    io.stderr:write(
      "  FAIL " .. desc ..
      "  got=" .. gs ..
      "  expected={row=" .. tostring(expected.row) .. ", col=" .. tostring(expected.col) .. "}\n"
    )
    fail = fail + 1
  end
end

--- Crea un buffer de scratch con el contenido dado (una tabla de líneas).
local function make_buf(lines)
  local bufnr = vim.api.nvim_create_buf(false, true)  -- unlisted, scratch
  vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
  return bufnr
end

-- ---------------------------------------------------------------------------
-- to_utf16
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== to_utf16 ===\n")

-- ASCII puro: "hello", (0, 3) → 3
do
  local b = make_buf({ "hello" })
  eq("ASCII puro (0,3)", utf.to_utf16(b, 0, 3), 3)
end

-- Acento básico: "café", (0, 5) → 4
-- UTF-8: c(1) a(1) f(1) é(2) = 5 bytes; é = 1 unidad UTF-16 → total 4
do
  local b = make_buf({ "café" })
  eq("Acento básico (0,5)", utf.to_utf16(b, 0, 5), 4)
end

-- Emoji fuera del BMP: "🎉", (0, 4) → 2
-- 🎉 = 4 bytes UTF-8 = surrogate pair = 2 unidades UTF-16
do
  local b = make_buf({ "🎉" })
  eq("Emoji fuera BMP (0,4)", utf.to_utf16(b, 0, 4), 2)
end

-- Mixto tras emoji: "a🎉b", (0, 5) → 3
-- a=1u, 🎉=2u; b empieza en byte 5 → offset 3
do
  local b = make_buf({ "a🎉b" })
  eq("Mixto tras emoji (0,5)", utf.to_utf16(b, 0, 5), 3)
end

-- Segunda línea: {"ab","cd"}, (1, 1) → 4
-- línea 0: "ab"=2u +1(\n)=3; línea 1: "c"=1u → 4
do
  local b = make_buf({ "ab", "cd" })
  eq("Segunda línea (1,1)", utf.to_utf16(b, 1, 1), 4)
end

-- Acento en segunda línea: {"ab","café"}, (1, 5) → 7
-- línea 0: 2+1=3; "café"[0..5 bytes)=4u → 7
do
  local b = make_buf({ "ab", "café" })
  eq("Acento segunda línea (1,5)", utf.to_utf16(b, 1, 5), 7)
end

-- Múltiples acentos: "résumé", (0, 8) → 6
-- r(1)é(2)s(1)u(1)m(1)é(2) = 8 bytes → 6 unidades UTF-16
do
  local b = make_buf({ "résumé" })
  eq("Múltiples acentos (0,8)", utf.to_utf16(b, 0, 8), 6)
end

-- Línea vacía: {""}, (0, 0) → 0
do
  local b = make_buf({ "" })
  eq("Línea vacía (0,0)", utf.to_utf16(b, 0, 0), 0)
end

-- Inicio de línea: (1, 0) → longitud de línea 0 + 1
-- {"ab","cd"}, (1, 0) → 3
do
  local b = make_buf({ "ab", "cd" })
  eq("Inicio de segunda línea (1,0)", utf.to_utf16(b, 1, 0), 3)
end

-- Tercera línea: {"a","b","c"}, (2, 1) → 5
-- línea 0: 1+1=2; línea 1: 1+1=2; línea 2: "c"[0..1)=1 → 5
do
  local b = make_buf({ "a", "b", "c" })
  eq("Tercera línea (2,1)", utf.to_utf16(b, 2, 1), 5)
end

-- Buffer de una sola línea: (0, 0) → 0
do
  local b = make_buf({ "hola" })
  eq("Buffer una línea (0,0)", utf.to_utf16(b, 0, 0), 0)
end

-- ---------------------------------------------------------------------------
-- from_utf16
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== from_utf16 ===\n")

do
  local b = make_buf({ "hello" })
  eq_pos("ASCII puro offset 3", utf.from_utf16(b, 3), { row = 0, col = 3 })
end

do
  local b = make_buf({ "café" })
  eq_pos("Acento offset 4", utf.from_utf16(b, 4), { row = 0, col = 5 })
end

do
  local b = make_buf({ "🎉" })
  eq_pos("Emoji offset 2", utf.from_utf16(b, 2), { row = 0, col = 4 })
end

do
  local b = make_buf({ "a🎉b" })
  eq_pos("Mixto offset 3", utf.from_utf16(b, 3), { row = 0, col = 5 })
end

do
  local b = make_buf({ "ab", "cd" })
  eq_pos("Segunda línea offset 4", utf.from_utf16(b, 4), { row = 1, col = 1 })
end

do
  local b = make_buf({ "ab", "café" })
  eq_pos("Acento segunda línea offset 7", utf.from_utf16(b, 7), { row = 1, col = 5 })
end

-- Inicio de segunda línea: offset 3 → (1, 0)
do
  local b = make_buf({ "ab", "cd" })
  eq_pos("Inicio segunda línea offset 3", utf.from_utf16(b, 3), { row = 1, col = 0 })
end

-- Línea vacía: offset 0 → (0, 0)
do
  local b = make_buf({ "" })
  eq_pos("Línea vacía offset 0", utf.from_utf16(b, 0), { row = 0, col = 0 })
end

-- ---------------------------------------------------------------------------
-- Ida y vuelta: from_utf16(to_utf16(x)) == x en todos los casos
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== round-trip ===\n")

local function roundtrip(desc, lines_table, row, col)
  local b = make_buf(lines_table)
  local offset = utf.to_utf16(b, row, col)
  local back   = utf.from_utf16(b, offset)
  eq_pos("RT " .. desc, back, { row = row, col = col })
end

roundtrip("ASCII puro",           { "hello" },       0, 3)
roundtrip("Acento básico",        { "café" },        0, 5)
roundtrip("Emoji fuera BMP",      { "🎉" },          0, 4)
roundtrip("Mixto tras emoji",     { "a🎉b" },        0, 5)
roundtrip("Segunda línea",        { "ab", "cd" },    1, 1)
roundtrip("Acento segunda línea", { "ab", "café" },  1, 5)
roundtrip("Múltiples acentos",    { "résumé" },      0, 8)
roundtrip("Línea vacía",          { "" },            0, 0)
roundtrip("Inicio segunda línea", { "ab", "cd" },    1, 0)
roundtrip("Tercera línea",        { "a", "b", "c" }, 2, 1)
roundtrip("Una línea inicio",     { "hola" },        0, 0)

-- ---------------------------------------------------------------------------
-- Casos límite y entradas fuera de rango
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== casos límite ===\n")

-- row fuera del buffer: se acota al último row válido.
-- Buffer {"a","b","c"} tiene filas 0-2. row=5 → acota a row=2.
-- to_utf16(row=2, col=0): línea 0 "a"→1+1=2; línea 1 "b"→1+1=4; "c"[0..0)=0 → 4
do
  local b = make_buf({ "a", "b", "c" })
  eq("row fuera de rango (5→2), sin error", utf.to_utf16(b, 5, 0), 4)
end

-- col más allá del fin de línea: se acota a #line.
-- "hello" tiene 5 bytes. col=9 → acota a 5 → offset 5.
do
  local b = make_buf({ "hello" })
  eq("col mayor que línea (9→5), sin error", utf.to_utf16(b, 0, 9), 5)
end

-- col negativo: se acota a 0.
do
  local b = make_buf({ "hello" })
  eq("col negativo (-1→0), sin error", utf.to_utf16(b, 0, -1), 0)
end

-- offset negativo en from_utf16: devuelve nil (mismo contrato que pasado del final).
do
  local b = make_buf({ "hello" })
  eq("offset negativo (-1→nil)", utf.from_utf16(b, -1), nil)
end

-- offset pasado del final: devuelve nil.
do
  local b = make_buf({ "hello" })
  eq("offset pasado del final (999→nil)", utf.from_utf16(b, 999), nil)
end

-- v:maxcol (2147483647): en modo V Neovim asigna esta columna a la marca '>.
-- El plugin (PR C) pasa esa columna directamente a to_utf16 al abrir un hilo.
-- Con "hello" (5 bytes), debe acotar a 5 y devolver el offset del fin de línea,
-- que es la semántica correcta para «hasta el último byte de la línea».
do
  local b = make_buf({ "hello" })
  eq("v:maxcol (2147483647) acota a fin de línea", utf.to_utf16(b, 0, 2147483647), 5)
end

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
io.stderr:write(string.format("\n%d passed, %d failed\n", pass, fail))

if fail > 0 then
  vim.cmd("cq")  -- exit 1
end
-- Si llegamos aquí, el -c "qa" exterior da exit 0.

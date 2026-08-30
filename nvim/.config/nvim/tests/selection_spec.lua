--- tests/selection_spec.lua — Runner headless para M._selection_range
---
--- Prueba la función que lee la selección visual activa (v y .) en lugar de las
--- marcas '< y '> (que devuelven la selección ANTERIOR cuando el keymap corre
--- en modo visual). Cubre: selección hacia delante, hacia atrás, línea completa
--- (V), multilínea (V), texto con acentos y texto con emoji.
---
--- No depende de plenary ni de ningún plugin: solo API estándar de Neovim.
--- Termina con vim.cmd("cq") (exit 1) si alguna aserción falla.
---
--- Cómo ejecutar (requiere ruta absoluta para que debug.getinfo resuelva el módulo):
---
---   SPEC=$(realpath nvim/.config/nvim/tests/selection_spec.lua)
---   timeout 60 ~/.local/bin/nvim --headless -u NONE \
---     -c "luafile $SPEC" -c "qa!"
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
    "  SPEC=$(realpath nvim/.config/nvim/tests/selection_spec.lua)\n" ..
    "  timeout 60 ~/.local/bin/nvim --headless -u NONE" ..
    " -c \"luafile $SPEC\" -c \"qa!\"\n"
  )
  vim.cmd("cq")
  return
end

-- Derivar el directorio lua/ a partir de la ruta de este spec.
local test_dir = src:match("(.+)/[^/]+$")
local lua_dir  = vim.fn.fnamemodify(test_dir .. "/../lua/", ":p")
package.path   = lua_dir .. "?.lua;" .. lua_dir .. "?/init.lua;" .. package.path

-- Cargar el módulo bajo prueba. Necesitamos mesh_review.init (que a su vez
-- requiere mesh_review.utf, mesh_review.types, mesh_review.cli, etc.). Para
-- no activar el CLI, cargamos directamente mesh_review.init e invocamos solo
-- _selection_range, que no toca el CLI en absoluto.
-- Las dependencias mesh_review.anchor y mesh_review.panel también se importan;
-- como sus APIs de Neovim se usan solo al llamar a sus funciones (no al nivel
-- del módulo), cargan sin error en headless.
local ok, mesh = pcall(require, "mesh_review.init")
if not ok then
  io.stderr:write("ERROR cargando mesh_review.init: " .. tostring(mesh) .. "\n")
  vim.cmd("cq")
  return
end

-- También cargamos utf directamente para calcular valores esperados en los tests.
local ok2, utf = pcall(require, "mesh_review.utf")
if not ok2 then
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

--- Crea un buffer de scratch con las líneas dadas, lo convierte en el buffer
--- actual del window por defecto y devuelve su número.
local function make_current_buf(lines)
  local bufnr = vim.api.nvim_create_buf(false, true)   -- unlisted, scratch
  vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
  -- set_current_buf es necesario para que los comandos normal! usen este buffer.
  vim.api.nvim_set_current_buf(bufnr)
  return bufnr
end

-- ---------------------------------------------------------------------------
-- Helpers: valor esperado de to_utf16 para el fin de línea completa.
-- ---------------------------------------------------------------------------

--- Calcula el offset UTF-16 del final de la línea r en el buffer bufnr,
--- equivalente a pasar v:maxcol (acotado a la longitud real de la línea).
local function line_end_utf16(bufnr, r)
  return utf.to_utf16(bufnr, r, 2147483647)
end

-- ---------------------------------------------------------------------------
-- Test 1: selección ASCII hacia delante
-- Buffer: {"hello world"}, seleccionar "hello" con v4l desde 'h'.
-- Ancla 'v' en col 0 ('h'), cursor '.' en col 4 ('o').
-- Esperado: offset=0, end_offset=5
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== selección ASCII hacia delante ===\n")
do
  local b = make_current_buf({ "hello world" })
  -- gg → primera línea; 0 → col 0; v → modo visual; 4l → 4 chars derecha
  vim.cmd("normal! gg0v4l")
  local off, eoff = mesh._selection_range(b)
  -- Salir del modo visual para no contaminar el siguiente test.
  vim.cmd("normal! \27")
  eq("offset inicio (ASCII fwd)", off,  0)
  eq("offset fin   (ASCII fwd)", eoff, 5)
end

-- ---------------------------------------------------------------------------
-- Test 2: selección ASCII hacia atrás
-- Buffer: {"hello world"}, cursor en col 4 ('o'), visual 4h hasta 'h'.
-- Ancla 'v' en col 4, cursor '.' en col 0 → normalizar → mismo resultado.
-- Esperado: offset=0, end_offset=5
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== selección ASCII hacia atrás ===\n")
do
  local b = make_current_buf({ "hello world" })
  -- gg → l1; 0 → col 0; 4l → col 4 ('o'); v → visual; 4h → col 0 ('h')
  vim.cmd("normal! gg04lv4h")
  local off, eoff = mesh._selection_range(b)
  vim.cmd("normal! \27")
  eq("offset inicio (ASCII bwd)", off,  0)
  eq("offset fin   (ASCII bwd)", eoff, 5)
end

-- ---------------------------------------------------------------------------
-- Test 3: selección de línea completa (modo V)
-- Buffer: {"hello world"} (11 bytes = 11 UTF-16 units).
-- Esperado: offset=0, end_offset=11
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== selección de línea completa (V) ===\n")
do
  local b = make_current_buf({ "hello world" })
  vim.cmd("normal! ggV")
  local off, eoff = mesh._selection_range(b)
  vim.cmd("normal! \27")
  local expected_end = line_end_utf16(b, 0)
  eq("offset inicio (V single)", off,  0)
  eq("offset fin   (V single)", eoff, expected_end)
  eq("fin de línea = 11",       expected_end, 11)
end

-- ---------------------------------------------------------------------------
-- Test 4: selección multilínea (modo V)
-- Buffer: {"hello", "world"}.
-- "hello" = 5 UTF-16 + 1 (\n) = 6; "world" = 5 UTF-16. Total hasta fin = 11.
-- Esperado: offset=0, end_offset=11
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== selección multilínea (V) ===\n")
do
  local b = make_current_buf({ "hello", "world" })
  -- ggV → V en línea 0; j → bajar a línea 1
  vim.cmd("normal! ggVj")
  local off, eoff = mesh._selection_range(b)
  vim.cmd("normal! \27")
  local expected_end = line_end_utf16(b, 1)  -- fin de "world" = 5 UTF-16 desde inicio de l1
  -- offset acumulado: "hello"(5) + \n(1) + "world"(5) = 11
  eq("offset inicio (V multi)", off,  0)
  eq("offset fin   (V multi)", eoff, expected_end)
  eq("fin V multi = 11",        expected_end, 11)
end

-- ---------------------------------------------------------------------------
-- Test 5: selección con acento (multibyte UTF-8)
-- Buffer: {"café"} — "café" = c(1)+a(1)+f(1)+é(2) = 5 bytes = 4 UTF-16 units.
-- Seleccionar toda la palabra con v$ (cursor acaba en 'é', byte 3, col 4 en
-- 1-indexed → c_col = 3 en 0-indexed).
-- offset = 0; end_offset = to_utf16(buf, 0, 4) = 4 (é completo).
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== selección con acento (multibyte) ===\n")
do
  local b = make_current_buf({ "café" })
  -- gg0 → col 0; v → visual; $ → hasta el final de línea (cursor en 'é')
  vim.cmd("normal! gg0v$")
  local off, eoff = mesh._selection_range(b)
  vim.cmd("normal! \27")
  -- Valor esperado calculado a mano:
  --   to_utf16(buf, 0, 0) = 0
  --   $ deja el cursor en 'é' → getpos(".") da col=4 (1-indexed) → c_col=3
  --   end_col + 1 = 4; to_utf16(buf, 0, 4):
  --     "café"[0..4 bytes): c+a+f + 1.er byte de é (incompleto) → str_utfindex
  --     extiende al siguiente límite: é completo = 4 UTF-16 units.
  eq("offset inicio (acento)", off,  0)
  eq("offset fin   (acento)", eoff, 4)
end

-- ---------------------------------------------------------------------------
-- Test 6: selección con emoji (carácter fuera del BMP)
-- Buffer: {"a🎉b"} — a(1)+🎉(4)+b(1) = 6 bytes; a=1u, 🎉=2u, b=1u = 4 UTF-16.
-- Seleccionar "a🎉" con v1l (cursor en 'a', 1l mueve al emoji):
--   ancla 'v' en col 0 ('a'); cursor '.' en col 1 (byte 1, inicio de 🎉).
--   end_col=1; end_col+1=2.
--   to_utf16(buf, 0, 2): bytes 0..2 = a + 1.er byte de 🎉 → extiende al emoji
--   completo → a(1) + 🎉(2) = 3 UTF-16 units.
-- Esperado: offset=0, end_offset=3
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== selección con emoji (fuera del BMP) ===\n")
do
  local b = make_current_buf({ "a\240\159\142\137b" })  -- "a🎉b"
  -- gg0 → col 0 ('a'); v → visual; 1l → mover 1 char derecha (al emoji)
  vim.cmd("normal! gg0v1l")
  local off, eoff = mesh._selection_range(b)
  vim.cmd("normal! \27")
  eq("offset inicio (emoji)", off,  0)
  eq("offset fin   (emoji)", eoff, 3)
end

-- ---------------------------------------------------------------------------
-- Test 7: selección de una sola línea vacía (modo V)
-- Buffer: {""} — 0 bytes = 0 UTF-16 units.
-- Esperado: offset=0, end_offset=0
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== selección de línea vacía (V) ===\n")
do
  local b = make_current_buf({ "" })
  vim.cmd("normal! ggV")
  local off, eoff = mesh._selection_range(b)
  vim.cmd("normal! \27")
  eq("offset inicio (V vacía)", off,  0)
  eq("offset fin   (V vacía)", eoff, 0)
end

-- ---------------------------------------------------------------------------
-- Test 8: selección de un solo carácter ASCII
-- Buffer: {"abc"}, seleccionar solo 'b' (col 1).
-- v → ancla en col 1, cursor en col 1; end_col+1=2.
-- Esperado: offset=1, end_offset=2
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== selección de un carácter ===\n")
do
  local b = make_current_buf({ "abc" })
  -- gg0 → col 0; l → col 1 ('b'); v → visual sin mover (solo 'b')
  vim.cmd("normal! gg0lv")
  local off, eoff = mesh._selection_range(b)
  vim.cmd("normal! \27")
  eq("offset inicio (1 char)", off,  1)
  eq("offset fin   (1 char)", eoff, 2)
end

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
io.stderr:write(string.format("\n%d passed, %d failed\n", pass, fail))

if fail > 0 then
  vim.cmd("cq")  -- exit 1
end
-- Si llegamos aquí, el -c "qa!" posterior da exit 0.

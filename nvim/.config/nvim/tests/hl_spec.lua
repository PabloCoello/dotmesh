--- tests/hl_spec.lua — Runner headless para mesh_review.hl
---
--- Verifica que M.setup() define correctamente los 8 grupos de highlight
--- del plugin sobre el fondo real de Normal (o el respaldo #121212 en headless).
---
--- No depende de plenary ni de ningún plugin externo.
--- Termina con cq (exit 1) si alguna aserción falla; exit 0 si todo pasa.
---
--- Cómo ejecutar (desde la raíz del repo):
---
---   SPEC=$(realpath nvim/.config/nvim/tests/hl_spec.lua)
---   timeout 60 ~/.local/bin/nvim --headless -u NONE -c "luafile $SPEC" -c "qa!"

-- ---------------------------------------------------------------------------
-- Localizar módulos a partir de la ruta de este fichero.
-- ---------------------------------------------------------------------------
local src = debug.getinfo(1, "S").source:match("^@?(.+)$")
if not src or not src:match("^/") then
  io.stderr:write(
    "ERROR: ejecuta con ruta absoluta:\n" ..
    "  SPEC=$(realpath nvim/.config/nvim/tests/hl_spec.lua)\n" ..
    "  timeout 60 ~/.local/bin/nvim --headless -u NONE -c \"luafile $SPEC\" -c \"qa!\"\n"
  )
  vim.cmd("cq")
  return
end

local test_dir = src:match("(.+)/[^/]+$")
local lua_dir  = vim.fn.fnamemodify(test_dir .. "/../lua/", ":p")
package.path   = lua_dir .. "?.lua;" .. lua_dir .. "?/init.lua;" .. package.path

-- ---------------------------------------------------------------------------
-- Mini-runner (mismo estilo que utf_spec.lua)
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

local function ok(desc, condition)
  if condition then
    io.stderr:write("  ok  " .. desc .. "\n")
    pass = pass + 1
  else
    io.stderr:write("  FAIL " .. desc .. "\n")
    fail = fail + 1
  end
end

-- ---------------------------------------------------------------------------
-- Cargar módulos
-- ---------------------------------------------------------------------------
local ok_hl, hl = pcall(require, "mesh_review.hl")
if not ok_hl then
  io.stderr:write("ERROR cargando mesh_review.hl: " .. tostring(hl) .. "\n")
  vim.cmd("cq")
  return
end

local ok_types, types = pcall(require, "mesh_review.types")
if not ok_types then
  io.stderr:write("ERROR cargando mesh_review.types: " .. tostring(types) .. "\n")
  vim.cmd("cq")
  return
end

-- ---------------------------------------------------------------------------
-- C10-1: setup() no lanza error
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== setup() básico ===\n")

local ok_setup, err_setup = pcall(function() hl.setup() end)
eq("setup() no lanza error", ok_setup, true)

-- ---------------------------------------------------------------------------
-- C10-2: grupos de rango (MeshReview<Tipo>) tienen bg y no tienen fg
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== grupos de rango: bg sí, fg no ===\n")

do
  local hl_nota = vim.api.nvim_get_hl(0, { name = "MeshReviewNota", link = false })
  ok("MeshReviewNota.bg existe",    hl_nota.bg ~= nil)
  ok("MeshReviewNota.bg es no cero", hl_nota.bg ~= 0)
  -- Sin fg: el rango no debe recolorear la prosa del documento.
  ok("MeshReviewNota sin fg explícito", not hl_nota.fg or hl_nota.fg == 0)
end

-- Todos los tipos: bg definido, sin fg (rango solo tinta el fondo).
for _, t in ipairs(types.list) do
  local h = vim.api.nvim_get_hl(0, { name = t.hl, link = false })
  ok(t.hl .. " tiene bg", h.bg ~= nil and h.bg ~= 0)
  ok(t.hl .. " sin fg explícito", not h.fg or h.fg == 0)
end

-- ---------------------------------------------------------------------------
-- C10-2b: grupos de marca (MeshReview<Tipo>Mark) tienen fg y no tienen bg
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== grupos de marca: fg sí, bg no ===\n")

do
  local h = vim.api.nvim_get_hl(0, { name = "MeshReviewNotaMark", link = false })
  ok("MeshReviewNotaMark.fg existe",     h.fg ~= nil)
  ok("MeshReviewNotaMark.fg es no cero", h.fg ~= 0)
  -- Sin bg: el signo y el virt_text no deben interferir con el fondo.
  ok("MeshReviewNotaMark sin bg explícito", not h.bg or h.bg == 0)
  -- El fg del grupo de marca debe coincidir con el color canónico del tipo.
  -- nota → #6CB6B0 = 0x6CB6B0 = 7124656
  eq("MeshReviewNotaMark.fg = #6CB6B0", h.fg, 0x6CB6B0)
end

-- Todos los tipos: fg definido, sin bg (marca solo tinta el texto).
for _, t in ipairs(types.list) do
  local h = vim.api.nvim_get_hl(0, { name = t.mark_hl, link = false })
  ok(t.mark_hl .. " tiene fg", h.fg ~= nil and h.fg ~= 0)
  ok(t.mark_hl .. " sin bg explícito", not h.bg or h.bg == 0)
end

-- ---------------------------------------------------------------------------
-- C10-3: MeshReviewDetached tiene .fg y no tiene .bg
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== MeshReviewDetached ===\n")

do
  local h = vim.api.nvim_get_hl(0, { name = "MeshReviewDetached", link = false })
  -- fg = #6e6e6e = 0x6e6e6e = 7237230
  eq("MeshReviewDetached.fg = 0x6e6e6e", h.fg, 0x6e6e6e)
  -- bg puede ser nil o 0 (sin fondo explícito).
  ok("MeshReviewDetached sin bg", not h.bg or h.bg == 0)
end

-- ---------------------------------------------------------------------------
-- C10-4: setup() idempotente — dos llamadas seguidas no producen error
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== idempotencia ===\n")

do
  local ok2, err2 = pcall(function()
    hl.setup()
    hl.setup()
  end)
  eq("dos llamadas a setup() sin error", ok2, true)
  local h = vim.api.nvim_get_hl(0, { name = "MeshReviewNota", link = false })
  ok("MeshReviewNota.bg sigue existiendo tras segunda llamada", h.bg ~= nil and h.bg ~= 0)
end

-- ---------------------------------------------------------------------------
-- C10-5: setup() tras cambio de colorscheme (habamax) recalcula grupos
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== recalculo tras colorscheme habamax ===\n")

do
  -- habamax está incluido en Neovim como colorscheme built-in.
  local ok_cs = pcall(function() vim.cmd.colorscheme("habamax") end)
  if ok_cs then
    local ok3, err3 = pcall(function() hl.setup() end)
    eq("setup() tras habamax sin error", ok3, true)
    local h = vim.api.nvim_get_hl(0, { name = "MeshReviewNota", link = false })
    ok("MeshReviewNota.bg existe tras habamax + setup()", h.bg ~= nil and h.bg ~= 0)
  else
    io.stderr:write("  skip  habamax no disponible en headless\n")
  end
end

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
io.stderr:write(string.format("\n%d passed, %d failed\n", pass, fail))

if fail > 0 then
  vim.cmd("cq")  -- exit 1
end
-- Si llegamos aquí, el -c "qa!" exterior da exit 0.

--- tests/colorscheme_spec.lua — Runner headless para el colorscheme dotmesh.
---
--- No depende de plenary ni de ningún plugin externo: solo Neovim API estándar.
--- Salida por stderr. Termina con vim.cmd("cq") (exit 1) si algún assert falla;
--- si todos pasan el -c "qa!" posterior da exit 0.
---
--- Cómo ejecutar (desde la raíz del repo):
---
---   REPO=$(git rev-parse --show-toplevel)
---   SPEC=$REPO/nvim/.config/nvim/tests/colorscheme_spec.lua
---   timeout 60 ~/.local/bin/nvim --headless -u NONE \
---     -c "set rtp+=$REPO/nvim/.config/nvim" \
---     -c "colorscheme dotmesh" \
---     -c "luafile $SPEC" \
---     -c "qa!"
---
--- La ruta absoluta es obligatoria para que debug.getinfo() pueda localizar
--- el directorio lua/ relativo a este fichero.

-- ---------------------------------------------------------------------------
-- Localización del directorio lua/ a partir de la ruta de este spec.
-- ---------------------------------------------------------------------------
local src = debug.getinfo(1, "S").source:match("^@?(.+)$")
if not src or not src:match("^/") then
  io.stderr:write(
    "ERROR: ejecuta con ruta absoluta:\n" ..
    "  SPEC=$(realpath nvim/.config/nvim/tests/colorscheme_spec.lua)\n" ..
    "  ~/.local/bin/nvim --headless -u NONE" ..
    " -c \"set rtp+=$(dirname $(dirname $SPEC))\"" ..
    " -c \"colorscheme dotmesh\"" ..
    " -c \"luafile $SPEC\" -c qa!\n"
  )
  vim.cmd("cq")
  return
end

local test_dir = src:match("(.+)/[^/]+$")
local lua_dir  = vim.fn.fnamemodify(test_dir .. "/../lua/", ":p")
-- Asegurar que los módulos dotmesh.* y mesh_review.* son resolvibles
-- aunque el rtp se haya configurado antes de que package.path se actualizara.
package.path = lua_dir .. "?.lua;" .. lua_dir .. "?/init.lua;" .. package.path

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
      "  got="      .. tostring(got) ..
      "  expected=" .. tostring(expected) .. "\n"
    )
    fail = fail + 1
  end
end

-- Devuelve el atributo `attr` del grupo `name` como número entero, o nil.
local function get_hl(name, attr)
  local info = vim.api.nvim_get_hl(0, { name = name, link = false })
  return info[attr]
end

-- Convierte una cadena "#RRGGBB" a entero (como devuelve nvim_get_hl).
local function hex2num(s)
  return tonumber(s:match("^#?(.+)$"), 16)
end

-- ---------------------------------------------------------------------------
-- Verificar que el colorscheme ya está activo (lo carga el -c anterior).
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== dotmesh colorscheme ===\n")
eq("colors_name = dotmesh", vim.g.colors_name, "dotmesh")

-- ---------------------------------------------------------------------------
-- Grupos base
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== grupos base ===\n")

-- Normal.bg = ink._0 (#121212 = 0x121212 = 1184274)
eq("Normal.bg = ink._0 (#121212)",
  get_hl("Normal", "bg"),
  hex2num("#121212"))

-- Comment.fg = text.dim (#6e6e6e)
eq("Comment.fg = text.dim (#6e6e6e)",
  get_hl("Comment", "fg"),
  hex2num("#6e6e6e"))

-- Comment es cursiva
eq("Comment.italic = true",
  get_hl("Comment", "italic"),
  true)

-- Error.fg = rose (#E59A9A)
eq("Error.fg = rose (#E59A9A)",
  get_hl("Error", "fg"),
  hex2num("#E59A9A"))

-- ---------------------------------------------------------------------------
-- Sintaxis (mapa canónico de docs/DESIGN.md)
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== sintaxis (mapa canónico) ===\n")

-- @keyword.fg = lilac (#CBAACB)
eq("@keyword.fg = lilac (#CBAACB)",
  get_hl("@keyword", "fg"),
  hex2num("#CBAACB"))

-- @string.fg = sage (#A8CBA0)
eq("@string.fg = sage (#A8CBA0)",
  get_hl("@string", "fg"),
  hex2num("#A8CBA0"))

-- @function.fg = blue (#8FB4E3)
eq("@function.fg = blue (#8FB4E3)",
  get_hl("@function", "fg"),
  hex2num("#8FB4E3"))

-- @number.fg = peach (#FFAA7A)
eq("@number.fg = peach (#FFAA7A)",
  get_hl("@number", "fg"),
  hex2num("#FFAA7A"))

-- @type.fg = gold (#E3C58A)
eq("@type.fg = gold (#E3C58A)",
  get_hl("@type", "fg"),
  hex2num("#E3C58A"))

-- @tag.fg = rose (#E59A9A) — etiquetas HTML/XML
eq("@tag.fg = rose (#E59A9A)",
  get_hl("@tag", "fg"),
  hex2num("#E59A9A"))

-- ---------------------------------------------------------------------------
-- Diagnósticos
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== diagnósticos ===\n")

eq("DiagnosticError.fg = rose",
  get_hl("DiagnosticError", "fg"),
  hex2num("#E59A9A"))

eq("DiagnosticWarn.fg = peach",
  get_hl("DiagnosticWarn", "fg"),
  hex2num("#FFAA7A"))

eq("DiagnosticHint.fg = teal",
  get_hl("DiagnosticHint", "fg"),
  hex2num("#6CB6B0"))

-- ---------------------------------------------------------------------------
-- Grupos MeshReview* (fondo blended 0.18 sobre ink._0)
-- Los valores esperados se derivan de blend_hex(tipo.color, "#121212", 0.18)
-- con round-half-up (math.floor(x + 0.5)) por canal.
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== MeshReview* (blended bg) ===\n")

-- MeshReviewNota: blend_hex("#6CB6B0","#121212",0.18)
--   R: round(0.18*108 + 0.82*18) = round(34.20) = 34 = 0x22
--   G: round(0.18*182 + 0.82*18) = round(47.52) = 48 = 0x30  ← floor(48.02)
--   B: round(0.18*176 + 0.82*18) = round(46.44) = 46 = 0x2E  ← floor(46.94)
--   → #22302E
eq("MeshReviewNota.bg = #22302E (teal 0.18 sobre ink._0)",
  get_hl("MeshReviewNota", "bg"),
  hex2num("#22302E"))

-- MeshReviewEdita: blend_hex("#E59A9A","#121212",0.18) → #382A2A
eq("MeshReviewEdita.bg = #382A2A (rose 0.18 sobre ink._0)",
  get_hl("MeshReviewEdita", "bg"),
  hex2num("#382A2A"))

-- MeshReviewVerifica: blend_hex("#FFAA7A","#121212",0.18)
--   R: round(0.18*255 + 0.82*18) = round(60.66) = 61 = 0x3D
--   G: round(0.18*170 + 0.82*18) = round(45.36) = 45 = 0x2D
--   B: round(0.18*122 + 0.82*18) = round(36.72) = 37 = 0x25
--   → #3D2D25
eq("MeshReviewVerifica.bg = #3D2D25 (peach 0.18 sobre ink._0)",
  get_hl("MeshReviewVerifica", "bg"),
  hex2num("#3D2D25"))

-- MeshReviewDetached: fg = text.dim (#6e6e6e), sin bg
eq("MeshReviewDetached.fg = text.dim (#6e6e6e)",
  get_hl("MeshReviewDetached", "fg"),
  hex2num("#6e6e6e"))

eq("MeshReviewDetached.bg = nil (sin fondo)",
  get_hl("MeshReviewDetached", "bg"),
  nil)

-- ---------------------------------------------------------------------------
-- Colores de terminal
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== terminal colors ===\n")

-- ANSI 6 (cian) → teal (coincide con Ghostty palette = 6=#6CB6B0)
eq("terminal_color_6 = teal (#6CB6B0)",
  vim.g.terminal_color_6,
  "#6CB6B0")

-- ANSI 1 (rojo) → rose
eq("terminal_color_1 = rose (#E59A9A)",
  vim.g.terminal_color_1,
  "#E59A9A")

-- ---------------------------------------------------------------------------
-- Cambio de colorscheme y vuelta a dotmesh (no debe lanzar error)
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== round-trip colorscheme ===\n")

local ok1, err1 = pcall(vim.cmd.colorscheme, "habamax")
eq("colorscheme habamax sin error", ok1, true)
if not ok1 then
  io.stderr:write("  (error: " .. tostring(err1) .. ")\n")
end

local ok2, err2 = pcall(vim.cmd.colorscheme, "dotmesh")
eq("colorscheme dotmesh tras habamax sin error", ok2, true)
if not ok2 then
  io.stderr:write("  (error: " .. tostring(err2) .. ")\n")
end

-- Verificar que después del round-trip los grupos siguen correctos.
eq("Normal.bg correcto tras round-trip",
  get_hl("Normal", "bg"),
  hex2num("#121212"))

eq("MeshReviewNota.bg correcto tras round-trip",
  get_hl("MeshReviewNota", "bg"),
  hex2num("#22302E"))

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
io.stderr:write(string.format("\n%d passed, %d failed\n", pass, fail))

if fail > 0 then
  vim.cmd("cq")  -- exit 1
end
-- Si llegamos aquí, el -c "qa!" exterior da exit 0.

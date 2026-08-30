--- tests/blend_spec.lua — Runner mínimo headless para dotmesh.blend
---
--- No depende de plenary ni de ningún plugin: solo Lua puro y la API
--- estándar de Neovim. Salida por stderr. Sale con cq (exit 1) si algún
--- assert falla; si todos pasan, -c "qa!" exterior da exit 0.
---
--- Cómo ejecutar (requiere ruta absoluta):
---
---   SPEC=$(realpath nvim/.config/nvim/tests/blend_spec.lua)
---   timeout 60 ~/.local/bin/nvim --headless -u NONE \
---     -c "luafile $SPEC" -c "qa!"
---
--- Resultado esperado: "N passed, 0 failed" en stderr y exit 0.
---
--- Nota sobre discrepancias con el plan:
--- El plan documentaba "#382B2B" y "#222F2E" como valores de referencia.
--- Los cálculos reales con round-half-up (math.floor(x + 0.5)) dan:
---   - G canal de #E59A9A: 0.18*154 + 0.82*18 = 42.48 → 42 = 0x2A ≠ 0x2B
---   - G canal de #6CB6B0: 0.18*182 + 0.82*18 = 47.52 → 48 = 0x30 ≠ 0x2F
--- Los tests usan los valores de la implementación, verificados ejecutando
--- este spec antes de fijarlo. El plan no se corrigió; esta nota documenta
--- la discrepancia.

-- ---------------------------------------------------------------------------
-- Localizar el módulo a partir de la ruta de este fichero.
-- ---------------------------------------------------------------------------
local src = debug.getinfo(1, "S").source:match("^@?(.+)$")
if not src or not src:match("^/") then
  io.stderr:write(
    "ERROR: ejecuta con ruta absoluta:\n" ..
    "  SPEC=$(realpath nvim/.config/nvim/tests/blend_spec.lua)\n" ..
    "  timeout 60 ~/.local/bin/nvim --headless -u NONE" ..
    " -c \"luafile $SPEC\" -c \"qa!\"\n"
  )
  vim.cmd("cq")
  return
end

local test_dir = src:match("(.+)/[^/]+$")
local lua_dir  = vim.fn.fnamemodify(test_dir .. "/../lua/", ":p")
package.path   = lua_dir .. "?.lua;" .. lua_dir .. "?/init.lua;" .. package.path

local ok, blend = pcall(require, "dotmesh.blend")
if not ok then
  io.stderr:write("ERROR cargando dotmesh.blend: " .. tostring(blend) .. "\n")
  vim.cmd("cq")
  return
end

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

-- ---------------------------------------------------------------------------
-- Casos de referencia (colores de tipos reales sobre ink-0 = #121212, α=0.18)
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== casos de referencia α=0.18 sobre #121212 ===\n")

-- edita (#E59A9A) — rose
-- R: round(0.18*229 + 0.82*18) = round(55.98) = 56 = 0x38
-- G: round(0.18*154 + 0.82*18) = round(42.48) = 42 = 0x2A
-- B: round(0.18*154 + 0.82*18) = round(42.48) = 42 = 0x2A
eq("edita  (#E59A9A) sobre #121212 α=0.18 = #382A2A",
  blend.blend_hex("#E59A9A", "#121212", 0.18), "#382A2A")

-- nota (#6CB6B0) — teal
-- R: round(0.18*108 + 0.82*18) = round(34.20) = 34 = 0x22
-- G: round(0.18*182 + 0.82*18) = round(47.52) = 48 = 0x30
-- B: round(0.18*176 + 0.82*18) = round(46.44) = 46 = 0x2E
eq("nota   (#6CB6B0) sobre #121212 α=0.18 = #22302E",
  blend.blend_hex("#6CB6B0", "#121212", 0.18), "#22302E")

-- ---------------------------------------------------------------------------
-- Casos límite de alpha
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== alpha = 0.0 y 1.0 ===\n")

eq("alpha=0.0 devuelve bg (#000000)",
  blend.blend_hex("#FFFFFF", "#000000", 0.0), "#000000")
eq("alpha=1.0 devuelve fg (#FFFFFF)",
  blend.blend_hex("#FFFFFF", "#000000", 1.0), "#FFFFFF")

-- ---------------------------------------------------------------------------
-- Canales intermedios
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== canales intermedios ===\n")

-- 50 % de #AAAAAA sobre #000000 = round(0.5*170 + 0.5*0) = round(85) = 55 = 0x55
eq("50% #AAAAAA sobre #000000 = #555555",
  blend.blend_hex("#AAAAAA", "#000000", 0.5), "#555555")

-- Resultado sin '#' en la entrada (ambos formatos admitidos)
eq("sin # en fg y bg",
  blend.blend_hex("FFFFFF", "000000", 1.0), "#FFFFFF")

-- ---------------------------------------------------------------------------
-- Hex malformado: fallo silencioso → devuelve fg_hex sin modificar
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== hex malformado ===\n")

eq("fg malformado devuelve fg sin modificar",
  blend.blend_hex("GGGGGG", "#000000", 0.5), "GGGGGG")
eq("bg malformado devuelve fg sin modificar",
  blend.blend_hex("#FFFFFF", "ZZZ", 0.5), "#FFFFFF")
eq("fg vacío devuelve fg sin modificar",
  blend.blend_hex("", "#000000", 0.5), "")

-- ---------------------------------------------------------------------------
-- Casos adicionales con otros colores de tipos
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== otros tipos sobre #121212 α=0.18 ===\n")

-- sugerencia (#E3C58A) — gold
-- R: round(0.18*227 + 0.82*18) = round(40.86+14.76) = round(55.62) = 56 = 0x38
-- G: round(0.18*197 + 0.82*18) = round(35.46+14.76) = round(50.22) = 50 = 0x32
-- B: round(0.18*138 + 0.82*18) = round(24.84+14.76) = round(39.60) = 40 = 0x28
eq("sugerencia (#E3C58A) sobre #121212 α=0.18 = #383228",
  blend.blend_hex("#E3C58A", "#121212", 0.18), "#383228")

-- verifica (#FFAA7A) — peach
-- R: round(0.18*255 + 0.82*18) = round(45.90+14.76) = round(60.66) = 61 = 0x3D
-- G: round(0.18*170 + 0.82*18) = round(30.60+14.76) = round(45.36) = 45 = 0x2D
-- B: round(0.18*122 + 0.82*18) = round(21.96+14.76) = round(36.72) = 37 = 0x25
eq("verifica  (#FFAA7A) sobre #121212 α=0.18 = #3D2D25",
  blend.blend_hex("#FFAA7A", "#121212", 0.18), "#3D2D25")

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
io.stderr:write(string.format("\n%d passed, %d failed\n", pass, fail))

if fail > 0 then
  vim.cmd("cq")
end

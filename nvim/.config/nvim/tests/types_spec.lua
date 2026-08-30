--- tests/types_spec.lua — Runner mínimo headless para mesh_review.types
---
--- No depende de plenary ni de ningún plugin: solo Lua puro y la API
--- estándar de Neovim. Salida por stderr. Sale con cq (exit 1) si algún
--- assert falla; si todos pasan, -c "qa!" exterior da exit 0.
---
--- Cómo ejecutar (requiere ruta absoluta):
---
---   SPEC=$(realpath nvim/.config/nvim/tests/types_spec.lua)
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
    "  SPEC=$(realpath nvim/.config/nvim/tests/types_spec.lua)\n" ..
    "  timeout 60 ~/.local/bin/nvim --headless -u NONE" ..
    " -c \"luafile $SPEC\" -c \"qa!\"\n"
  )
  vim.cmd("cq")
  return
end

local test_dir = src:match("(.+)/[^/]+$")
local lua_dir  = vim.fn.fnamemodify(test_dir .. "/../lua/", ":p")
package.path   = lua_dir .. "?.lua;" .. lua_dir .. "?/init.lua;" .. package.path

local ok, types = pcall(require, "mesh_review.types")
if not ok then
  io.stderr:write("ERROR cargando mesh_review.types: " .. tostring(types) .. "\n")
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
-- Estructura de M.list
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== M.list ===\n")

eq("exactamente 7 tipos", #types.list, 7)

-- Orden canónico: edita, sugerencia, pregunta, verifica, nota, referencia, supuesto.
eq("list[1].label = edita",      types.list[1].label, "edita")
eq("list[4].label = verifica",   types.list[4].label, "verifica")
eq("list[5].label = nota",       types.list[5].label, "nota")
eq("list[7].label = supuesto",   types.list[7].label, "supuesto")

-- ---------------------------------------------------------------------------
-- Colores: deben coincidir byte a byte con TYPE_COLORS de decorations-utils.ts
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== colores ===\n")

eq("edita      color = #E59A9A", types.list[1].color, "#E59A9A")
eq("sugerencia color = #E3C58A", types.list[2].color, "#E3C58A")
eq("pregunta   color = #8FB4E3", types.list[3].color, "#8FB4E3")
eq("verifica   color = #FFAA7A", types.list[4].color, "#FFAA7A")
eq("nota       color = #6CB6B0", types.list[5].color, "#6CB6B0")
eq("referencia color = #A8CBA0", types.list[6].color, "#A8CBA0")
eq("supuesto   color = #CBAACB", types.list[7].color, "#CBAACB")

-- ---------------------------------------------------------------------------
-- Letras de atajo
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== letras ===\n")

eq("edita      letter = e", types.list[1].letter, "e")
eq("sugerencia letter = s", types.list[2].letter, "s")
eq("pregunta   letter = p", types.list[3].letter, "p")
eq("verifica   letter = v", types.list[4].letter, "v")
eq("nota       letter = n", types.list[5].letter, "n")
eq("referencia letter = r", types.list[6].letter, "r")
eq("supuesto   letter = u", types.list[7].letter, "u")

-- ---------------------------------------------------------------------------
-- needs_confidence: solo verifica y supuesto
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== needs_confidence ===\n")

eq("edita      needs_confidence = false", types.list[1].needs_confidence, false)
eq("sugerencia needs_confidence = false", types.list[2].needs_confidence, false)
eq("pregunta   needs_confidence = false", types.list[3].needs_confidence, false)
eq("verifica   needs_confidence = true",  types.list[4].needs_confidence, true)
eq("nota       needs_confidence = false", types.list[5].needs_confidence, false)
eq("referencia needs_confidence = false", types.list[6].needs_confidence, false)
eq("supuesto   needs_confidence = true",  types.list[7].needs_confidence, true)

-- ---------------------------------------------------------------------------
-- Grupos de highlight de rango (campo hl) — solo bg
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== hl groups (rango) ===\n")

eq("edita      hl = MeshReviewEdita",      types.list[1].hl, "MeshReviewEdita")
eq("sugerencia hl = MeshReviewSugerencia", types.list[2].hl, "MeshReviewSugerencia")
eq("pregunta   hl = MeshReviewPregunta",   types.list[3].hl, "MeshReviewPregunta")
eq("verifica   hl = MeshReviewVerifica",   types.list[4].hl, "MeshReviewVerifica")
eq("nota       hl = MeshReviewNota",       types.list[5].hl, "MeshReviewNota")
eq("referencia hl = MeshReviewReferencia", types.list[6].hl, "MeshReviewReferencia")
eq("supuesto   hl = MeshReviewSupuesto",   types.list[7].hl, "MeshReviewSupuesto")

-- ---------------------------------------------------------------------------
-- Grupos de highlight de marca (campo mark_hl) — solo fg
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== mark_hl groups (marca) ===\n")

eq("edita      mark_hl = MeshReviewEditaMark",          types.list[1].mark_hl, "MeshReviewEditaMark")
eq("sugerencia mark_hl = MeshReviewSugerenciaMark",     types.list[2].mark_hl, "MeshReviewSugerenciaMark")
eq("pregunta   mark_hl = MeshReviewPreguntaMark",       types.list[3].mark_hl, "MeshReviewPreguntaMark")
eq("verifica   mark_hl = MeshReviewVerificaMark",       types.list[4].mark_hl, "MeshReviewVerificaMark")
eq("nota       mark_hl = MeshReviewNotaMark",           types.list[5].mark_hl, "MeshReviewNotaMark")
eq("referencia mark_hl = MeshReviewReferenciaMark",     types.list[6].mark_hl, "MeshReviewReferenciaMark")
eq("supuesto   mark_hl = MeshReviewSupuestoMark",       types.list[7].mark_hl, "MeshReviewSupuestoMark")

-- ---------------------------------------------------------------------------
-- M.by_label
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== by_label ===\n")

eq("by_label['nota'].label = nota",        types.by_label["nota"].label,           "nota")
eq("by_label['nota'].color = #6CB6B0",     types.by_label["nota"].color,           "#6CB6B0")
eq("by_label['nota'].needs_confidence",    types.by_label["nota"].needs_confidence, false)
eq("by_label['verifica'].needs_confidence",types.by_label["verifica"].needs_confidence, true)
eq("by_label['supuesto'].needs_confidence",types.by_label["supuesto"].needs_confidence, true)
eq("by_label tiene 7 entradas", (function()
  local n = 0; for _ in pairs(types.by_label) do n = n + 1 end; return n
end)(), 7)

-- ---------------------------------------------------------------------------
-- M.by_letter
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== by_letter ===\n")

eq("by_letter['n'].label = nota",   types.by_letter["n"].label,  "nota")
eq("by_letter['e'].label = edita",  types.by_letter["e"].label,  "edita")
eq("by_letter['v'].label = verifica", types.by_letter["v"].label, "verifica")
eq("by_letter tiene 7 entradas", (function()
  local n = 0; for _ in pairs(types.by_letter) do n = n + 1 end; return n
end)(), 7)

-- ---------------------------------------------------------------------------
-- M.hl_group, M.mark_hl_group y constantes de fallback
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== hl_group, mark_hl_group y fallback ===\n")

eq("hl_group('nota') = MeshReviewNota",          types.hl_group("nota"),          "MeshReviewNota")
eq("hl_group('edita') = MeshReviewEdita",         types.hl_group("edita"),         "MeshReviewEdita")
eq("hl_group('supuesto') = MeshReviewSupuesto",   types.hl_group("supuesto"),      "MeshReviewSupuesto")
eq("mark_hl_group('nota') = MeshReviewNotaMark",  types.mark_hl_group("nota"),     "MeshReviewNotaMark")
eq("mark_hl_group('edita') = MeshReviewEditaMark",types.mark_hl_group("edita"),    "MeshReviewEditaMark")
eq("mark_hl_group('supuesto') = MeshReviewSupuestoMark", types.mark_hl_group("supuesto"), "MeshReviewSupuestoMark")
eq("FALLBACK_HL = MeshReviewDetached",           types.FALLBACK_HL,               "MeshReviewDetached")
eq("FALLBACK_COLOR = #9e9e9e",                   types.FALLBACK_COLOR,            "#9e9e9e")

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
io.stderr:write(string.format("\n%d passed, %d failed\n", pass, fail))

if fail > 0 then
  vim.cmd("cq")
end

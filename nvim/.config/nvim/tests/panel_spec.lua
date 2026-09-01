--- tests/panel_spec.lua — Runner headless para mesh_review.panel
---
--- Cubre la resolución de la geometría del panel: posición, tamaño, acotado
--- contra las dimensiones de pantalla y degradación de opciones inválidas.
---
--- _resolve_geometry es pura a propósito: recibe la config y las dimensiones de
--- la interfaz, y devuelve la geometría más una lista de avisos. Así el acotado
--- se prueba sin abrir ventanas ni depender del tamaño real del terminal, que en
--- headless no es el del usuario.
---
--- No depende de plenary, del CLI de mesh-review ni de la red.
--- Termina con cq (exit 1) si alguna aserción falla; exit 0 si todo pasa.
---
--- Cómo ejecutar (desde la raíz del repo):
---
---   SPEC=$(realpath nvim/.config/nvim/tests/panel_spec.lua)
---   timeout 60 ~/.local/bin/nvim --headless -u NONE -c "luafile $SPEC" -c "qa!"

-- ---------------------------------------------------------------------------
-- Localizar el módulo a partir de la ruta de este fichero.
-- ---------------------------------------------------------------------------
local src = debug.getinfo(1, "S").source:match("^@?(.+)$")
if not src or not src:match("^/") then
  io.stderr:write(
    "ERROR: ejecuta con ruta absoluta:\n" ..
    "  SPEC=$(realpath nvim/.config/nvim/tests/panel_spec.lua)\n" ..
    "  timeout 60 ~/.local/bin/nvim --headless -u NONE -c \"luafile $SPEC\" -c qa!\n"
  )
  vim.cmd("cq")
  return
end

local test_dir = src:match("(.+)/[^/]+$")
local lua_dir  = vim.fn.fnamemodify(test_dir .. "/../lua/", ":p")
package.path = lua_dir .. "?.lua;" .. lua_dir .. "?/init.lua;" .. package.path

local ok, panel = pcall(require, "mesh_review.panel")
if not ok then
  io.stderr:write("ERROR cargando mesh_review.panel: " .. tostring(panel) .. "\n")
  vim.cmd("cq")
  return
end

-- ---------------------------------------------------------------------------
-- Mini-runner
-- ---------------------------------------------------------------------------
local pass = 0
local fail = 0

--- Verifica la geometría devuelta y cuántos avisos ha generado.
---
--- @param desc      string
--- @param cfg       table|nil  Config de panel.
--- @param ui        table      { columns, lines }.
--- @param esperado  table      { position, size, warnings }.
local function assert_geo(desc, cfg, ui, esperado)
  local geo, warnings = panel._resolve_geometry(cfg, ui)
  local n_warn = #(warnings or {})

  if geo.position == esperado.position
     and geo.size == esperado.size
     and n_warn == esperado.warnings then
    io.stderr:write("  ok  " .. desc .. "\n")
    pass = pass + 1
  else
    io.stderr:write(string.format(
      "  FAIL %s\n       got={%s, %s, avisos=%d}  esperaba={%s, %s, avisos=%d}\n",
      desc,
      tostring(geo.position), tostring(geo.size), n_warn,
      tostring(esperado.position), tostring(esperado.size), esperado.warnings))
    fail = fail + 1
  end
end

-- Pantalla de referencia: 200 columnas × 50 líneas.
-- Mitades: 100 columnas, 25 líneas.
local GRANDE  = { columns = 200, lines = 50 }
-- Pantalla estrecha: la mitad (25) queda por debajo del mínimo nominal (30).
local ESTRECHA = { columns = 50, lines = 20 }

-- ---------------------------------------------------------------------------
-- Valores por defecto
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== defaults ===\n")

assert_geo("sin config: derecha, 60 columnas",
  nil, GRANDE, { position = "right", size = 60, warnings = 0 })

assert_geo("config vacía: igual que sin config",
  {}, GRANDE, { position = "right", size = 60, warnings = 0 })

-- 30% de 50 líneas = 15, por encima del mínimo de 10.
assert_geo("position=bottom sin height: 30% de la pantalla",
  { position = "bottom" }, GRANDE, { position = "bottom", size = 15, warnings = 0 })

-- ---------------------------------------------------------------------------
-- Tamaños explícitos
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== tamaños explícitos ===\n")

assert_geo("width dentro de rango se respeta",
  { width = 80 }, GRANDE, { position = "right", size = 80, warnings = 0 })

assert_geo("height dentro de rango se respeta",
  { position = "bottom", height = 20 }, GRANDE,
  { position = "bottom", size = 20, warnings = 0 })

-- width solo aplica a la posición lateral; height solo a la inferior.
assert_geo("height se ignora en position=right",
  { position = "right", height = 20 }, GRANDE,
  { position = "right", size = 60, warnings = 0 })

assert_geo("width se ignora en position=bottom",
  { position = "bottom", width = 80 }, GRANDE,
  { position = "bottom", size = 15, warnings = 0 })

-- ---------------------------------------------------------------------------
-- Acotado contra la pantalla
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== acotado ===\n")

assert_geo("width mayor que media pantalla se acota a la mitad",
  { width = 500 }, GRANDE, { position = "right", size = 100, warnings = 0 })

assert_geo("width menor que el mínimo sube al mínimo",
  { width = 10 }, GRANDE, { position = "right", size = 30, warnings = 0 })

-- En 50 columnas la mitad son 25, por debajo del mínimo nominal de 30: manda la
-- pantalla. Un panel más ancho que la mitad dejaría el documento inservible.
assert_geo("pantalla estrecha: la mitad manda sobre el mínimo",
  nil, ESTRECHA, { position = "right", size = 25, warnings = 0 })

assert_geo("pantalla estrecha: width pequeño también se acota a la mitad",
  { width = 10 }, ESTRECHA, { position = "right", size = 25, warnings = 0 })

assert_geo("height mayor que media pantalla se acota",
  { position = "bottom", height = 40 }, GRANDE,
  { position = "bottom", size = 25, warnings = 0 })

assert_geo("height por debajo del mínimo sube al mínimo",
  { position = "bottom", height = 2 }, GRANDE,
  { position = "bottom", size = 5, warnings = 0 })

-- ---------------------------------------------------------------------------
-- Opciones inválidas: caen al valor por defecto y avisan
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== opciones inválidas ===\n")

assert_geo("position desconocida cae a right y avisa",
  { position = "izquierda" }, GRANDE, { position = "right", size = 60, warnings = 1 })

assert_geo("position no textual cae a right y avisa",
  { position = 42 }, GRANDE, { position = "right", size = 60, warnings = 1 })

assert_geo("width no numérico cae al default y avisa",
  { width = "ancho" }, GRANDE, { position = "right", size = 60, warnings = 1 })

assert_geo("width cero cae al default y avisa",
  { width = 0 }, GRANDE, { position = "right", size = 60, warnings = 1 })

assert_geo("width negativo cae al default y avisa",
  { width = -5 }, GRANDE, { position = "right", size = 60, warnings = 1 })

assert_geo("height inválido cae al default y avisa",
  { position = "bottom", height = -1 }, GRANDE,
  { position = "bottom", size = 15, warnings = 1 })

-- Dos opciones malas, dos avisos: ninguna enmascara a la otra.
assert_geo("position y width inválidos dan dos avisos",
  { position = "arriba", width = 0 }, GRANDE,
  { position = "right", size = 60, warnings = 2 })

-- Un width fraccionario no es un error del usuario: se trunca en silencio.
assert_geo("width fraccionario se trunca sin avisar",
  { width = 60.7 }, GRANDE, { position = "right", size = 60, warnings = 0 })

-- ---------------------------------------------------------------------------
-- Config guardada por configure()
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== configure ===\n")

do
  panel.configure({ position = "bottom", height = 18 })
  local geo = panel._resolve_geometry(nil, GRANDE)
  -- _resolve_geometry con cfg nil debe leer la config guardada, no los defaults.
  if geo.position == "bottom" and geo.size == 18 then
    io.stderr:write("  ok  configure() fija la config por defecto\n")
    pass = pass + 1
  else
    io.stderr:write(string.format(
      "  FAIL configure() fija la config por defecto  got={%s, %s}\n",
      tostring(geo.position), tostring(geo.size)))
    fail = fail + 1
  end

  panel.configure(nil)  -- restaurar para no contaminar otros casos
  local geo2 = panel._resolve_geometry(nil, GRANDE)
  if geo2.position == "right" and geo2.size == 60 then
    io.stderr:write("  ok  configure(nil) vuelve a los valores por defecto\n")
    pass = pass + 1
  else
    io.stderr:write(string.format(
      "  FAIL configure(nil) vuelve a los valores por defecto  got={%s, %s}\n",
      tostring(geo2.position), tostring(geo2.size)))
    fail = fail + 1
  end
end

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
io.stderr:write(string.format("\n%d passed, %d failed\n", pass, fail))

if fail > 0 then
  vim.cmd("cq")  -- exit 1
end

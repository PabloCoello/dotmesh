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

--- Verifica que todas las líneas miden exactamente `ancho` celdas de display.
--- Es la aserción que sostiene los bordes: si una sola línea desvía, el borde
--- derecho de la caja se rompe en esa fila.
local function assert_all_width(desc, lineas, ancho)
  local malas = {}
  for i, l in ipairs(lineas) do
    local w = vim.fn.strdisplaywidth(l)
    if w ~= ancho then table.insert(malas, string.format("[%d]=%d %q", i, w, l)) end
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

--- Compara dos valores simples.
local function assert_eq(desc, got, esperado)
  if got == esperado then
    io.stderr:write("  ok  " .. desc .. "\n")
    pass = pass + 1
  else
    io.stderr:write(string.format("  FAIL %s  got=%s  esperaba=%s\n",
      desc, tostring(got), tostring(esperado)))
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
-- Construcción de las tarjetas
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== tarjetas ===\n")

local ok_box, box = pcall(require, "mesh_review.box")
if not ok_box then
  io.stderr:write("ERROR cargando mesh_review.box: " .. tostring(box) .. "\n")
  vim.cmd("cq")
  return
end

--- Hilo de prueba con valores por defecto razonables.
local function hilo(over)
  local h = {
    thread_id   = "8f968901-1234-4321-8888-aaaabbbbcccc",
    status      = "open",
    commentType = "edita",
    openedBy    = { kind = "human", name = "PabloCoello" },
    openedAt    = "2026-09-01T10:00:00Z",
    anchor      = { quote = "A behavioural layer for the bank" },
    messages    = {
      { author = { kind = "human", name = "PabloCoello" },
        body = "por lo que omar dice en la reunión le interesa presentar behavioral" },
    },
  }
  for k, v in pairs(over or {}) do h[k] = v end
  return h
end

local ANCHO = 46

--- Devuelve solo las líneas que forman parte de una caja (no las separadoras).
local function lineas_de_caja(lines)
  local out = {}
  for _, l in ipairs(lines) do
    if l ~= "" then table.insert(out, l) end
  end
  return out
end

do
  local lines = panel._build_content({ hilo() }, ANCHO)
  assert_all_width("todas las líneas de la caja miden el ancho pedido",
    lineas_de_caja(lines), ANCHO)
end

do
  -- Un cuerpo largo obliga a varias líneas envueltas: es donde el borde derecho
  -- se rompería si el wrap midiera bytes.
  local lines = panel._build_content({ hilo({
    messages = {
      { author = { kind = "human", name = "PabloCoello" },
        body = "por lo que omar dice en la reunión, a él le interesa presentar "
            .. "behavioral como un layer completo para la institución y "
            .. "posicionar el piloto con el agente operador telefónico" },
    },
  }) }, ANCHO)
  assert_all_width("cuerpo largo envuelto sigue cuadrando", lineas_de_caja(lines), ANCHO)
end

do
  local lines = panel._build_content({ hilo() }, ANCHO)
  local todo = table.concat(lines, "\n")
  assert_eq("la cabecera no lleva el thread_id",
    todo:find("8f968901", 1, true) == nil, true)
  assert_eq("la cabecera lleva el tipo",
    todo:find("edita", 1, true) ~= nil, true)
  assert_eq("la cabecera lleva el autor",
    todo:find("PabloCoello", 1, true) ~= nil, true)
end

do
  local lines = panel._build_content({ hilo() }, ANCHO)
  assert_eq("la primera línea abre la caja",  lines[1]:sub(1, #"┌"), "┌")
  local ultima_caja
  for _, l in ipairs(lines) do
    if l:sub(1, #"└") == "└" then ultima_caja = l end
  end
  assert_eq("hay línea de cierre de caja", ultima_caja ~= nil, true)
  -- El separador colgante del render anterior dejaba una línea de ═ tras el
  -- último hilo. Ahora la última línea con contenido cierra una caja.
  local ultima_con_texto
  for _, l in ipairs(lines) do
    if l ~= "" then ultima_con_texto = l end
  end
  assert_eq("no queda separador colgante tras el último hilo",
    ultima_con_texto:sub(1, #"└") == "└", true)
end

do
  local lines = panel._build_content({ hilo(), hilo({ commentType = "nota" }) }, ANCHO)
  -- Entre dos cajas hay exactamente una línea en blanco.
  local blancos, cierres = 0, 0
  for _, l in ipairs(lines) do
    if l == "" then blancos = blancos + 1 end
    if l:sub(1, #"└") == "└" then cierres = cierres + 1 end
  end
  assert_eq("dos hilos dan dos cajas", cierres, 2)
  assert_eq("una sola línea en blanco entre cajas", blancos, 1)
end

do
  local lines = panel._build_content({
    hilo(),
    hilo({ status = "resolved", commentType = "nota" }),
  }, ANCHO)
  local cierres = 0
  for _, l in ipairs(lines) do
    if l:sub(1, #"└") == "└" then cierres = cierres + 1 end
  end
  assert_eq("los hilos resueltos no se dibujan", cierres, 1)
end

do
  local _, highlights = panel._build_content({ hilo() }, ANCHO)
  local tipos = require("mesh_review.types")
  local esperado = tipos.by_label["edita"].mark_hl
  local encontrado = false
  for _, hl in ipairs(highlights) do
    if hl[1] == esperado and hl[2] == 0 then encontrado = true end
  end
  assert_eq("el borde superior lleva el mark_hl del tipo", encontrado, true)
end

do
  local _, highlights = panel._build_content({ hilo({ commentType = "inventado" }) }, ANCHO)
  local encontrado = false
  for _, hl in ipairs(highlights) do
    if hl[1] == "MeshReviewDetached" then encontrado = true end
  end
  assert_eq("un tipo desconocido cae al grupo atenuado", encontrado, true)
end

do
  -- Sin cita: la caja se dibuja igual, sin línea de cita.
  local lines = panel._build_content({ hilo({ anchor = nil }) }, ANCHO)
  assert_all_width("hilo sin ancla sigue cuadrando", lineas_de_caja(lines), ANCHO)
end

do
  -- Un cuerpo con salto de línea llegaba a romper el render entero: se trocea.
  local lines = panel._build_content({ hilo({
    messages = {
      { author = { kind = "human", name = "PabloCoello" },
        body = "primera línea\nsegunda línea" },
    },
  }) }, ANCHO)
  assert_all_width("cuerpo multilínea sigue cuadrando", lineas_de_caja(lines), ANCHO)
end

do
  local lines = panel._build_content({}, ANCHO)
  assert_eq("sin hilos abiertos hay un aviso",
    table.concat(lines, "\n"):find("Sin hilos abiertos", 1, true) ~= nil, true)
end

do
  -- Un ancho ridículo no debe reventar el render.
  local lines = panel._build_content({ hilo() }, 8)
  assert_all_width("ancho mínimo no rompe la caja", lineas_de_caja(lines), 8)
end

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
io.stderr:write(string.format("\n%d passed, %d failed\n", pass, fail))

if fail > 0 then
  vim.cmd("cq")  -- exit 1
end

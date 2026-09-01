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
-- Autor y fecha
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== autor ===\n")

assert_eq("humano: su nombre",
  panel._fmt_author({ kind = "human", name = "PabloCoello" }), "PabloCoello")
assert_eq("humano sin nombre: interrogante",
  panel._fmt_author({ kind = "human" }), "?")
-- El esquema no da `name` a los agentes, su identidad es `model`. Leer `name`
-- aquí es lo que dejaba TODOS los mensajes de agente en «ai:?».
assert_eq("agente: su modelo, no interrogante",
  panel._fmt_author({ kind = "ai", model = "claude-opus-5" }), "claude-opus-5")
assert_eq("agente sin modelo: etiqueta genérica",
  panel._fmt_author({ kind = "ai" }), "agente")
assert_eq("autor ausente: interrogante", panel._fmt_author(nil), "?")

io.stderr:write("\n=== fecha ===\n")

-- Referencia fija: 1 de septiembre de 2026 a mediodía.
local AHORA = os.time({ year = 2026, month = 9, day = 1, hour = 12 })

assert_eq("mismo día: hoy",
  panel._fmt_date("2026-09-01T08:00:00Z", AHORA), "hoy")
assert_eq("día anterior: ayer",
  panel._fmt_date("2026-08-31T23:00:00Z", AHORA), "ayer")
assert_eq("tres días: forma corta",
  panel._fmt_date("2026-08-29T10:00:00Z", AHORA), "hace 3 d")
assert_eq("seis días: última forma relativa",
  panel._fmt_date("2026-08-26T10:00:00Z", AHORA), "hace 6 d")
-- A partir de una semana la distancia deja de decir nada útil y manda la fecha.
assert_eq("una semana: fecha ISO",
  panel._fmt_date("2026-08-25T10:00:00Z", AHORA), "2026-08-25")
assert_eq("meses atrás: fecha ISO",
  panel._fmt_date("2026-01-15T10:00:00Z", AHORA), "2026-01-15")
-- Un reloj desajustado o un sidecar de otra máquina pueden datar en el futuro.
assert_eq("fecha futura: fecha ISO, no «hace -2 d»",
  panel._fmt_date("2026-09-03T10:00:00Z", AHORA), "2026-09-03")
assert_eq("sin fecha: interrogante", panel._fmt_date(nil, AHORA), "?")
assert_eq("fecha malformada: se devuelve tal cual",
  panel._fmt_date("no-es-fecha", AHORA), "no-es-fecha")

io.stderr:write("\n=== autor en el render ===\n")

do
  local lines = panel._build_content({ hilo({
    messages = {
      { author = { kind = "ai", model = "claude-opus-5" }, body = "Confirmado." },
    },
  }) }, ANCHO)
  local todo = table.concat(lines, "\n")
  assert_eq("el mensaje de agente muestra el modelo",
    todo:find("claude-opus-5", 1, true) ~= nil, true)
  assert_eq("y ya no aparece el «ai:?» de antes",
    todo:find("ai:?", 1, true) == nil, true)
  assert_eq("el humano ya no lleva el prefijo «human:»",
    todo:find("human:", 1, true) == nil, true)
end

do
  local _, highlights = panel._build_content({ hilo({
    messages = {
      { author = { kind = "human", name = "PabloCoello" }, body = "uno" },
      { author = { kind = "ai", model = "claude-opus-5" }, body = "dos" },
    },
  }) }, ANCHO)
  local hay_special = false
  for _, hl in ipairs(highlights) do
    if hl[1] == "Special" then hay_special = true end
  end
  assert_eq("el autor agente se pinta distinto del humano", hay_special, true)
end

-- ---------------------------------------------------------------------------
-- Mapa línea → hilo (lo que usan `r`, `x` e `y` bajo el cursor)
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== mapa línea → hilo ===\n")

do
  local h1 = hilo()
  local h2 = hilo({ thread_id = "5f217def-9999-4321-8888-aaaabbbbcccc",
                    commentType = "nota", openedAt = "2026-09-01T11:00:00Z" })
  local lines, _, l2t = panel._build_content({ h1, h2 }, ANCHO)

  local n = 0
  for _ in pairs(l2t) do n = n + 1 end
  assert_eq("un hilo, una entrada en el mapa", n, 2)

  -- Cada entrada tiene que caer sobre el borde superior de su caja: es la línea
  -- desde la que thread_at_cursor busca hacia atrás.
  local todas_en_cabecera = true
  for lnum in pairs(l2t) do
    if lines[lnum + 1]:sub(1, #"┌") ~= "┌" then todas_en_cabecera = false end
  end
  assert_eq("las entradas caen sobre el borde superior", todas_en_cabecera, true)

  -- El id guardado es el completo, no el abreviado que se mostraba antes: `y`
  -- lo copia para pasárselo a :MeshRetract.
  local ids = {}
  for _, tid in pairs(l2t) do ids[tid] = true end
  assert_eq("el mapa guarda el thread_id completo del primer hilo",
    ids["8f968901-1234-4321-8888-aaaabbbbcccc"] == true, true)
  assert_eq("el mapa guarda el thread_id completo del segundo hilo",
    ids["5f217def-9999-4321-8888-aaaabbbbcccc"] == true, true)
end

io.stderr:write("\n=== re-render a otro ancho ===\n")

do
  -- Lo que hace el autocomando de resize: volver a componer con el ancho nuevo.
  for _, w in ipairs({ 30, 46, 100 }) do
    local lines = panel._build_content({ hilo() }, w)
    assert_all_width("recomposición a " .. w .. " columnas", lineas_de_caja(lines), w)
  end
end

-- ---------------------------------------------------------------------------
-- Vigilante de redimensionado
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== vigilante de redimensionado ===\n")

do
  -- Regresión: _watch_resize se declaraba DESPUÉS de M.open, que la llamaba.
  -- En Lua eso compila la referencia como global, o sea nil, y abrir el panel
  -- reventaba. Colgarla de M la resuelve en tiempo de ejecución; este caso
  -- comprueba que sigue siendo alcanzable desde fuera.
  assert_eq("_watch_resize es alcanzable", type(panel._watch_resize), "function")

  local ok_call = pcall(panel._watch_resize)
  assert_eq("registrar el vigilante no falla", ok_call, true)

  local autocmds = vim.api.nvim_get_autocmds({ group = "MeshReviewPanel" })
  assert_eq("queda registrado en su augroup", #autocmds > 0, true)

  -- Sin panel abierto el callback tiene que salir sin tocar nada, no explotar.
  local ok_evt = pcall(vim.api.nvim_exec_autocmds, "VimResized", {})
  assert_eq("dispararlo sin panel abierto no falla", ok_evt, true)

  -- close() se lleva el vigilante consigo: sin ventana no hay nada que recomponer.
  panel.close()
  local restantes = vim.api.nvim_get_autocmds({ group = "MeshReviewPanel" })
  assert_eq("close() limpia el vigilante", #restantes, 0)
end

-- ---------------------------------------------------------------------------
-- Pie de atajos
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== pie de atajos ===\n")

--- ¿Alguna línea contiene el texto dado?
local function contiene(lines, texto)
  for _, l in ipairs(lines) do
    if l:find(texto, 1, true) then return true end
  end
  return false
end

do
  -- Con sitio de sobra los cinco atajos caben en una línea.
  local hints = panel._hint_lines(panel.ATAJOS, 90)
  assert_eq("con ancho de sobra, una sola línea", #hints, 1)
  assert_eq("la línea nombra todos los atajos",
    hints[1].texto,
    "⏎ ancla · r responder · d borrar · a → IA · x resolver")
  assert_eq("hay una posición de tecla por atajo", #hints[1].teclas, #panel.ATAJOS)
end

do
  -- El pie tiene que caber en una línea en el ancho por defecto del sidebar
  -- (60 columnas → 56 celdas de interior). Es lo que decide que la caja no
  -- gane una línea de chrome por hilo.
  local hints = panel._hint_lines(panel.ATAJOS, 56)
  assert_eq("el pie cabe en una línea a 60 columnas de panel", #hints, 1)
end

do
  -- Las posiciones tienen que caer sobre la tecla, no un byte al lado: es lo que
  -- decide si se pinta la letra o el byte siguiente. Con «⏎» (3 bytes) delante,
  -- medir en caracteres en vez de en bytes desalinearía todo lo que viene detrás.
  for _, ancho in ipairs({ 12, 20, 34, 90 }) do
    local hints = panel._hint_lines(panel.ATAJOS, ancho)
    local extraidas = {}
    for _, hint in ipairs(hints) do
      for _, tecla in ipairs(hint.teclas) do
        table.insert(extraidas, hint.texto:sub(tecla[1] + 1, tecla[2]))
      end
    end

    local iguales = #extraidas == #panel.ATAJOS
    for i, atajo in ipairs(panel.ATAJOS) do
      if extraidas[i] ~= atajo.key then iguales = false end
    end
    assert_eq("ancho " .. ancho .. ": cada posición cae sobre su tecla, en orden",
      iguales, true)
  end
end

do
  -- En columna estrecha el pie se reparte en varias líneas, y ninguna se pasa
  -- del ancho: si se pasara, la caja se rompería al truncar.
  local hints = panel._hint_lines(panel.ATAJOS, 16)
  assert_eq("en 16 celdas el pie ocupa más de una línea", #hints > 1, true)
  local caben = true
  for _, hint in ipairs(hints) do
    if box.width(hint.texto) > 16 then caben = false end
  end
  assert_eq("ninguna línea del pie pasa del ancho", caben, true)
end

do
  -- Un atajo que no cabe ni solo se emite igualmente: el marco lo truncará, y
  -- perderlo en silencio sería peor.
  local hints = panel._hint_lines({ { key = "r", label = "responder" } }, 3)
  assert_eq("un atajo más largo que el ancho se emite igual", #hints, 1)
end

do
  local hints = panel._hint_lines(panel.ATAJOS, 0)
  assert_eq("ancho cero no devuelve líneas", #hints, 0)
end

do
  -- El pie va dentro del marco: si no cuadrara, rompería el borde derecho.
  for _, w in ipairs({ 8, 20, 46, 100 }) do
    local lines = panel._build_content({ hilo() }, w)
    assert_all_width("caja con pie a " .. w .. " columnas", lineas_de_caja(lines), w)
  end
end

do
  local lines = panel._build_content({ hilo() }, ANCHO)
  assert_eq("la caja anuncia el salto al ancla",    contiene(lines, "⏎ ancla"),      true)
  assert_eq("la caja anuncia el atajo de responder", contiene(lines, "r responder"), true)
  assert_eq("la caja anuncia el atajo de borrar",    contiene(lines, "d borrar"),    true)
  assert_eq("la caja anuncia el envío a la IA",      contiene(lines, "a → IA"),      true)
end

do
  -- El pie es por hilo: dos cajas, dos pies. Puesto una sola vez arriba no se
  -- sabría sobre qué hilo actúa el atajo.
  local lines = panel._build_content(
    { hilo(), hilo({ thread_id = "5f217def-9999-4321-8888-aaaabbbbcccc" }) }, ANCHO)
  local pies = 0
  for _, l in ipairs(lines) do
    if l:find("r responder", 1, true) then pies = pies + 1 end
  end
  assert_eq("cada caja lleva su propio pie", pies, 2)
end

do
  -- La tecla se pinta en el color del tipo y la etiqueta atenuada.
  local _, highlights = panel._build_content({ hilo() }, 80)
  local lines = panel._build_content({ hilo() }, 80)
  local pie_lnum = nil
  for i, l in ipairs(lines) do
    if l:find("r responder", 1, true) then pie_lnum = i - 1 end
  end
  assert_eq("hay una línea de pie", pie_lnum ~= nil, true)

  local hay_comment, hay_tipo = false, false
  for _, h in ipairs(highlights) do
    if h[2] == pie_lnum then
      if h[1] == "Comment" then hay_comment = true end
      if h[1] == "MeshReviewEditaMark" then hay_tipo = true end
    end
  end
  assert_eq("la etiqueta del pie va atenuada", hay_comment, true)
  assert_eq("las teclas del pie van en el color del tipo", hay_tipo, true)
end

-- ---------------------------------------------------------------------------
-- Mapa línea → mensaje
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== mapa línea → mensaje ===\n")

do
  local h = hilo({
    messages = {
      { id = "aaaa1111-1111-4111-8111-111111111111",
        author = { kind = "human", name = "PabloCoello" },
        body = "primero" },
      { id = "bbbb2222-2222-4222-8222-222222222222",
        author = { kind = "ai", model = "claude-opus-5" },
        body = "segundo" },
    },
  })
  local lines, _, _, l2m = panel._build_content({ h }, ANCHO)

  -- Autor y cuerpo de cada mensaje apuntan a su id; nada más.
  local por_id = {}
  for _, ref in pairs(l2m) do
    por_id[ref.msg_id] = (por_id[ref.msg_id] or 0) + 1
  end
  assert_eq("el primer mensaje ocupa dos líneas del mapa",
    por_id["aaaa1111-1111-4111-8111-111111111111"], 2)
  assert_eq("el segundo mensaje también",
    por_id["bbbb2222-2222-4222-8222-222222222222"], 2)

  -- Todas las referencias llevan el hilo al que pertenecen.
  local hilos_ok = true
  for _, ref in pairs(l2m) do
    if ref.thread_id ~= h.thread_id then hilos_ok = false end
  end
  assert_eq("cada referencia lleva su thread_id", hilos_ok, true)

  -- La cabecera y el pie NO están en el mapa: el cursor ahí no borra nada.
  local hdr_lnum, pie_lnum
  for i, l in ipairs(lines) do
    if l:sub(1, #"┌") == "┌" then hdr_lnum = i - 1 end
    if l:find("r responder", 1, true) then pie_lnum = i - 1 end
  end
  assert_eq("la cabecera no apunta a ningún mensaje", l2m[hdr_lnum], nil)
  assert_eq("el pie no apunta a ningún mensaje", l2m[pie_lnum], nil)
  assert_eq("el borde inferior tampoco", l2m[#lines - 1], nil)
end

do
  -- Un mensaje retractado no se dibuja, así que no puede estar en el mapa.
  local lines, _, _, l2m = panel._build_content({ hilo({
    messages = {
      { id = "aaaa1111-1111-4111-8111-111111111111",
        author = { kind = "human", name = "PabloCoello" },
        body = "visible" },
      { id = "cccc3333-3333-4333-8333-333333333333", retracted = true,
        author = { kind = "human", name = "PabloCoello" },
        body = "retirado" },
    },
  }) }, ANCHO)
  local ids = {}
  for _, ref in pairs(l2m) do ids[ref.msg_id] = true end
  assert_eq("el mensaje visible está en el mapa",
    ids["aaaa1111-1111-4111-8111-111111111111"], true)
  assert_eq("el retractado no está en el mapa",
    ids["cccc3333-3333-4333-8333-333333333333"], nil)
  assert_eq("el cuerpo retirado no se dibuja", contiene(lines, "retirado"), false)
end

do
  -- Un sidecar sin id de mensaje (proyección incompleta) no debe registrar una
  -- referencia inservible: retract sin msg_id fallaría en el CLI.
  local _, _, _, l2m = panel._build_content({ hilo({
    messages = {
      { author = { kind = "human", name = "PabloCoello" }, body = "sin id" },
    },
  }) }, ANCHO)
  local n = 0
  for _ in pairs(l2m) do n = n + 1 end
  assert_eq("un mensaje sin id no entra en el mapa", n, 0)
end

do
  assert_eq("message_at_cursor es alcanzable", type(panel.message_at_cursor), "function")
  -- Sin panel abierto devuelve nil en vez de reventar.
  assert_eq("sin panel abierto no hay mensaje", panel.message_at_cursor(), nil)
end

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
io.stderr:write(string.format("\n%d passed, %d failed\n", pass, fail))

if fail > 0 then
  vim.cmd("cq")  -- exit 1
end

--- tests/scribe_spec.lua — Runner headless para mesh_review.scribe
---
--- Cubre las funciones puras del módulo: texto del prompt, construcción de
--- cada argv y parseo de la respuesta JSON de herdr (incluido el caso
--- agent_not_found con exit 0).
---
--- Las llamadas reales a herdr no se pueden ejercitar en headless de forma
--- fiable: requieren un pane activo y herdr en el PATH del entorno de CI.
--- La separación puro/impuro del módulo hace que esa cobertura quede fuera
--- del runner sin pérdida de confianza en las partes que sí se pueden probar.
---
--- Cómo ejecutar (requiere ruta absoluta para que debug.getinfo resuelva el módulo):
---
---   REPO=$(git rev-parse --show-toplevel)
---   SPEC=$REPO/nvim/.config/nvim/tests/scribe_spec.lua
---   timeout 60 ~/.local/bin/nvim --headless -u NONE -c "luafile $SPEC" -c "qa!"
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
    "  REPO=$(git rev-parse --show-toplevel)\n" ..
    "  SPEC=$REPO/nvim/.config/nvim/tests/scribe_spec.lua\n" ..
    "  timeout 60 ~/.local/bin/nvim --headless -u NONE -c \"luafile $SPEC\" -c \"qa!\"\n"
  )
  vim.cmd("cq")
  return
end

local test_dir = src:match("(.+)/[^/]+$")
-- fnamemodify ":p" normaliza ".." y devuelve ruta absoluta con "/" final.
local lua_dir = vim.fn.fnamemodify(test_dir .. "/../lua/", ":p")
package.path = lua_dir .. "?.lua;" .. lua_dir .. "?/init.lua;" .. package.path

local ok, scribe = pcall(require, "mesh_review.scribe")
if not ok then
  io.stderr:write("ERROR cargando mesh_review.scribe: " .. tostring(scribe) .. "\n")
  vim.cmd("cq")
  return
end

-- ---------------------------------------------------------------------------
-- Mini-runner (mismo estilo que utf_spec.lua y types_spec.lua)
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

--- Compara una tabla argv elemento a elemento.
local function eq_argv(desc, got, expected)
  local same = type(got) == "table" and #got == #expected
  if same then
    for i, v in ipairs(expected) do
      if got[i] ~= v then same = false; break end
    end
  end
  if same then
    io.stderr:write("  ok  " .. desc .. "\n")
    pass = pass + 1
  else
    local g = type(got) == "table"
      and ("{" .. table.concat(got, ", ") .. "}")
      or tostring(got)
    local e = "{" .. table.concat(expected, ", ") .. "}"
    io.stderr:write(
      "  FAIL " .. desc ..
      "\n    got     = " .. g ..
      "\n    expected= " .. e .. "\n"
    )
    fail = fail + 1
  end
end

-- ---------------------------------------------------------------------------
-- build_prompt
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== build_prompt ===\n")

-- Ruta normal sin espacios ni caracteres especiales.
do
  local got = scribe.build_prompt("/home/user/doc.md")
  local exp = "Procesa los hilos pendientes del documento '/home/user/doc.md'."
    .. " Ejecuta: mesh-review project --pending '/home/user/doc.md'"
  eq("ruta normal", got, exp)
end

-- Ruta con espacios: las comillas simples la protegen como una sola unidad.
do
  local got = scribe.build_prompt("/home/user/mi proyecto/notas.md")
  local exp = "Procesa los hilos pendientes del documento '/home/user/mi proyecto/notas.md'."
    .. " Ejecuta: mesh-review project --pending '/home/user/mi proyecto/notas.md'"
  eq("ruta con espacios", got, exp)
end

-- Ruta con salto de línea: se colapsa a espacio para mantener el prompt en
-- una sola línea (la TUI de Claude Code trata los saltos de línea como turnos).
do
  local got = scribe.build_prompt("/home/user/doc\nmalicious.md")
  -- La función to_single_line convierte \n → " " y luego trim.
  -- Resultado de to_single_line: "/home/user/doc malicious.md"
  local exp = "Procesa los hilos pendientes del documento '/home/user/doc malicious.md'."
    .. " Ejecuta: mesh-review project --pending '/home/user/doc malicious.md'"
  eq("ruta con salto de línea (colapsado)", got, exp)
end

-- Ruta con comilla simple: el entrecomillado POSIX la escapa correctamente.
-- "it's.md" → "'it'\\''s.md'"
do
  local got = scribe.build_prompt("/home/user/it's.md")
  local exp = "Procesa los hilos pendientes del documento '/home/user/it'\\''s.md'."
    .. " Ejecuta: mesh-review project --pending '/home/user/it'\\''s.md'"
  eq("ruta con comilla simple (escapada)", got, exp)
end

-- ---------------------------------------------------------------------------
-- build_get_argv
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== build_get_argv ===\n")

do
  local got = scribe.build_get_argv()
  eq_argv("argv de get",
    got,
    { "herdr", "agent", "get", "scribe" })
end

-- ---------------------------------------------------------------------------
-- build_split_argv
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== build_split_argv ===\n")

do
  local got = scribe.build_split_argv("wB:p1", "/home/user/proyecto")
  eq_argv("argv de split",
    got,
    {
      "herdr", "pane", "split",
      "--pane",      "wB:p1",
      "--direction", "right",
      "--no-focus",
      "--cwd",       "/home/user/proyecto",
    })
end

-- Longitud exacta: 10 elementos (herdr pane split --pane P --direction right --no-focus --cwd C).
eq("longitud de split argv = 10", #scribe.build_split_argv("x", "/y"), 10)

-- ---------------------------------------------------------------------------
-- build_start_argv
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== build_start_argv ===\n")

do
  local got = scribe.build_start_argv("wB:p2")
  eq_argv("argv de start",
    got,
    {
      "herdr", "agent", "start", "scribe",
      "--kind", "claude",
      "--pane", "wB:p2",
      "--", "--settings", '{"outputStyle":"scribe"}',
    })
end

-- Los últimos tres elementos son el separador y los flags de claude.
do
  local a = scribe.build_start_argv("cualquier-pane")
  eq("start[-3] = '--'",       a[#a - 2], "--")
  eq("start[-2] = '--settings'", a[#a - 1], "--settings")
  eq("start[-1] = JSON outputStyle", a[#a], '{"outputStyle":"scribe"}')
end

-- ---------------------------------------------------------------------------
-- build_wait_argv
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== build_wait_argv ===\n")

do
  local got = scribe.build_wait_argv()
  eq_argv("argv de wait",
    got,
    { "herdr", "agent", "wait", "scribe", "--until", "idle", "--timeout", "60000" })
end

-- ---------------------------------------------------------------------------
-- build_prompt_argv
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== build_prompt_argv ===\n")

do
  local texto = "Procesa los hilos pendientes del documento '/doc.md'. Ejecuta: mesh-review project --pending '/doc.md'"
  local got = scribe.build_prompt_argv(texto)
  eq_argv("argv de prompt",
    got,
    { "herdr", "agent", "prompt", "scribe", texto })
end

-- El texto viaja como un solo elemento de argv (posición 5, índice [5]).
do
  local t = "texto de prueba"
  local a = scribe.build_prompt_argv(t)
  eq("prompt_argv[5] = texto íntegro", a[5], t)
  eq("longitud de prompt argv = 5",    #a,    5)
end

-- ---------------------------------------------------------------------------
-- pick_payload
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== pick_payload ===\n")

do
  local err_json = '{"error":{"code":"agent_not_found","message":"agent target scribe not found"},"id":"cli:agent:get"}'

  eq("stdout con contenido gana",        scribe.pick_payload('{"result":{}}', err_json), '{"result":{}}')
  eq("stdout vacío cae a stderr",        scribe.pick_payload("", err_json),              err_json)
  eq("stdout nil cae a stderr",          scribe.pick_payload(nil, err_json),             err_json)
  eq("solo espacios cae a stderr",       scribe.pick_payload("  \n ", err_json),         err_json)
  eq("ambos vacíos → cadena vacía",      scribe.pick_payload("", ""),                    "")
  eq("ambos nil → cadena vacía",         scribe.pick_payload(nil, nil),                  "")

  -- El caso que motivó la función: herdr manda el JSON de error por stderr y
  -- sale con código 1. Leyendo solo stdout, un «agent_not_found» —la señal de
  -- que hay que crear la sesión— se degradaba a «respuesta vacía» y el puente
  -- se paraba en vez de levantar scribe.
  local r = scribe.parse_herdr_response(scribe.pick_payload("", err_json))
  eq("error de stderr: ok = false",      r.ok,                                           false)
  eq("error de stderr: código",          r.error_code,                                   "agent_not_found")
  eq("error de stderr: sin raw_error",   r.raw_error,                                    nil)
end

-- ---------------------------------------------------------------------------
-- parse_herdr_response
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== parse_herdr_response ===\n")

-- Respuesta de éxito (agent get cuando existe la sesión).
do
  local json = '{"result":{"agent":{"name":"scribe","state":"idle"}},"id":"cli:agent:get"}'
  local r = scribe.parse_herdr_response(json)
  eq("éxito: ok = true",              r.ok,                    true)
  eq("éxito: result.agent.name",      r.result.agent.name,     "scribe")
  eq("éxito: result.agent.state",     r.result.agent.state,    "idle")
  eq("éxito: no hay error_code",      r.error_code,            nil)
  eq("éxito: no hay raw_error",       r.raw_error,             nil)
end

-- Respuesta de error agent_not_found con exit 0 (caso principal del flujo).
do
  local json = '{"error":{"code":"agent_not_found","message":"agent target scribe not found"},"id":"cli:agent:get"}'
  local r = scribe.parse_herdr_response(json)
  eq("agent_not_found: ok = false",          r.ok,         false)
  eq("agent_not_found: error_code correcto", r.error_code, "agent_not_found")
  eq("agent_not_found: no hay raw_error",    r.raw_error,  nil)
end

-- Respuesta de error agent_blocked (cuando se intenta prompt y el agente está ocupado).
do
  local json = '{"error":{"code":"agent_blocked","message":"agent scribe is blocked"},"id":"cli:agent:prompt"}'
  local r = scribe.parse_herdr_response(json)
  eq("agent_blocked: ok = false",          r.ok,         false)
  eq("agent_blocked: error_code correcto", r.error_code, "agent_blocked")
end

-- Respuesta vacía: herdr no escribe nada (defensa).
do
  local r = scribe.parse_herdr_response("")
  eq("vacío: ok = false",         r.ok,       false)
  eq("vacío: raw_error no nil",   r.raw_error ~= nil, true)
end

-- nil equivale a vacío.
do
  local r = scribe.parse_herdr_response(nil)
  eq("nil: ok = false",           r.ok,       false)
  eq("nil: raw_error no nil",     r.raw_error ~= nil, true)
end

-- Texto no-JSON (error del sistema, no de herdr).
do
  local r = scribe.parse_herdr_response("command not found: herdr")
  eq("no-JSON: ok = false",       r.ok,       false)
  eq("no-JSON: raw_error no nil", r.raw_error ~= nil, true)
  eq("no-JSON: no error_code",    r.error_code, nil)
end

-- JSON válido pero que no es una tabla (defensa de tipo).
do
  local r = scribe.parse_herdr_response('"solo una cadena"')
  eq("cadena JSON: ok = false",   r.ok,       false)
  eq("cadena JSON: raw_error",    r.raw_error ~= nil, true)
end

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
io.stderr:write(string.format("\n%d passed, %d failed\n", pass, fail))

if fail > 0 then
  vim.cmd("cq")  -- exit 1
end
-- Si llegamos aquí, el -c "qa!" exterior da exit 0.

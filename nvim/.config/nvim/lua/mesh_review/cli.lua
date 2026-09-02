--- mesh_review.cli — Wrapper sobre el CLI node mesh-review.mjs
---
--- Todas las llamadas usan vim.system con forma de lista (argv explícito):
--- nunca se construye una cadena de shell. El cuerpo del comentario y la razón
--- de una retractación van como argumentos de argv, nunca interpolados.
---
--- Resolución del CLI (en orden):
---   1. Ruta explícita pasada por el usuario en setup({ cli = "…" }).
---   2. Variable de entorno MESH_REVIEW_CLI.
---   3. Primera ruta conocida que exista en disco.
---   4. Si ninguna existe, o falta node, avisa con vim.notify y no registra keymaps.

local M = {}

--- Rutas conocidas donde puede estar el bundle (en orden de preferencia).
--- La primera es la stoweada desde dotmesh.
local KNOWN_PATHS = {
  vim.fn.expand("~/.claude/skills/doc-review/bin/mesh-review.mjs"),
  vim.fn.expand("~/.agents/skills/doc-review/bin/mesh-review.mjs"),
}

--- Ruta resuelta al bundle. Nil hasta que se llama a M.init_cli().
local _cli_path = nil

--- Resuelve la ruta al bundle. Devuelve true si se encontró, false si no.
--- Debe llamarse una vez desde setup(). Se llama init_cli para no colisionar
--- con M.resolve() que envuelve el subcomando "resolve" del CLI.
---
--- @param user_cli string|nil  Ruta explícita del usuario (puede ser nil).
--- @return boolean
function M.init_cli(user_cli)
  -- 1. Ruta explícita del usuario.
  if user_cli and user_cli ~= "" then
    _cli_path = user_cli
    return true
  end

  -- 2. Variable de entorno.
  local env_cli = vim.env.MESH_REVIEW_CLI
  if env_cli and env_cli ~= "" then
    _cli_path = env_cli
    return true
  end

  -- 3. Rutas conocidas.
  for _, p in ipairs(KNOWN_PATHS) do
    if vim.fn.filereadable(p) == 1 then
      _cli_path = p
      return true
    end
  end

  return false
end

--- Devuelve true si node y el bundle están disponibles.
---
--- @return boolean
function M.check_binary()
  if _cli_path == nil then return false end
  if vim.fn.executable("node") == 0 then return false end
  return vim.fn.filereadable(_cli_path) == 1
end

--- Tope de espera de una llamada síncrona al CLI, en milisegundos.
---
--- `:wait()` bloquea el hilo principal de Neovim, y `project` se llama desde el
--- autocmd BufReadPost: sin tope, un CLI que no termina (un sidecar corrupto en
--- un repo ajeno, un fallo del propio bundle) congela el editor sin que puedas
--- ni interrumpir con Ctrl-C. Diez segundos son holgados para un proyecto real
--- —mil hilos se proyectan muy por debajo de eso— y cortos para un cuelgue.
local TIMEOUT_MS = 10000

--- Ejecuta el CLI de forma síncrona. Devuelve (stdout_string, nil) o (nil, stderr).
---
--- @param args string[]  Argumentos ADICIONALES al par {"node", _cli_path}. Ninguno
---                       debe construirse concatenando rutas: pasar strings ya
---                       separados para que vayan como argv distintos.
--- @return string|nil, string|nil
local function _run(args)
  local cmd = { "node", _cli_path }
  for _, a in ipairs(args) do
    table.insert(cmd, a)
  end
  local result = vim.system(cmd, { text = true, timeout = TIMEOUT_MS }):wait()
  if result.code ~= 0 then
    local err = result.stderr
    if err == nil or err == "" then
      -- Al vencer el tope, vim.system mata el proceso y stderr suele venir
      -- vacío: sin este caso el usuario vería un "exit code 124" mudo.
      err = ("el CLI no respondió en %d s (código %d)"):format(TIMEOUT_MS / 1000, result.code)
    end
    return nil, err
  end
  return result.stdout, nil
end

--- Ejecuta el CLI de forma asíncrona (fire-and-forget). Avisa por vim.notify si
--- el proceso termina con error.
---
--- @param args string[]  Argumentos adicionales.
--- @param on_error string|nil  Prefijo del mensaje de error para vim.notify.
local function _run_async(args, on_error)
  local cmd = { "node", _cli_path }
  for _, a in ipairs(args) do
    table.insert(cmd, a)
  end
  vim.system(cmd, { text = true }, function(result)
    if result.code ~= 0 then
      local msg = on_error or "[mesh-review]"
      vim.schedule(function()
        vim.notify(msg .. ": " .. (result.stderr or "exit " .. result.code),
          vim.log.levels.WARN)
      end)
    end
  end)
end

--- Proyecta los hilos abiertos del documento.
--- Equivale a: node <cli> project <doc>
--- (Sin --pending: devuelve todos los hilos open para el panel.)
---
--- @param doc string  Ruta al documento (absoluta o relativa al cwd de Neovim).
--- @return table|nil, string|nil  Array de hilos o nil + mensaje de error.
function M.project(doc)
  local out, err = _run({ "project", doc })
  if out == nil then return nil, err end
  local ok, data = pcall(vim.fn.json_decode, out)
  if not ok then
    return nil, "Error al parsear JSON de project: " .. tostring(data)
  end
  if type(data) ~= "table" then
    return nil, "Salida inesperada de project (no es array): " .. vim.inspect(data)
  end
  return data, nil
end

--- Abre un hilo en el rango de offsets dado.
--- Equivale a: node <cli> open <doc> --offset N --end-offset N --type T --body B
---
--- @param doc        string   Ruta al documento.
--- @param offset     number   Offset UTF-16 de inicio (inclusive).
--- @param end_offset number   Offset UTF-16 de fin (exclusive).
--- @param type       string   Tipo de comentario ("nota", "duda", etc.).
--- @param body       string   Cuerpo del comentario (texto libre; va como argv).
--- @param opts       table|nil  Opciones opcionales: { author, model, confidence, assignee }.
--- @return string|nil, string|nil  thread_id o nil + error.
function M.open(doc, offset, end_offset, type, body, opts)
  opts = opts or {}
  local args = {
    "open", doc,
    "--offset", tostring(offset),
    "--end-offset", tostring(end_offset),
    "--type", type,
    "--body", body,
  }
  if opts.author then
    table.insert(args, "--author")
    table.insert(args, opts.author)
  end
  if opts.model then
    table.insert(args, "--model")
    table.insert(args, opts.model)
  end
  if opts.confidence then
    table.insert(args, "--confidence")
    table.insert(args, tostring(opts.confidence))
  end
  if opts.assignee then
    table.insert(args, "--assignee")
    table.insert(args, opts.assignee)
  end
  local out, err = _run(args)
  if out == nil then return nil, err end
  local thread_id = vim.trim(out)
  if thread_id == "" then
    return nil, "open no devolvió thread_id"
  end
  return thread_id, nil
end

--- Publica un mensaje de respuesta en un hilo.
--- Equivale a: node <cli> reply <doc> <thread_id> --body B
---
--- @param doc       string    Ruta al documento.
--- @param thread_id string    UUID del hilo.
--- @param body      string    Texto del mensaje (argv, no shell).
--- @param opts      table|nil  Opciones: { author, model }.
--- @return string|nil, string|nil  event_id o nil + error.
function M.reply(doc, thread_id, body, opts)
  opts = opts or {}
  local args = { "reply", doc, thread_id, "--body", body }
  if opts.author then
    table.insert(args, "--author")
    table.insert(args, opts.author)
  end
  if opts.model then
    table.insert(args, "--model")
    table.insert(args, opts.model)
  end
  local out, err = _run(args)
  if out == nil then return nil, err end
  local event_id = vim.trim(out)
  if event_id == "" then return nil, "reply no devolvió event_id" end
  return event_id, nil
end

--- Resuelve (cierra) un hilo.
--- Equivale a: node <cli> resolve <doc> <thread_id>
---
--- @param doc       string    Ruta al documento.
--- @param thread_id string    UUID del hilo.
--- @param opts      table|nil  Sin opciones actualmente (reservado).
--- @return string|nil, string|nil  event_id o nil + error.
function M.resolve(doc, thread_id, opts)
  -- opts reservado para compatibilidad futura; sin uso actualmente
  local args = { "resolve", doc, thread_id }
  local out, err = _run(args)
  if out == nil then return nil, err end
  local event_id = vim.trim(out)
  if event_id == "" then return nil, "resolve no devolvió event_id" end
  return event_id, nil
end

--- Retracta un mensaje de un hilo.
--- Equivale a: node <cli> retract <doc> <thread_id> <msg_id> [--reason R]
---
--- @param doc       string       Ruta al documento.
--- @param thread_id string       UUID del hilo.
--- @param msg_id    string       UUID del mensaje a retirar.
--- @param reason    string|nil   Razón (texto libre; va como argv, no shell).
--- @return string|nil, string|nil  event_id o nil + error.
function M.retract(doc, thread_id, msg_id, reason)
  local args = { "retract", doc, thread_id, msg_id }
  if reason and reason ~= "" then
    table.insert(args, "--reason")
    table.insert(args, reason)  -- argv separado; sin interpolación de shell
  end
  local out, err = _run(args)
  if out == nil then return nil, err end
  local event_id = vim.trim(out)
  if event_id == "" then return nil, "retract no devolvió event_id" end
  return event_id, nil
end

--- Re-ancla los hilos del documento tras un guardado.
--- Equivale a: node <cli> reanchor <doc>
--- Se ejecuta de forma asíncrona para no bloquear BufWritePost.
---
--- @param doc string  Ruta al documento.
--- @return nil
function M.reanchor(doc)
  _run_async({ "reanchor", doc }, "[mesh-review] reanchor")
end

--- Asigna un hilo a un subagente conocido.
--- Equivale a: node <cli> assign <doc> <thread_id> --agent <agent>
---
--- El CLI valida que el hilo exista y que el agente sea uno de
--- security|maths|reviser|editor antes de emitir el evento.
---
--- @param doc       string  Ruta al documento.
--- @param thread_id string  UUID del hilo.
--- @param agent     string  Nombre del subagente (security|maths|reviser|editor).
--- @return string|nil, string|nil  event_id o nil + mensaje de error.
function M.assign(doc, thread_id, agent)
  local args = { "assign", doc, thread_id, "--agent", agent }
  local out, err = _run(args)
  if out == nil then return nil, err end
  local event_id = vim.trim(out)
  if event_id == "" then return nil, "assign no devolvió event_id" end
  return event_id, nil
end

--- Proyecta un único hilo del documento.
--- Equivale a: node <cli> project --thread <thread_id> <doc>
--- Devuelve un array de un elemento o un array vacío si el hilo no existe.
---
--- @param doc       string  Ruta al documento.
--- @param thread_id string  UUID del hilo.
--- @return table|nil, string|nil  Array (0 ó 1 elementos) o nil + error.
function M.project_thread(doc, thread_id)
  local out, err = _run({ "project", "--thread", thread_id, doc })
  if out == nil then return nil, err end
  local ok, data = pcall(vim.fn.json_decode, out)
  if not ok then
    return nil, "Error al parsear JSON de project --thread: " .. tostring(data)
  end
  if type(data) ~= "table" then
    return nil, "Salida inesperada de project --thread: " .. vim.inspect(data)
  end
  return data, nil
end

return M

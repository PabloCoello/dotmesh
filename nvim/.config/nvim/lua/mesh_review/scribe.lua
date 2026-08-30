--- mesh_review.scribe — Puente Neovim→herdr para la sesión scribe.
---
--- Separa las funciones puras (constructoras de texto y argv, parseador de
--- respuestas herdr) de la lógica asíncrona que ejecuta procesos externos,
--- de modo que las primeras sean verificables en headless sin proceso externo.
---
--- Funciones puras exportadas: build_prompt, build_get_argv, build_split_argv,
--- build_start_argv, build_wait_argv, build_prompt_argv, parse_herdr_response.
--- Función impura principal: ensure_and_prompt.
---
--- Por qué ruta absoluta en el prompt: el prompt se ejecuta en un pane cuyo
--- cwd no controlamos del todo. mesh-review acepta rutas absolutas y así se
--- evita cualquier ambigüedad con el cwd del agente.
---
--- Por qué asíncrono: la cadena get→split→start→wait→prompt puede tardar
--- hasta un minuto en el paso wait (Claude tarda en arrancar). Bloquear el
--- hilo principal de Neovim congelaría el editor; toda la cadena va en
--- callbacks de vim.system, y cualquier llamada a la API de Neovim desde un
--- callback va dentro de vim.schedule.
---
--- Por qué no --style: el flag --style no existe en la CLI de Claude Code
--- instalada (comprobado con claude 2.1.251, "error: unknown option --style").
--- La persona se fija con --settings y un JSON que claude recibe como un solo
--- elemento de argv, sin shell de por medio.

local M = {}

-- ---------------------------------------------------------------------------
-- Saneado de valores interpolados en el prompt
-- ---------------------------------------------------------------------------

--- Colapsa caracteres de control a espacios y recorta los extremos.
--- Los saltos de línea y otros C0/DEL no deben viajar en el texto de un prompt:
--- si el agente ejecuta el comando, un salto de línea rompería el flujo.
--- %c cubre C0 (0x00-0x1F) y DEL (0x7F) en ASCII.
---
--- @param value string
--- @return string
local function to_single_line(value)
  return (value:gsub("%c+", " "):match("^%s*(.-)%s*$"))
end

--- Entrecomillado POSIX con comillas simples.
--- Neutraliza expansiones de shell si el texto cayera sobre una shell viva;
--- para el agente es una ruta citada más legible con espacios.
--- Técnica: cerrar la cadena, insertar el literal \'\ y reabrir.
---
--- @param value string
--- @return string
local function shell_quote(value)
  return "'" .. value:gsub("'", "'\\''") .. "'"
end

-- ---------------------------------------------------------------------------
-- Constructoras de texto del prompt (puras, testeables sin proceso externo)
-- ---------------------------------------------------------------------------

--- Construye el texto del prompt «enviar pendientes» para la sesión scribe.
---
--- La redacción coincide con buildSendAllPrompt de la extensión de VS Code
--- para que las dos superficies pidan lo mismo al agente. La ruta va
--- entrecomillada (POSIX) porque cuando scribe ejecuta mesh-review, una ruta
--- con espacios se partiría como dos argumentos si no lleva comillas.
--- El prompt es una sola línea: la TUI de Claude Code trata un salto de línea
--- como un turno nuevo, lo que rompería la petición.
---
--- @param doc_abs string  Ruta absoluta al documento.
--- @return string  Texto del prompt listo para enviar a herdr agent prompt.
function M.build_prompt(doc_abs)
  local doc = shell_quote(to_single_line(doc_abs))
  return "Procesa los hilos pendientes del documento " .. doc
    .. ". Ejecuta: mesh-review project --pending " .. doc
end

-- ---------------------------------------------------------------------------
-- Constructoras de argv (puras, testeables sin proceso externo)
-- ---------------------------------------------------------------------------

--- Construye el argv para consultar el estado del agente scribe.
---
--- Nota: herdr agent get devuelve exit 0 incluso si el agente no existe;
--- la respuesta hay que parsearla para distinguir éxito de agent_not_found.
---
--- @return table
function M.build_get_argv()
  return { "herdr", "agent", "get", "scribe" }
end

--- Construye el argv para dividir un pane de herdr.
---
--- @param pane_id string  ID del pane actual (valor de HERDR_PANE_ID).
--- @param cwd     string  Directorio de trabajo para el nuevo pane.
--- @return table
function M.build_split_argv(pane_id, cwd)
  return {
    "herdr", "pane", "split",
    "--pane",      pane_id,
    "--direction", "right",
    "--no-focus",
    "--cwd",       cwd,
  }
end

--- Construye el argv para arrancar el agente scribe en un pane.
---
--- Por qué --settings y no --style: --style no existe en la CLI de Claude Code
--- instalada (2.1.251). La persona se fija pasando --settings con un JSON como
--- un solo elemento de argv; claude lo recibe sin que haya una shell de por
--- medio que lo interprete.
---
--- herdr agent start registra el agente con el nombre «scribe» en un solo paso,
--- así queda disponible como target de herdr agent prompt sin pasos adicionales.
---
--- @param new_pane_id string  ID del pane recién creado por build_split_argv.
--- @return table
function M.build_start_argv(new_pane_id)
  return {
    "herdr", "agent", "start", "scribe",
    "--kind", "claude",
    "--pane", new_pane_id,
    "--", "--settings", '{"outputStyle":"scribe"}',
  }
end

--- Construye el argv para esperar a que scribe alcance el estado idle.
--- El timeout de 60 000 ms cubre el arranque de Claude en frío.
---
--- @return table
function M.build_wait_argv()
  return { "herdr", "agent", "wait", "scribe", "--until", "idle", "--timeout", "60000" }
end

--- Construye el argv para enviar un prompt a la sesión scribe.
--- El texto del prompt viaja como un solo elemento de argv: no hay shell que
--- lo interprete ni necesidad de entrecomillarlo de nuevo para el proceso.
---
--- @param text string  Texto del prompt (resultado de build_prompt).
--- @return table
function M.build_prompt_argv(text)
  return { "herdr", "agent", "prompt", "scribe", text }
end

-- ---------------------------------------------------------------------------
-- Parseador de respuestas herdr (puro, testeable sin proceso externo)
-- ---------------------------------------------------------------------------

--- Parsea la respuesta JSON de un comando herdr.
---
--- herdr puede:
---   · Devolver JSON con campo «result» en éxito.
---   · Devolver JSON con campo «error» y exit 0 (p. ej. agent_not_found).
---   · Devolver una cadena vacía ante fallos internos (defensa).
---   · Devolver texto no JSON ante errores del sistema.
---
--- @param stdout string  Salida estándar del proceso herdr.
--- @return table  Uno de:
---   { ok = true,  result = table }                        → éxito
---   { ok = false, error_code = string, data = table }     → error herdr conocido
---   { ok = false, raw_error = string }                    → JSON inválido o vacío
function M.parse_herdr_response(stdout)
  if not stdout or stdout == "" then
    return { ok = false, raw_error = "respuesta vacía" }
  end
  local ok, data = pcall(vim.json.decode, stdout)
  if not ok or type(data) ~= "table" then
    -- Truncar el texto crudo para que el mensaje de error sea legible.
    local snippet = tostring(stdout):sub(1, 80)
    return { ok = false, raw_error = "JSON inválido: " .. snippet }
  end
  if data.error then
    local code = type(data.error) == "table"
      and data.error.code
      or tostring(data.error)
    return { ok = false, error_code = code, data = data }
  end
  return { ok = true, result = data.result, data = data }
end

-- ---------------------------------------------------------------------------
-- Lógica asíncrona (impura: ejecuta procesos externos, usa la API de Neovim)
-- ---------------------------------------------------------------------------

--- Emite una notificación de error desde cualquier contexto.
--- vim.schedule garantiza que la llamada se haga en el hilo principal de Neovim
--- aunque se llame desde el callback de vim.system.
---
--- @param msg string
local function notify_error(msg)
  vim.schedule(function()
    vim.notify("[mesh-review] scribe: " .. msg, vim.log.levels.ERROR)
  end)
end

--- Emite una notificación informativa desde cualquier contexto.
---
--- @param msg string
local function notify_info(msg)
  vim.schedule(function()
    vim.notify("[mesh-review] scribe: " .. msg, vim.log.levels.INFO)
  end)
end

--- Envía el prompt a scribe y notifica el resultado.
--- is_new_session distingue el mensaje de éxito (sesión nueva vs. reutilizada).
---
--- @param prompt_text    string   Texto del prompt.
--- @param is_new_session boolean  True si la sesión se acaba de crear.
local function do_prompt(prompt_text, is_new_session)
  vim.system(M.build_prompt_argv(prompt_text), { text = true }, function(result)
    if result.code ~= 0 then
      local parsed = M.parse_herdr_response(result.stdout or "")
      if not parsed.ok and parsed.error_code == "agent_blocked" then
        notify_error("el agente está ocupado (agent_blocked); vuelve a intentarlo más tarde")
      else
        local msg = (result.stderr and result.stderr ~= "" and result.stderr)
          or (not parsed.ok and parsed.raw_error)
          or "error desconocido"
        notify_error("agent prompt: " .. msg)
      end
    else
      if is_new_session then
        notify_info("sesión scribe creada y pendientes enviados")
      else
        notify_info("pendientes enviados a scribe")
      end
    end
  end)
end

--- Crea la sesión scribe en un pane nuevo y envía el prompt cuando esté lista.
--- Flujo: pane split → agent start → agent wait → agent prompt.
---
--- @param prompt_text string  Texto ya construido del prompt.
--- @param pane_id     string  ID del pane actual (HERDR_PANE_ID).
--- @param cwd         string  Directorio de trabajo para el nuevo pane.
local function create_session_and_prompt(prompt_text, pane_id, cwd)
  vim.system(M.build_split_argv(pane_id, cwd), { text = true }, function(split_result)
    if split_result.code ~= 0 then
      notify_error("pane split: " .. (split_result.stderr or "error"))
      return
    end
    local split_parsed = M.parse_herdr_response(split_result.stdout or "")
    if not split_parsed.ok then
      local msg = split_parsed.raw_error or split_parsed.error_code or "error"
      notify_error("pane split: " .. msg)
      return
    end
    local new_pane_id = split_parsed.result
      and split_parsed.result.pane
      and split_parsed.result.pane.pane_id
    if not new_pane_id then
      notify_error("pane split: no se obtuvo pane_id en la respuesta")
      return
    end
    vim.system(M.build_start_argv(new_pane_id), { text = true }, function(start_result)
      if start_result.code ~= 0 then
        notify_error("agent start: " .. (start_result.stderr or "error"))
        return
      end
      -- Esperar a que scribe esté idle: Claude tarda varios segundos en arrancar
      -- y un prompt enviado antes de tiempo se pierde silenciosamente.
      vim.system(M.build_wait_argv(), { text = true }, function(wait_result)
        if wait_result.code ~= 0 then
          notify_error("agent wait: " .. (wait_result.stderr or "error"))
          return
        end
        do_prompt(prompt_text, true)
      end)
    end)
  end)
end

--- Asegura que existe una sesión scribe y le envía el prompt de pendientes.
---
--- Flujo:
---   1. herdr agent get scribe.
---      · Existe → paso 3.
---      · agent_not_found → paso 2.
---      · Otro error → notificar y parar.
---   2. Crear sesión: split del pane actual + agent start + agent wait.
---   3. herdr agent prompt scribe <texto>.
---
--- Precondición: HERDR_ENV=1 (comprobado en el llamador).
--- Toda la cadena es asíncrona; nada bloquea el hilo principal de Neovim.
---
--- @param doc_abs string  Ruta absoluta al documento (base del prompt y --cwd del pane).
function M.ensure_and_prompt(doc_abs)
  local pane_id = vim.env.HERDR_PANE_ID
  if not pane_id or pane_id == "" then
    vim.notify("[mesh-review] scribe: HERDR_PANE_ID no disponible", vim.log.levels.WARN)
    return
  end

  -- El cwd del nuevo pane es el directorio del documento. Es la mejor
  -- aproximación al contexto del fichero sin depender de un git root
  -- que puede no existir (p.ej. fichero fuera de un repositorio).
  local cwd = vim.fn.fnamemodify(doc_abs, ":h")
  local prompt_text = M.build_prompt(doc_abs)

  vim.system(M.build_get_argv(), { text = true }, function(get_result)
    -- No confiar en el exit code de «herdr agent get»: devuelve 0 incluso
    -- cuando el agente no existe. Parsear el JSON y comprobar el campo error.
    local parsed = M.parse_herdr_response(get_result.stdout or "")
    if parsed.ok then
      -- La sesión ya existe: enviar el prompt directamente.
      do_prompt(prompt_text, false)
    elseif parsed.error_code == "agent_not_found" then
      -- La sesión no existe: crearla antes de enviar.
      create_session_and_prompt(prompt_text, pane_id, cwd)
    else
      local msg = parsed.raw_error
        or parsed.error_code
        or (get_result.stderr and get_result.stderr ~= "" and get_result.stderr)
        or "error desconocido"
      notify_error("agent get: " .. msg)
    end
  end)
end

return M

--- mesh_review.scribe — Puente Neovim→herdr para la sesión scribe.
---
--- Separa las funciones puras (constructoras de texto y argv, parseador de
--- respuestas herdr) de la lógica asíncrona que ejecuta procesos externos,
--- de modo que las primeras sean verificables en headless sin proceso externo.
---
--- Funciones puras exportadas: build_prompt, build_get_argv, build_split_argv,
--- build_start_argv, build_wait_argv, build_prompt_argv, build_read_pane_argv,
--- build_focus_agent_argv, is_trust_dialog, pick_payload, parse_herdr_response.
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

--- Construye el argv para leer el contenido visible de un pane.
---
--- La salida es texto plano, no JSON: no debe pasar por parse_herdr_response.
--- Se usa para detectar el diálogo de confianza de carpeta de Claude Code
--- antes de enviar el prompt, ya que herdr devuelve idle aunque ese diálogo
--- esté delante.
---
--- @param pane_id string   ID del pane a leer.
--- @param lines   integer  Número de líneas visibles a leer.
--- @return table
function M.build_read_pane_argv(pane_id, lines)
  return { "herdr", "pane", "read", pane_id, "--source", "visible", "--lines", tostring(lines) }
end

--- Construye el argv para enfocar el agente scribe.
---
--- Se usa herdr agent focus (no herdr pane focus, que solo acepta --direction
--- y no un ID, por lo que no sirve para apuntar a un pane concreto).
--- El enfoque permite que el usuario vea el diálogo de confianza sin buscar
--- el pane manualmente.
---
--- @return table
function M.build_focus_agent_argv()
  return { "herdr", "agent", "focus", "scribe" }
end

--- Detecta el diálogo de confianza de carpeta de Claude Code en la pantalla
--- de un pane.
---
--- Claude Code pide confirmación antes de acceder a un directorio que no ha
--- visto antes. Con ese diálogo delante, herdr devuelve idle e
--- interactive_ready = true de todas formas, de modo que build_wait_argv da
--- luz verde en falso. Hay que leer la pantalla y comprobar explícitamente.
---
--- La detección exige al menos dos marcadores independientes para evitar
--- falsos positivos por documentos que casualmente contengan una frase.
--- La pantalla puede venir envuelta al ancho del pane, así que los marcadores
--- son cadenas cortas que no dependan de líneas completas.
---
--- Marcadores fiables del diálogo real:
---   "Yes, I trust this folder"
---   "No, exit"
---   "Enter to confirm"
---
--- IMPORTANTE: este plugin nunca responde al diálogo ni envía teclas. Confiar
--- en un directorio es una decisión de seguridad del humano. La tentación de
--- mandar «Y\n» o similar debe resistirse: el plugin solo detecta y avisa.
---
--- @param screen string  Texto plano leído del pane (salida de herdr pane read).
--- @return boolean       true si el diálogo está presente, false en cualquier otro caso.
function M.is_trust_dialog(screen)
  if type(screen) ~= "string" or screen == "" then
    return false
  end
  local markers = {
    "Yes, I trust this folder",
    "No, exit",
    "Enter to confirm",
  }
  local found = 0
  for _, marker in ipairs(markers) do
    if screen:find(marker, 1, true) then
      found = found + 1
      if found >= 2 then
        return true
      end
    end
  end
  return false
end

-- ---------------------------------------------------------------------------
-- Selección de la carga útil de un proceso herdr
-- ---------------------------------------------------------------------------

--- Devuelve el flujo que trae el JSON de una invocación de herdr.
---
--- herdr imprime el resultado en stdout, pero el JSON de **error** va a stderr
--- y el proceso sale con código distinto de cero:
---
---   $ herdr agent get scribe        # sin sesión scribe
---   (stdout vacío)
---   (stderr) {"error":{"code":"agent_not_found",…},"id":"cli:agent:get"}
---   $ echo $?
---   1
---
--- Leer solo stdout convertía un «agent_not_found» legítimo —la señal de que
--- hay que crear la sesión— en «respuesta vacía», y el puente se paraba en vez
--- de levantar scribe. Se prefiere stdout cuando trae algo; si no, stderr.
---
--- @param stdout string|nil
--- @param stderr string|nil
--- @return string  Cadena a parsear (vacía si ambos flujos lo están).
function M.pick_payload(stdout, stderr)
  local out = vim.trim(stdout or "")
  if out ~= "" then return out end
  return vim.trim(stderr or "")
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
      local parsed = M.parse_herdr_response(M.pick_payload(result.stdout, result.stderr))
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
    local split_parsed = M.parse_herdr_response(M.pick_payload(split_result.stdout, split_result.stderr))
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
        -- Antes de enviar el prompt, leer la pantalla del pane recién creado.
        -- herdr agent wait devuelve idle aunque Claude muestre el diálogo de
        -- confianza de carpeta (interactive_ready = true en ese estado), por lo
        -- que hay que comprobarlo explícitamente. La salida de pane read es
        -- texto plano, no JSON: no pasa por parse_herdr_response.
        vim.system(M.build_read_pane_argv(new_pane_id, 30), { text = true }, function(read_result)
          -- Si la lectura falla no se puede saber si hay diálogo, y una pantalla
          -- vacía se leería como «no hay»: el prompt saldría a ciegas y su Enter
          -- confirmaría el «No, exit» que el diálogo trae preseleccionado,
          -- matando la sesión. Ante la duda no se envía; el usuario decide.
          if read_result.code ~= 0 then
            notify_error(
              "no se pudo leer la pantalla del pane ("
              .. vim.trim(read_result.stderr or ("código " .. tostring(read_result.code)))
              .. "). No se ha enviado nada: comprueba el pane scribe y vuelve a pulsar <líder>rs."
            )
            return
          end
          local screen = vim.trim(read_result.stdout or "")
          if M.is_trust_dialog(screen) then
            -- Enfocar el pane para que el usuario vea el diálogo sin buscarlo.
            -- NUNCA responder al diálogo por cuenta propia: confiar en un
            -- directorio es una decisión de seguridad del humano. Ni teclas,
            -- ni config, ni banderas de Claude. Solo detectar y avisar.
            -- Callback vacío a propósito: enfocar es una cortesía, no un paso
            -- del que dependa nada. Si falla, el aviso de abajo sigue diciendo
            -- al usuario dónde mirar.
            vim.system(M.build_focus_agent_argv(), { text = true }, function() end)
            vim.schedule(function()
              vim.notify(
                "[mesh-review] scribe: Claude pide confirmación de confianza en la carpeta."
                .. " Acepta el diálogo en el pane scribe y vuelve a pulsar <líder>rs.",
                vim.log.levels.WARN
              )
            end)
            return
          end
          do_prompt(prompt_text, true)
          -- Red de seguridad barata: si el diálogo no se detectó pero el
          -- agente desaparece poco después de recibir el prompt, es probable
          -- que el texto del diálogo haya cambiado y la detección haya fallado.
          -- Comprobar unos segundos más tarde sin bloquear el editor.
          vim.schedule(function()
            vim.defer_fn(function()
              vim.system(M.build_get_argv(), { text = true }, function(chk)
                local p = M.parse_herdr_response(M.pick_payload(chk.stdout, chk.stderr))
                if not p.ok and p.error_code == "agent_not_found" then
                  vim.schedule(function()
                    vim.notify(
                      "[mesh-review] scribe: la sesión desapareció al recibir el prompt."
                      .. " Causa probable: diálogo de confianza de carpeta no aceptado."
                      .. " Acepta la confianza en el pane scribe y vuelve a pulsar <líder>rs.",
                      vim.log.levels.WARN
                    )
                  end)
                end
              end)
            end, 4000)
          end)
        end)
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
    -- Se parsea el JSON en vez de mirar solo el exit code porque hace falta el
    -- código concreto: «agent_not_found» significa «crea la sesión» y cualquier
    -- otro es un fallo que reportar. Ese JSON llega por stderr, no por stdout
    -- (ver pick_payload).
    local parsed = M.parse_herdr_response(M.pick_payload(get_result.stdout, get_result.stderr))
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

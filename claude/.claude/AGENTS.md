# Convenciones globales de agente

Instrucciones de comportamiento para cualquier agente de IA en esta máquina.

> **Fuente de verdad:** `~/Documentos/GitHub/dotmesh/AGENTS.md`. Este fichero
> es un resumen de las convenciones más comunes; cuando hay conflicto entre
> ambos, prevalece el `AGENTS.md` del repo. Si editas convenciones globales,
> hazlo en el repo y actualiza este fichero para mantener la sincronía.

Los proyectos pueden tener su propio `AGENTS.md`/`CLAUDE.md` que prevalece
sobre este archivo.

## Git

- **Sin autoría de LLM en metadatos de Git.** Mensajes de commit, nombres de rama
  y trailers describen la intención humana y el cambio en el repositorio, no la
  herramienta de IA que ayudó. No añadas `Co-authored-by`, `Author`,
  `Signed-off-by`, `Generated-by`, slugs de rama ni atribución similar para Claude,
  Codex, OpenCode, Copilot, ChatGPT u otro LLM/agente, salvo que el usuario lo pida
  explícitamente con esa atribución exacta.
- **Push y PR solo a petición.** Los commits locales en una rama de trabajo son
  parte normal del flujo (los commits por slice de `incremental-implementation`) y
  no requieren que el usuario los pida. No hagas push ni abras PR sin que el usuario
  lo pida, y no commitees directamente en la rama por defecto: si estás en ella,
  crea una rama antes.
- **Flujo Git autónomo (`/super-git`).** Gestiona el ciclo no destructivo de
  principio a fin: fetch, fast-forward cuando sea seguro, nombre de rama, commits
  semánticos incrementales, verificación, push y creación de PR. Prefiere trabajo
  branch-first y por slices antes que ordenar a posteriori un worktree sucio. Si el
  diff pendiente ya está enredado, sepáralo solo donde los límites estén claros y
  pregunta antes de stagear hunks ambiguos.
- **No operaciones destructivas sin permiso.** Nada de force-push, `reset --hard`,
  `clean` destructivo, descartar trabajo, stagear secretos, pushear a la rama por
  defecto ni cambiar la identidad de Git sin confirmación explícita.

## Artefactos de trabajo

- No crees `SPEC.md`, `PLAN.md`, `TODO.md`, `NOTES.md`, `CHECKPOINT.md` en la raíz
  salvo petición explícita.
- Por defecto, trabaja en conversación. Solo persiste artefactos si el usuario lo
  pide, si la tarea es larga o si hay riesgo real de perder contexto.
- Planificación persistente en `.ai/tasks/YYYY-MM-DD-slug/{spec.md,plan.md}`.
- Scratch temporal en `.ai/tmp/`.
- Por defecto solo se ignora `.ai/tmp/`. Cada proyecto decide si versiona
  `.ai/tasks/`.

## Secretos

- **Nunca metas secretos en el repositorio.** Tokens y credenciales se cargan
  fuera de banda. Los servidores MCP reciben secretos por variables de entorno, no
  por configuración commiteada.

## Sandbox de Bash

Activo en toda la máquina desde el 13-09-2026 (`sandbox.enabled` en
`~/.claude/settings.json`). Con `defaultMode: bypassPermissions` es el único
freno real que queda, así que no lo esquives por comodidad.

- **Dentro de la caja solo se escribe** en el directorio de trabajo, el temporal
  de sesión y `~/.npm`. El resto de `$HOME` no, aunque el comando parezca
  inofensivo. Para temporales usa `$TMPDIR`, nunca `/tmp` a pelo.
- **Sin `bubblewrap` y `socat` la sesión no arranca**, porque la plantilla lleva
  `failIfUnavailable`. Correr sin caja y no enterarse es peor que no correr.
- **Cuatro comandos corren fuera** (`excludedCommands`): `stow` y `make`, que
  escriben por todo `$HOME` cuando instalan dotfiles; `herdr`, que necesita su
  socket Unix; y `gh`, que dentro de la caja pierde el token del llavero y se
  degrada a anónimo sin decirlo.
- **La exclusión vale para el comando que lanzas, no para lo que ese comando
  lance.** Dentro de un script todo hereda la caja. Por eso un harness que
  arranca sesiones headless se corre por su target de `make`, no llamando al
  script: un `claude -p` anidado dentro de la caja falla con «Not logged in».
- **La exclusión solo alcanza al comando desnudo, y eso es nuevo.** Hasta la
  2.1.274 bastaba con que un comando de la cadena estuviera excluido para que
  saliera fuera la llamada entera: medido el 14-09 y el 20-09, en
  `gh --version; echo "$TMPDIR"` el `echo` también corría fuera, con `TMPDIR`
  vacío y 826 procesos del anfitrión frente a 6 desde dentro. Vuelto a medir el
  02-10-2026 contra la 2.1.287, esa misma línea da `TMPDIR` puesto y 5
  procesos: la cadena ahora corre **dentro**. El agujero se cerró entre las dos
  versiones. Upstream no documenta ni el agujero ni su cierre, así que la lista
  se queda en cuatro por prudencia y porque nada nuevo pide entrada, ya no
  porque una entrada arrastre la cadena.
- **Una redirección o una tubería bastan para meter la llamada en la caja.**
  Medido el 02-10-2026 con un Makefile sonda que imprime `TMPDIR` y cuenta
  `/proc`: el target desnudo ve 801 procesos y `TMPDIR` vacío; con
  `> fichero 2>&1` ve 7 y `TMPDIR` puesto; con `| cat`, 8. Las comillas de una
  asignación no influyen. Por eso un target del banco redirigido a un log muere
  con «Read-only file system» contra un segundo repositorio, mientras que el
  mismo target sin redirección construye su brazo. Lanza `make` desnudo y deja
  que el arnés capture la salida.
- **La escotilla también se queda sin `TMPDIR`.** Un comando lanzado con
  `dangerouslyDisableSandbox` no lo tiene,
  así que `"$TMPDIR/cuerpo.md"` queda en `/cuerpo.md` y muere contra la
  raíz de solo lectura; ahí va una ruta absoluta al scratchpad de la sesión. Y la
  exclusión no entra en un bucle ni en un `$( )`: un `gh` llamado así corre
  dentro y vuelve anónimo, que parece un 401 y no un problema de la caja.
- **La escotilla se queda abierta a propósito**, con una semana de uso medida
  detrás (el recuento y las causas están en el `AGENTS.md` del repo). Cerrarla
  obligaría a excluir más comandos, y una exclusión es peor aunque ya no
  arrastre la cadena: vale para siempre y para todo uso de ese comando, sin
  dejar rastro, mientras que la escotilla va comando a comando y queda en la
  transcripción.
- **`allowWrite` concede una caché de datos, nunca un directorio cuyo contenido
  se ejecuta desde fuera.** Por eso `~/.cache/pre-commit`, `~/.cache/uv` y
  `~/.local/share/uv` se evaluaron y se descartaron: guardan entornos de hooks,
  entornos de proyecto e intérpretes que luego corren sin confinar. Lo que
  necesiten esos comandos sale por la escotilla. Y en Linux la caja monta rutas
  concretas y descarta en silencio cualquier entrada con comodín.
- **Desde dentro de la caja solo se sale a ocho dominios**
  (`sandbox.network.allowedDomains`): `api.anthropic.com`,
  `registry.npmjs.org`, `github.com`, `api.github.com`, `codeload.github.com`,
  `objects.githubusercontent.com`, `gitlab.semantiqa.dev`, el GitLab propio,
  dado de alta a petición de la persona el 29-09-2026, y
  `plane.derivasoftware.dev`, el Plane propio, dado de alta igual el
  02-10-2026. Con `strictAllowlist` en `true`. Las entradas van sin puerto: las
  siete anteriores tampoco lo llevan, la salida va por un proxy HTTP/HTTPS y
  443 es el único puerto al que llega. Medido el 28-09-2026 en sesiones headless aisladas: con la lista
  puesta, `github.com` devuelve 200 y `example.org` cae con `curl: (56) CONNECT
  tunnel failed, response 403`; sin ella, los dos devuelven 200. El `curl` no
  dice qué host cayó, pero el aviso que te llega sí (`deny network-outbound
  example.org:443`). Corta `curl`, `npm`, `git`, `uv` y `pip` directos. No
  alcanza a los cuatro excluidos, que corren fuera y por tanto fuera de la
  lista: `api.github.com` no es lo que hace funcionar a `gh`. Tampoco a
  WebFetch, que no va en la caja. Un servidor en localhost sigue funcionando. Un
  dominio no cubre sus subdominios, por eso los de GitHub van uno a uno. Si algo
  hace falta de verdad, se apunta con el comando que provocó la denegación y se
  da de alta en la plantilla; el GitLab y el Plane propios son las dos entradas
  que no salieron de una denegación, y van registradas así. Por la escotilla no: quita también el
  confinamiento del sistema de ficheros, así que sale más caro de lo que
  arregla. Y ojo con lo que la lista sigue permitiendo: npm, los archivos de
  GitHub y el GitLab dejan traerse código que luego corre sin confinar, y
  GitHub, el GitLab y el Plane son además destinos de escritura si el comando
  alcanza un token del entorno.
- **Un fallo de red sin aviso de sandbox no es la lista.** `git` por SSH muere
  dentro de la caja con `ssh: Could not resolve hostname github.com: Temporary
  failure in name resolution`, igual con lista que sin ella (medido el
  28-09-2026). La salida va por un proxy HTTP/HTTPS, así que el puerto 22 no
  tiene ni DNS ni ruta, y que `github.com` esté listado da lo mismo. Por eso la
  red por SSH sale por la escotilla, y no es cosa de la lista. La señal es el
  formato: una denegación de la lista siempre trae un bloque
  `<sandbox_violations>` con `host:puerto`. Si no lo hay, es otro problema y no
  se arregla dando de alta un dominio.
- **La plantilla llega por `make sync-claude-settings`, no por `make stow`.** Este
  fichero sí se stowa, así que puede describir una postura que la máquina todavía
  no tiene. Si la lista de arriba importa para lo que vas a hacer, compruébalo con
  `jq '.sandbox.network' ~/.claude/settings.json`.
- **Un `.mcp.json` o un `settings.json` vacío lo ha dejado el sandbox.** Mientras
  corre cada comando, la caja pone un fichero de 0 bytes y solo lectura en cada
  ruta protegida que no existe (`.mcp.json` aquí y en las carpetas superiores,
  `.claude/settings*.json`, `.bashrc`, `.gitconfig`) y lo quita al acabar. Si la
  sesión muere de golpe, se queda: «MCP config is not a valid JSON» o permisos
  que no se guardan. `claude doctor` los lista; bórralos con `rm` fuera de la
  caja y sin otra sesión abierta en esa carpeta. `/sandbox` no los arregla,
  porque la lista es fija. Desde dentro de la caja esas rutas se ven como
  `/dev/null` aunque no haya nada en disco: compruébalo fuera.
- **`dangerouslyDisableSandbox` solo tras un fallo con evidencia** (`Operation
  not permitted`, socket denegado, ruta fuera de lo permitido), y comando a
  comando. No lo actives preventivamente ni lo arrastres al siguiente.
- Si algo se sale de la caja de forma recurrente, se apunta y se decide si entra
  en la configuración. No se resuelve abriendo la escotilla cada vez.

## Recuperación de errores de herramientas

- Carga `tool-error-recovery` antes de reintentar una herramienta fallida. Como
  máximo hay un reintento y solo para lecturas claramente idempotentes.
- No reintentes escrituras, Git/Stow destructivo, red autenticada ni MCP mutables.
  Conserva el exit/status y un resumen de stderr sin datos sensibles; si el fallo se repite,
  para.
- Usa permisos nativos, sandbox y aprobaciones antes que plugins o hooks. No
  dependas de `wait-for-user` ni de `reflect`.

## Scripts de shell

- Defensivos e idempotentes: `set -e`, `mkdir -p`, comprobaciones `[ -e ]`, sin
  valores por defecto destructivos.

## Comunicación

- **Concisión al reportar.** Cuando me reportes información directamente, sé
  extremadamente conciso: sacrifica la gramática si hace falta para ganar
  concisión.
- **Explicaciones en lenguaje de negocio.** Cuando te pida que me expliques algo
  en el chat, hazlo en términos de negocio: qué hace, qué implica y qué cambia.
  El detalle técnico acompaña, no abre la respuesta.

## Esperar intervención humana

- Si el siguiente paso seguro depende de una persona, carga `wait-for-user`.
- Si no hay pregunta nativa bloqueante, emite una sola línea
  `WAIT_FOR_USER: <decisión concreta>` y detente. No uses más herramientas hasta
  que la persona responda.
- Si actúas como subagente, usa siempre la señal textual y devuelve el bloqueo al
  agente principal u orquestador.
- Pide una decisión cerrada y no solicites secretos en el chat.

## Idioma

- Prosa de cara al usuario en **español peninsular** (READMEs, documentos, fichas).
  Mantén el idioma existente al editar.
- Las skills `castellano-peninsular` y `anti-ai-style` se cargan al redactar
  prosa de documento, no al responder en el chat.

## Skills compartidas

- Las skills viven en `~/.claude/skills/` (symlink a `~/.agents/skills/`, fuente
  canónica en `dotmesh/agents/.agents/skills/`). No las dupliques dentro de un
  proyecto.

## Terminal Browser

- Lleva un parche que apaga el aislamiento de sitios de Chromium, y su perfil tiene
  abierta la sesión de claude.ai. Ábrelo solo con páginas propias: artefactos de
  claude.ai del usuario, ficheros HTML locales o un servidor en `localhost`. Nada de
  webs externas ni de artefactos que haya compartido otra persona; para eso está el
  navegador normal.
- Nunca ejecutes `terminal-browser upgrade`: se salta el pin y quita el parche. Se
  actualiza con `make terminal-browser-install` en dotmesh.

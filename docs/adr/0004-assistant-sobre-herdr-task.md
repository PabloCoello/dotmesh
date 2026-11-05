# 0004. El Assistant se construye sobre herdr-task vendorizado

- **Estado:** aceptada el 05-11-2026.
- **Spec:** `.ai/tasks/2026-11-05-herdr-assistant/spec.md` (no versionado, como todo
  `.ai/`).

## Contexto

dotmesh quiere un Assistant al que el usuario le cuenta lo que necesita. El Assistant lo
concreta con él, lo convierte en tareas y arranca cada una como un worker de `claude` con
el flujo maker, en su propio worktree. Al terminar, la tarea queda «ready» y el usuario la
acepta. El modelo es [shepherdr](https://github.com/eliasstravik/shepherdr) (MIT).

Ya existe lo necesario en shepherdr, sin app: `herdr-task` es un CLI en Python de unos 30
módulos que corre sobre herdr-core (`hc` 0.1.18; la app que usa el usuario es herdr-app
0.1.13, y el TUI de herdr 0.9.5 es otro producto). Guarda las tareas en `~/.herdr/tasks` y
los worktrees en `~/.herdr/worktrees` (`base.py:16-17`). Su planificador es un terminal
`hc run --keep` que vive mientras haya tareas, automatizaciones o Autopilot
(`scheduler.py:15-27`), y entrega las noticias al Assistant con `hc send` (`news.py:251`).
No necesita la app ni launchd.

Tres propiedades del CLI chocan con dotmesh tal como está:

- En un repo con remoto GitHub, `ready` hace `git push --force-with-lease` y
  `gh pr create` (`github.py:22-64`). El flujo de dotmesh reserva el push y el PR a
  `/super-git`, a petición del usuario, y prohíbe el force-push sin confirmación.
- `hc` habla con un socket de herdr-core. Medido el 05-11-2026, desde el Bash del sandbox
  de Claude Code, `hc ls` falla con «cannot start core: Operation not permitted», igual
  que `herdr`. Con el sandbox como único freno bajo `bypassPermissions`, sin una
  exclusión el Assistant no puede ni listar sus workers.
- Las instrucciones de rol de upstream (`assistant.md`, `worker.md`) hablan de mods de la
  app, secretos, proof, navegador y otras máquinas, y su worker revisa con otro CLI. Nada
  de eso es el flujo maker.

## Decisión

El Assistant se construye sobre `herdr-task` vendorizado, con cuatro piezas:

1. **Solo el CLI, anclado y parcheado.** Se copia `mods/tasks/bin` de shepherdr a
   `assistant/vendor/herdr-task/`, anclado a un commit en `scripts/vendor/upstreams.tsv`.
   Un parche local hace que `github()` devuelva siempre `None`: no hay push, ni
   force-push, ni PR. `ready` deja la rama y `accept` la integra en local. Quedan fuera
   los mods de la app, el layout, el servicio web, la voz, las teclas y los hooks de
   shepherdr en `~/.claude/settings.json` y `~/.codex/hooks.json`.
2. **Workers de dotmesh.** Un `worker.md` propio sustituye al de upstream. El worker sigue
   el flujo maker de `AGENTS.md`, con un único gate: el subagente `review`, cuyo resultado
   registra `herdr-task reviewed`, y termina con `herdr-task ready`. Si se bloquea, emite
   `WAIT_FOR_USER` y debe verse como «Needs you».
3. **Excepción de sandbox.** `hc` y `herdr-task` entran en `sandbox.excludedCommands`
   del settings de la plantilla, que se propaga con `make sync-claude-settings`. La
   medición del 05-11-2026 queda registrada en `AGENTS.md`, y los dos ficheros de
   instrucciones que hablan de cuatro comandos pasan a seis.
4. **Una tercera persona, solo en Claude Code.** `assistant` es un output style que nunca
   escribe código: concreta con el usuario, redacta briefs que llevan el spec, arranca
   workers y los vigila. Es una excepción documentada a la forma «2 + 7» y a la paridad
   de tres agentes, con el precedente de `flow-artifacts`. Se adapta de `assistant.md`
   de upstream.

Reglas de uso que acompañan a la decisión: cada encargo tiene su rama de trabajo y su
worktree base propio, y sus tareas salen de esa rama y se integran en ella (un segundo
parche al código vendorizado); puede haber varios encargos a la vez sobre el mismo repo.
El Assistant usa `--after` y tareas programadas, y Autopilot, que viene apagado en
todos los espacios y enciende el usuario por espacio; no usa otras máquinas, secretos,
proof, navegador ni voz. Bajo Autopilot solo responde a un worker en dudas de
gusto o de alcance menor, y nunca en acciones destructivas, seguridad, secretos, push o
cambios de alcance.

Se instala con `make assistant-install`, fuera de `PACKAGES` y de `make install`, como
`collie/` y `terminal-browser/`.

## Alternativas

- **Un Assistant propio y delgado sobre `hc` y `git worktree`.** Evita código de
  terceros y el parche. Obliga a reescribir la cola, el reparto de noticias, el estado
  «needs-you», las dependencias `--after`, las tareas programadas, Autopilot y el cierre
  de ramas, que en `herdr-task` ya están y probados. Se descartó por coste de
  mantenimiento; se reabre si el parche crece (ver más abajo).
- **Los paneles del TUI de herdr 0.9.5.** Es el producto que dotmesh ya configura, pero
  un panel por tarea reintroduce la vigilancia manual que se quiere quitar, y no ofrece
  cola, dependencias ni noticias al Assistant. No sirve de base.
- **`isolation: worktree` de los subagentes de Claude Code.** Da aislamiento sin
  dependencias, pero el subagente vive y muere con la sesión del orquestador, que
  acumula contexto; la medición del 02-09-2026 que cita `AGENTS.md` mostró que
  orquestar costó 4,87 veces más sin bajar el pico de contexto. Un worker que sobrevive
  a la sesión y que el usuario puede abrir no encaja ahí.
- **Maker como orquestador (sin persona nueva).** Mantiene el «2 + 7», pero mezcla en una
  sesión el diseño con el usuario y el control de workers, y maker escribe código, que
  es lo que el Assistant no debe hacer. Se descartó para no cargar la persona de
  ingeniería con otro papel.
- **`assistant.md` de upstream tal cual.** Habla de mods de la app, de otras máquinas, de
  secretos y de `herdr-secret`, y de merges y PR de GitHub. Es contradictorio con el
  alcance. Se adapta, no se usa.
- **La escotilla por llamada en vez de la exclusión.** Es lo que pide `AGENTS.md` para lo
  que no es recurrente. Aquí cada acción del Assistant es una llamada a `hc` o a
  `herdr-task`, y cada una pasaría por `dangerouslyDisableSandbox`, que además quita el
  confinamiento del sistema de ficheros. Un agente que vigila workers durante horas haría
  cientos de llamadas; una exclusión acotada a dos nombres cuesta menos.
- **Un PR por tarea.** Es el flujo de upstream. Obliga a `git push` y a `gh` desde
  `herdr-task`, fuera de la caja, y se salta el reparto de dotmesh (push a petición con
  `/super-git`). Se sustituye por rama local aceptada por el usuario.

## Enmienda del 05-11-2026: la exclusión es por sesión

El punto 3 de la decisión (`hc` y `herdr-task` en `excludedCommands` de la plantilla) se
sustituye. El gate de `security` de la primera rebanada mostró que cualquier sesión que hable
con herdr-core puede lanzar procesos sin confinar, porque eso es lo que hace el daemon:
`herdr-task start --argv '["sh","-c",…]'`, `add --agent`, `auto --every`, y en `hc`, además de
`run` y `exec`, `file write`, `update --from`, `send` y `keys`. Las reglas `permissions.deny`
por prefijo se esquivan con opciones globales (`hc --json run`). Y `excludedCommands` en la
plantilla abre esa vía en todas las sesiones de la máquina, no solo en la del Assistant.

Decisión nueva, tomada con el usuario:

- La plantilla global se queda con cuatro comandos excluidos.
- El lanzador del Assistant añade `hc *` y `herdr-task *` con `--settings` solo a su sesión.
- Los workers reciben, por el `--settings` que ya les inyecta `launch.py`, solo
  `herdr-task *`, con `permissions.deny` sobre los verbos que lanzan procesos (`start`, `add`,
  `switch`, `resume`, `auto`, `edit`, `tick`, `scheduler`, `autopilot`).
- Un parche más rechaza `--argv` y cualquier `--agent` distinto de `claude`.

Queda un riesgo aceptado: la sesión del Assistant puede lanzar procesos sin confinar. Es una
sesión que no escribe código y que el usuario dirige.

## Consecuencias

- Código de terceros corre sin confinar. `herdr-task` y `hc` están en `excludedCommands`,
  y `hc run` y `hc exec` lanzan comandos arbitrarios fuera de la caja, igual que `make`
  lo hace hoy. Se mitiga con el pin, con la revisión del diff en cada actualización y
  con reglas `permissions.deny` sobre `hc run` y `hc exec`, que el Assistant no necesita:
  `herdr-task` las llama como subprocesos, que no pasan por permisos. El spec mide que
  la cola siga funcionando con ellas (M5).
- La exclusión solo vale para el comando desnudo. Una tubería, una redirección o un
  `$( )` lo meten en la caja y `hc` falla con el error de socket. Las instrucciones del
  Assistant reescriben los fragmentos de upstream que encadenan con `jq`.
- El hook `herdr-agent-state.sh` no cubre los workers, que no tienen panel de herdr. El
  estado «needs-you» depende de lo que Claude Code publique a `hc` y de que el worker lo
  declare; el spec lo mide en la primera rebanada y fija un plan B.
- Excepción a la paridad: OpenCode y Codex no tienen Assistant. La tabla de paridad y
  `docs/FLUJO-MAKER.md` lo dicen.
- Se pierde el flujo de PR automático. `ready` deja una rama, y llevarla a GitHub es un
  paso del usuario.
- El parche es deuda: cada actualización de upstream hay que revisarla y reaplicarla, y
  `herdr-task` está acoplado al layout de shepherdr (plantillas, `~/.herdr`, `herdr-app`
  para resolver el espacio).
- Segundo parche, `request-worktree.patch`: verbos `request` nuevos y cambios en
  `ff_merge`, `in_base`, `merged_here` y `finish` para integrar en el worktree del
  encargo y no en la carpeta principal. Cada encargo deja un worktree y una rama que
  se retiran solo a petición del usuario, después de publicar con `/super-git` desde ahí.
  El fork crece, y eso acerca la condición de reapertura de abajo.
- Un worker confinado puede no escribir en el `.git` del repo principal desde
  `~/.herdr/worktrees`. La primera rebanada lo mide; las salidas son worktrees dentro del
  repo o `--add-dir`, y `allowWrite` queda descartado cuando el repo tiene hooks.

## Qué la reabriría

- Un parche que pase de unas pocas líneas: si hay que tocar más de `github.py` y el
  cálculo de rutas, un Assistant propio sale más barato que mantener el fork.
- Medir que los workers no pueden hacer commit dentro del sandbox con ninguna de las tres
  salidas de M1: habría que replantear dónde viven los worktrees o la exclusión.
- Que `hc` o `herdr-task` pierdan la exclusión en una versión de Claude Code, o que la
  exclusión pase a alcanzar a los hijos: cambia el coste de la decisión sobre el sandbox.
- Que upstream retire o rompa el CLI sin la app (hoy corre solo con herdr-core), o
  cambie la licencia.
- Que OpenCode o Codex tengan una forma de hablar con `hc` y la paridad vuelva a
  merecer la pena.
- Que la medición M10 (dos encargos en paralelo) no pase sin un parche mayor que el
  previsto.

## Fuentes

- Medición del 05-11-2026: `hc ls` dentro del sandbox, «cannot start core: Operation not
  permitted». Reproducible lanzando `hc ls` desde una llamada a Bash con sandbox.
- Código de shepherdr 3.1.9 (copia de trabajo en el scratchpad de la sesión, no
  versionada; el commit se fija en la rebanada 1): `base.py:16-17`, `settings.py:18-21`,
  `scheduler.py:15-27`, `news.py:251`, `github.py:22-64`, `commands.py:960-972`,
  `launch.py:65-88`, `launch.py:444`, `launch.py:467-468`.
- Plantillas de upstream: `templates/assistant.md`, `templates/worker.md`,
  `templates/reviewer.md`.
- `AGENTS.md`: secciones «Personas y subagentes», «The Bash sandbox» y «Three-agent
  parity»; párrafos de `collie/` y `terminal-browser/` como precedentes de instalación
  opt-in; `scripts/vendor/upstreams.tsv`.
- Medición del 02-09-2026 sobre orquestación frente a ejecución en línea, citada en
  `AGENTS.md`, sección «Long implementations and context».

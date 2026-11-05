# Parches locales sobre herdr-task

`herdr-task/` es una copia de `mods/tasks/bin` de
[shepherdr](https://github.com/eliasstravik/shepherdr) con su licencia MIT, anclada al
commit que registra `scripts/vendor/upstreams.tsv`. La copia sin cambios entró en un commit
propio; cada parche de esta carpeta está aplicado sobre ella y guardado también como
fichero `.patch`, de modo que se puede leer y reaplicar con
`git apply -p1 --directory=assistant/vendor/herdr-task <parche>`.

## `local-only.patch`

`github()` devuelve siempre `None`. Con eso herdr-task no hace `git push`, ni
`--force-with-lease`, ni `gh pr create`, ni consulta a `gh`: todas las rutas de pull request
(`pr_open`, `pr_adopt`, la fusión con `gh pr merge`, las noticias de `ghnews`) dependen de que
`github()` devuelva un repositorio o de que la tarea tenga un campo `pr`, y ese campo solo lo
escriben esas mismas rutas. `ready` deja la rama en local y `accept` la integra en local. La
publicación la hace el usuario con `/super-git`.

La garantía vale para tareas creadas por esta copia. El almacén por defecto es
`~/.herdr/tasks`, el mismo que usa una instalación de shepherdr; una tarea que esa instalación
dejara con `pr`, o una clave `main_watch` en el almacén, volvería a activar `gh pr view`,
`gh pr merge` y `git fetch` desde `tick`. Por eso esta copia no convive con shepherdr en la
misma máquina: el instalador se niega si encuentra `shepherdr` o un almacén que no creó él.

El parche quita GitHub, no toda la red. Siguen, sin ser GitHub:

- `base_ref()` (`launch.py`): `git fetch <remoto> <rama>` cuando la rama base de una tarea
  (`--base`) no existe en local. Es una lectura y corre fuera del sandbox, así que no la limita la lista de dominios.
- Las funciones de otras máquinas (`machines`, `--on`), que pasan por `hc exec --on` y ssh.
  Quedan fuera de alcance y sin configurar. `automations.fetch_feed` entra aquí solo cuando
  la automatización apunta a otra máquina; en local lee el almacén.

Prueba: `assistant/tests/test_local_only.py`, que falla sin el parche.

## `lockdown.patch`

El daemon de herdr-core arranca cada agente fuera del sandbox de Bash, y `herdr-task` corre
fuera de él en las sesiones que lo excluyen. Upstream admite cualquier argv (`start --argv`,
`switch --argv`) y cualquier CLI (`--agent`), lee rutas de prueba del entorno y acepta verbos
que leen ficheros o escriben a otras sesiones. El parche cierra esas vías:

- **Solo arranca un `claude` confinado.** `vet_argv()` (`settings.py`) acepta `claude` con
  `--model`, `--effort`, `--permission-mode` (salvo `bypassPermissions`), `--resume` y
  `--settings` con la clave `fastMode` y ninguna otra. `launch()` la aplica al argv y a la
  reanudación antes de llegar a `hc run`; `agent_argv()` rechaza `--argv` y cualquier agente
  distinto de `claude`; un mensaje que empiece por `-` va detrás de `--`.
- **El worker excluye solo sus verbos.** `own_argv()` (`launch.py`) sustituye el `--settings`
  del worker por uno propio, que conserva solo `fastMode`. En él, `sandbox.excludedCommands`
  lleva una entrada por verbo de `OWN` (`ready`, `reviewed`, `status`, `alert`, `show`,
  `list`, `where`), de modo que cualquier otra forma (`herdr-task -- start`,
  `herdr-task tell-assistant`, `herdr-task review --changes-file`) corre dentro de la caja,
  donde el socket de herdr-core no se alcanza. Como segunda línea, `permissions.deny` niega
  todos los demás verbos de `cli.py` (`WORKER_DENY`; la prueba comprueba que no falta ninguno).
  Si la ruta de herdr-task no cabe en una regla, el worker no arranca.
- **El nombre desnudo.** `own_path()` devuelve `herdr-task` cuando el del PATH es esta copia, y
  el brief le dice al worker que lo escriba así, sin tubería, redirección ni `$( )`.
- **Sin ganchos de entorno.** `HERDR_TASK_STORE`, `HERDR_TASK_SETTINGS`,
  `HERDR_TASK_TEMPLATES`, `HERDR_AUTOPILOT_HOME`, `HERDR_TASK_GH` y el registro de `cmd_allow`
  ya no se leen del entorno: un `VAR=... herdr-task ...` en línea entregaría un almacén falso a
  un proceso sin confinar. Al arrancar, `cli.main()` borra las variables `GIT_*`, fija el `PATH`
  (`~/.local/bin`, Homebrew y los directorios del sistema) y rechaza un `--` inicial.
- **Git sin programas del repositorio.** `base.git()` pasa `core.fsmonitor=false`,
  `core.hooksPath=/dev/null`, `diff.external=` y `core.pager=cat`: herdr-task ejecuta git
  fuera de la caja en un worktree que controla el worker, y un `.git` reescrito podría nombrar
  un programa.

Cambios de comportamiento: una elección de worker en los ajustes con `perm: bypassPermissions`,
con `argv` propio o con `agent: codex` hace que `start`, `switch` y los arranques de la cola
fallen con un mensaje que lo dice. Por lo mismo, el relevo a otro CLI de `takeover.py` termina
siempre en «backup didn't start», y el revisor por defecto de upstream («el otro CLI») no
arranca: `shepherdr.json` se siembra con `reviewer: {agent: claude}`.

Riesgos que el parche no quita, aceptados:

- La sesión del Assistant excluye `hc` y `herdr-task` enteros, y `hc` (`send`, `keys`,
  `file write`, `update --from`) ejecuta o escribe fuera de la caja. Esa sesión no escribe
  código y la dirige el usuario. Un worker puede hacerle llegar texto con `ready --summary`,
  que es un canal de inyección de instrucciones hacia ella, no de ejecución.
- El worker es una sesión maker más: hereda de la máquina `allowUnsandboxedCommands`, los
  cuatro comandos excluidos de la plantilla y `bypassPermissions`. El parche no amplía esa
  postura, pero tampoco la estrecha, y el worker corre sin nadie delante.
- Medido el 05-11-2026 desde un worker: ni una asignación delante
  (`X=1 herdr-task status …`) ni un `$( )` en los argumentos sacan la llamada de la caja.
  La exclusión por verbo solo casa con el comando desnudo.
- `ready`, `reviewed` y `status` aceptan la referencia de otra tarea: un worker puede marcar
  otra como lista. Con `merge: ask`, que es lo que se siembra, eso no integra nada; con `auto` o
  `checks`, `finalize` pide la integración al agente de esa tarea, que es un `claude`
  confinado.
- Un `kill -9` del lanzador `assistant` deja la etiqueta `herdr.role=coordinator` en una shell.
  `news-guard.patch` impide que le llegue texto; `hc label <t> herdr.role=` la quita a mano.
- `in_shell()` arranca `claude` desde el shell interactivo del usuario, así que sus alias y
  funciones se aplican después de `vet_argv`. Son ficheros del usuario que un comando
  confinado no puede escribir.
- La reanudación de `revive.py` escribe en un shell el argv que leen las etiquetas de `hc` y el
  almacén; ningún verbo del worker escribe esos registros.

Prueba: `assistant/tests/test_lockdown.py`, que falla sin el parche.

## `news-guard.patch`

`hc send` teclea su texto y pulsa Enter. herdr-task lo usa para las noticias al coordinador,
los mensajes a un agente y el empujón de `tick` tras un fallo del proveedor. Si en esa
terminal ya no corre `claude`, quien lo recibe es una shell: el coordinador cuando `claude`
ha salido, o el worker, que arranca como `zsh -lic "claude …"; exec zsh -i`. La shell lo
ejecuta como comando, y el texto lleva palabras del worker (el resumen de `ready`, su línea de
estado) o de GitHub. Medido el 05-11-2026: una noticia llegó a una shell coordinadora y zsh la
trató como orden; el `<` inicial dio error de sintaxis, pero un `;` en el resumen habría
encadenado otra.

El parche añade `claude_in_front()` (`agents.py`), que pide `hc get` y acepta solo si la
terminal está viva y el `argv[0]` de su primer plano es `claude` (hc nombra a un `claude`
nativo por su versión, `2.1.318`, así que el nombre no sirve). `news_send`, `send_or_hold`,
`held_pass` y el empujón de `tick` lo comprueban antes de cada `hc send`; si falla, el texto no
sale. Las noticias, los avisos retenidos y los de GitHub se reintentan en la siguiente pasada
y caducan (6 h los retenidos); `tell` falla con un mensaje que lo dice, y el aviso de una
ronda de revisión añadida se pierde. Quedan
fuera `revive.py`, que teclea a propósito una línea de shell en una shell para relanzar al
agente (con argv del almacén y de las etiquetas, que ningún verbo del worker escribe), y
`machines.py`, sin configurar: el lado receptor de `tell` entre máquinas teclearía sin la
comprobación, y por eso el instalador siembra `machines` en `off`.

Queda una ventana entre `hc get` y el pegado de `hc send` (hasta unos segundos, porque `hc send`
espera un silencio de tecleo): si `claude` sale justo entonces, el texto cae en la shell. Los
textos que puede escribir un worker van al coordinador, cuyo `claude` el worker no puede cerrar.
Cerrarla del todo pide que ni el worker ni el lanzador dejen una shell detrás (`exit` en lugar de
`exec zsh -i`), un cambio de diseño pendiente.

Prueba: `assistant/tests/test_news_guard.py`, que además recorre el paquete y falla si aparece
un `hc send` sin la comprobación.

## `request-worktree.patch`

Un encargo es una rama con worktree propio en la que se juntan varias tareas, de modo que su
trabajo se integra lejos de la carpeta principal, que queda como estaba. Upstream integra con
`git merge --ff-only` solo si la base está desplegada en la carpeta principal; si no, con
`git fetch . <rama>:<base>`, que git rechaza cuando otro worktree tiene esa base desplegada. Es
justo el caso de un encargo, así que `accept` acababa pidiendo la integración al agente.

El parche añade `request.py` con tres verbos:

- `herdr-task request open <slug> [--from <rama>]` crea la rama `request/<slug>` y su worktree
  en `~/.herdr/worktrees/<repo>/request-<slug>`. Parte de la rama por defecto del remoto si
  existe en local; si no, de la rama desplegada. El nombre admite minúsculas, dígitos y guiones,
  hasta 40 caracteres.
- `herdr-task request list` muestra los encargos de la carpeta, que se guardan en el almacén
  bajo `requests`.
- `herdr-task request close <slug>` marca el encargo como cerrado sin borrar nada. Una tarea
  puede seguir usando su rama como base. Con `--remove` retira además el worktree y la rama, y
  entonces el nombre se puede volver a abrir. Se niega si alguna tarea sin terminar usa esa base,
  si el worktree tiene cambios, ficheros sin seguimiento o ficheros ignorados (`git worktree
  remove` borra los ignorados sin preguntar, y ahí suele estar un `.env`), o si la rama tiene
  commits que no están ni en la rama de partida ni en una rama remota. Las ramas remotas cuentan
  tal como quedaron en el último `fetch`: una que ya no exista en el remoto sigue valiendo. La rama
  se borra con `git update-ref -d` contra el commit comprobado, así que un commit que llegue entre
  la comprobación y el borrado la conserva. La sesión del Assistant no puede escribir en
  `~/.herdr/worktrees`, y por eso el borrado pasa por herdr-task.

Las tareas se suman con `herdr-task add --base request/<slug>`. `ff_merge` (`commands.py`)
busca con `git worktree list` dónde está desplegada la base, pero solo integra allí si es la
carpeta principal o el worktree de un encargo abierto. Nunca integra en el worktree de otra tarea
ni en uno del usuario: en ese caso queda el `git fetch .` de upstream, que git rechaza, y la
integración pasa al agente como antes. Si el worktree del encargo tiene cambios sin confirmar,
`accept` falla con un mensaje que nombra la carpeta, y la tarea sigue en Ready. En la carpeta
principal se conserva el comportamiento de upstream: git se niega solo si la integración toca
esos ficheros. Si la integración no es un avance rápido, la tarea también pasa a su agente, que
no puede integrar en una base desplegada en otro worktree; ese caso termina en una pregunta al
usuario.

`accept` integra la punta de la rama en el momento de aceptar, no el commit revisado, igual que
upstream: un worker puede añadir commits entre `ready` y la aceptación.

`request` entra en `WORKER_DENY`: un worker no abre ni cierra encargos.

Prueba: `assistant/tests/test_requests.py`.

Las pruebas se lanzan con `python3 -m unittest discover -s assistant/tests`.

## Actualizar el pin

1. Clona upstream en un directorio aparte y compara `mods/tasks/bin` entre el commit anclado
   y el nuevo con `git diff`. Lee el diff entero: este código corre fuera del sandbox.
2. Sustituye la copia, confírmala sin cambios y reaplica los parches en orden.
3. Actualiza la fila de `scripts/vendor/upstreams.tsv` y pasa las pruebas.

Nunca `shepherdr update` ni `npx`: se saltan el pin.

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
- Sin medir: si la exclusión `herdr-task ready *` casa con una asignación delante
  (`PYTHONPATH=… herdr-task ready …`). Si casa, el intérprete cargaría código del worker antes
  de que corra el parche; es la medición M4b del spec. Mientras tanto no añade nada a la
  postura del punto anterior.
- `ready`, `reviewed` y `status` aceptan la referencia de otra tarea: un worker puede marcar
  otra como lista. Con `merge: ask`, que es lo que se siembra, eso no integra nada; con `auto` o
  `checks`, `finalize` pide la integración al agente de esa tarea, que es un `claude`
  confinado.
- Las noticias llegan al coordinador con `hc send`, que las teclea y pulsa Enter. Si el
  coordinador es una shell, zsh las ejecuta como comandos, y el resumen de `ready` lo escribe
  el worker: un `;` dentro bastaría para encadenar una orden sin confinar (medido el
  05-11-2026 con una shell marcada a mano; el `<` inicial dio error de sintaxis). Por eso el
  lanzador `assistant` ya no hace `exec`: espera a `claude` y quita la etiqueta
  `herdr.role=coordinator` al salir, también con INT, TERM o HUP. Queda un `kill -9` del
  lanzador, que deja la etiqueta puesta; `hc label <t> herdr.role=` la quita a mano. Nunca
  marques una shell como coordinadora.
- `in_shell()` arranca `claude` desde el shell interactivo del usuario, así que sus alias y
  funciones se aplican después de `vet_argv`. Son ficheros del usuario que un comando
  confinado no puede escribir.
- La reanudación de `revive.py` escribe en un shell el argv que leen las etiquetas de `hc` y el
  almacén; ningún verbo del worker escribe esos registros.

Prueba: `assistant/tests/test_lockdown.py`, que falla sin el parche.

Las dos pruebas se lanzan con `python3 -m unittest discover -s assistant/tests`.

## Actualizar el pin

1. Clona upstream en un directorio aparte y compara `mods/tasks/bin` entre el commit anclado
   y el nuevo con `git diff`. Lee el diff entero: este código corre fuera del sandbox.
2. Sustituye la copia, confírmala sin cambios y reaplica los parches en orden.
3. Actualiza la fila de `scripts/vendor/upstreams.tsv` y pasa las pruebas.

Nunca `shepherdr update` ni `npx`: se saltan el pin.

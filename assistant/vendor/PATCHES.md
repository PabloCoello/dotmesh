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

- La sesión del Assistant excluye de la caja `hc` y `herdr-task`, verbo a verbo desde
  `hardening.patch`, y varios verbos de `hc` (`send`, `keys`, `file write`, `update --from`)
  ejecutan o escriben fuera de ella. Esa sesión no escribe
  código y la dirige el usuario. Su lanzador niega con `permissions.deny` los verbos de `hc`
  que ejecutan o escriben (`run`, `exec`, `file`, `put`, `update`, `machine`, `server`…),
  cualquier llamada a `hc` o `herdr-task` que empiece por una opción (`hc --json run`) y los
  verbos de `herdr-task` que actúan por un worker o en otra máquina
  (`assistant/tests/test_launcher.py`). `send`, `keys` y `label` se deniegan desde
  `hardening.patch` (abajo): el Assistant escribe a un worker con `herdr-task say` y `keys`.
  Medido el 05-11-2026 con `claude -p` y esos mismos `--settings` sin la persona,
  bajo `bypassPermissions`: `hc run true`, `hc --json run true`, `hc exec -- true`,
  `herdr-task ready 1` y `herdr pane list` se deniegan; `hc ls`, `herdr-task list --json` y
  `herdr-task review-more 1` corren. La regla deny se aplica también a un comando excluido de
  la caja, y `herdr-task review` no se lleva por delante `review-more`. Un worker puede hacerle llegar texto con `ready --summary`,
  que es un canal de inyección de instrucciones hacia ella. Mientras `hc send` y `hc keys`
  estuvieron permitidos, también era un canal de ejecución: una inyección lograda podía
  teclear un comando en cualquier shell. `hardening.patch` lo cierra.
- El worker es una sesión maker más: hereda de la máquina los cuatro comandos excluidos de
  la plantilla y `bypassPermissions`, y corre sin nadie delante. Este parche no amplía esa
  postura; `hardening.patch` la estrecha después quitándole la escotilla.
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
nativo por su versión, `2.1.318`, así que el nombre no sirve). También acepta el lanzador
`assistant/bin/assistant`, que espera a su `claude` en lugar de hacer `exec` para quitar la
etiqueta al salir. Como el lanzador sigue en primer plano antes de que arranque `claude` y
después de que salga, esa forma cuenta solo si se cumplen tres condiciones: el intérprete es
`/bin/sh` o `/usr/bin/sh`, la ruta es absoluta y su ruta real es la del lanzador de este
checkout, y el proceso en primer plano tiene un hijo directo `claude` vivo según `ps`.
`agent_running`, que el resto de herdr-task usa para saber si un terminal tiene su agente en
marcha, acepta lo mismo (`launcher_running`): hc nombra el primer plano del lanzador por su
shell, `bash`, y sin esto Autopilot esperaba indefinidamente con «Waiting for its Assistant to
run» (medido el 05-11-2026 en la prueba del criterio 12).
Medido el 05-11-2026 en M10: el primer plano del coordinador era
`["/bin/sh", "~/.local/bin/assistant"]` y las noticias se quedaban en el buzón sin entregar. `news_send`, `send_or_hold`,
`held_pass` y el empujón de `tick` lo comprueban antes de cada `hc send`; si falla, el texto no
sale. Las noticias, los avisos retenidos y los de GitHub se reintentan en la siguiente pasada
y caducan (6 h los retenidos); `tell` falla con un mensaje que lo dice, y el aviso de una
ronda de revisión añadida se pierde. Quedan
fuera `revive.py`, que teclea a propósito una línea de shell en una shell para relanzar al
agente (con argv del almacén y de las etiquetas, que ningún verbo del worker escribe), y
`machines.py`, sin configurar: el lado receptor de `tell` entre máquinas teclearía sin la
comprobación, y por eso el instalador siembra `machines` en `off`.

Queda una ventana entre `hc get` y el pegado de `hc send` (hasta unos segundos, porque
`hc send` espera un silencio de tecleo): si `claude` sale justo entonces, el texto cae en la
shell, o en el lanzador mientras quita la etiqueta. Los
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

Medido en vivo el 05-11-2026 (M10) en un repositorio desechable con el Assistant real. Se
abrieron dos encargos, `saludo` y `despedida`, con tres tareas: MP2-3 esperaba a MP2-1 con
`--after`. MP2-1 y MP2-2 corrieron a la vez. Al aceptarlas, `request/saludo` y
`request/despedida` avanzaron cada una con su commit. MP2-3 arrancó sola tras la aceptación de
MP2-1, y al aceptarla avanzó también `request/saludo`. Los worktrees de las tareas
desaparecieron. La carpeta principal acabó en `main` y en el mismo commit, sin cambios.

## `auto-request.patch`

Dos tipos de trabajo arrancan solos, sin que nadie mire en ese momento. Una automatización
(`auto`) guarda una tarea y la vuelve a añadir cuando llega una hora o un evento, con un worker
nuevo cada vez. Una tarea programada (`add`, `start` o `edit` con `--at`/`--in`) arranca a su
hora. En upstream ninguna de las dos necesita `--base`: sin él, la tarea parte de la rama
desplegada en la carpeta principal y, al aceptarla, se integra allí. Con `--here`, el worker
trabaja directamente en la carpeta principal. Las dos cosas contradicen la regla de los
encargos, y el Assistant no interviene cuando el trabajo arranca.

El parche añade `unattended_problem` (`request.py`). En un repositorio, exige que el trabajo vaya
en worktree y que su base sea `request/<slug>` de un encargo abierto (`open_request`). Fuera de
git no exige nada, porque allí no hay rama que integrar. Se comprueba en cinco puntos:

- `auto add` y `auto edit`, que admiten ahora `--base`, rechazan una automatización sin encargo
  abierto o con `--here`. Una edición rechazada no guarda nada.
- `fire` lo vuelve a comprobar al dispararse. Si el encargo se ha cerrado entretanto, o la
  automatización se guardó antes del parche, no crea ninguna tarea: guarda el motivo en
  `last_error` y pausa la automatización. Una tarea creada sin su encargo podría arrancarse
  después a mano contra la carpeta principal, y una automatización diaria las acumularía. Si
  todo está en orden, `fire` fija la base de la tarea él mismo, sin pasar por la rama base del
  espacio.
- `schedule` (`commands.py`) rechaza programar una tarea así.
- `due_pass` (`tick.py`) lo comprueba otra vez cuando llega la hora, por si la tarea se editó
  después de programarla (`edit --base ""`, `--here`): la devuelve a To do con el motivo en
  `attention` y no la pone en cola.
- La cola (`not_started`, en `tick.py`) repite la comprobación antes de arrancar el trabajo que
  llegó solo, sea por su hora o por una automatización (`unattended`), porque pudo editarse
  mientras esperaba a sus tareas `--after` o a tener hueco. Una tarea que puso en cola el
  Assistant a mano sigue como en upstream.

Un encargo cerrado sin `--remove` sigue en el almacén y no se puede volver a abrir con el
mismo nombre, así que una automatización que apuntaba a él necesita otro encargo (`auto edit --base`) y
`auto resume`. La vista de la automatización muestra su `base`.

Queda fuera la integración automática en un encargo: con la integración «por su cuenta» y sin
pull request, `local_merge_msg` pide al worker `git fetch . <rama>:request/<slug>`, que git
rechaza porque el encargo está desplegado en su worktree. No escribe en la carpeta principal;
la tarea espera a la persona.

Prueba: `assistant/tests/test_auto_request.py`.

## `hardening.patch`

La puerta de seguridad final del 05-11-2026 revisó el paquete entero y encontró cinco huecos
que los parches anteriores dejaban abiertos. Este parche cierra los que están en herdr-task;
el lanzador y el output style `assistant` cambian en el mismo commit. Dos rondas más de
revisión, el 05 y el 06-11, encontraron rodeos a esos cierres, y el parche recoge también
sus arreglos.

Varias medidas se apoyan en una medición: el Bash de un agente no tiene terminal de control.
Medido el 06-11-2026 desde una sesión de Claude Code, dentro y fuera de la caja: `stdin` no
es un terminal y abrir `/dev/tty` da `ENXIO`. Un terminal de la persona sí lo tiene. Por eso
lo que solo debe hacer la persona se comprueba con `base.no_terminal()`, y no con una opción
que quien llama pudiera pasar. La premisa se sostiene mientras el agente no pueda darle un
terminal a herdr-task: dentro de la caja puede crear un pty, pero herdr-task no llega
entonces ni al almacén ni al socket, y fuera de ella solo sale con la escotilla. Por eso ni
el Assistant ni los workers la tienen.

- **Escribir a un worker.** La sesión del Assistant tenía `hc send` y `hc keys` fuera del
  sandbox, contra cualquier terminal, y solo el texto de su output style exigía comprobar antes
  que delante hubiera un `claude`. Como esa sesión lee texto de los workers, una inyección
  lograda podía teclear un comando en una shell sin confinar. Ahora hay dos verbos nuevos:
  `herdr-task say <id> '<texto>'` y `herdr-task keys <id> <tecla>...`. Los dos escriben
  siempre al worker vivo de la tarea, nunca a un terminal que elija quien llama, y solo
  con `claude` delante (la comprobación de `news-guard.patch`). `keys` acepta hasta 20
  teclas de una lista cerrada: `up`, `down`, `left`, `right`, `enter`, `escape`, `tab` y
  `space`. El lanzador deniega `hc send`, `hc keys` y `hc label`, y los workers tienen
  denegados `say` y `keys`. `say` escribe una sola línea de texto: rechaza los caracteres de
  control (también los C1 y los separadores de línea de Unicode) y una línea que empiece por
  `!`, `/` o `#`, aunque vayan precedidos de caracteres invisibles, porque `claude` la
  tomaría como un comando. Tampoco escribe mientras la persona teclea en ese worker ni
  mientras este muestra un menú (o su pantalla no se puede leer), como el diálogo de permisos: un
  `1` contestaría ese menú. Los menús se contestan con `keys`, que vuelve a comprobar antes
  de cada tecla que `claude` sigue delante y que la persona no está tecleando.
- **Exclusión por verbos.** El lanzador excluía `hc *` y `herdr-task *` y denegaba una
  lista de verbos. Un verbo nuevo de upstream, o una forma que la regla no reconociera,
  habría corrido fuera de la caja. Ahora excluye verbo a verbo: de `hc`, solo `get`, `ls`,
  `read` y `wait`; de `herdr-task`, los verbos que usa el Assistant. Cualquier otra forma
  se queda en la caja, donde el socket de herdr-core no responde. La lista de verbos
  denegados se mantiene como segunda línea. `test_launcher.py` comprueba que cada verbo
  de `cli.py` está excluido o denegado, y nunca las dos cosas a la vez.
- **Registros de reanudación.** `revive.py` teclea en una shell recuperada lo que dice la
  etiqueta `herdr.resume` del terminal. Con `hc label` al alcance del Assistant, una etiqueta
  falsificada llevaba cualquier comando a esa shell. Además de denegar `hc label`,
  `read_record` descarta los registros que el tick no pudo escribir. El argv tiene que empezar
  por `claude` a secas y llevar solo los flags que herdr-task da a un agente: `--model`,
  `--effort`, `--permission-mode` (salvo `bypassPermissions`) y un `--settings` que sea
  `fastMode` solo, o `fastMode` más exactamente los ajustes propios del worker
  (`launch.worker_settings`). Además, la sesión tiene que ser un UUID, el log tiene que estar
  bajo `~/.claude/projects` y la carpeta, ser absoluta. Un registro que no pasa no se escribe
  en la etiqueta. El argv que guarda el almacén de tareas, que también está fuera de la caja,
  pasa la misma comprobación. Queda sin comprobar que la carpeta sea la del terminal. Como
  consecuencia, el registro del propio Assistant, que lleva el `--settings` del lanzador, no se
  escribe nunca: tras una caída, el Assistant no vuelve solo y la persona lanza `assistant` de
  nuevo, que es también lo que vuelve a poner y quitar la marca de coordinador.
- **`--prompt-file`.** herdr-task corre fuera de la caja, así que `--prompt-file` podía leer
  cualquier fichero (`~/.ssh`, un `.env`) y llevarlo al brief de un worker. Ahora solo lee un
  fichero bajo `<carpeta>/.ai/tasks/`, en `add`, `edit` y las automatizaciones. Lo abre
  componente a componente desde la carpeta, sin seguir ningún enlace simbólico, de modo que
  cambiar un directorio por un enlace después de comprobar la ruta no lo desvía. Después
  comprueba sobre el descriptor abierto que es un fichero normal con un solo nombre (un
  enlace duro a `~/.aws/credentials` pasaría la comprobación de ruta), que no pasa de
  256 KiB y que es UTF-8.
- **Workers y Assistant sin escotilla.** Un worker conservaba `dangerouslyDisableSandbox`,
  como cualquier sesión maker. Con ella podía escribir en la carpeta principal o integrar él
  mismo, sin pasar por `accept`. El Assistant también la tenía, y con ella podía lanzar
  herdr-task dentro de un pty, leer el código de confirmación y teclearlo. Ahora los ajustes
  de los dos llevan `allowUnsandboxedCommands: false`. Ese ajuste, pasado por `--settings`,
  se impone a la plantilla de la máquina. Se midió el 06-11-2026 con dos `claude -p` reales
  que pedían `touch ~/.probe-hatch-*` con `dangerouslyDisableSandbox`. Con el ajuste, el
  comando corrió dentro de la caja y falló con `Operation not permitted`. Sin el ajuste, el
  comando de control creó el fichero. Los workers de M1 y M10 hicieron todos sus commits dentro de la caja, así que su flujo no
  necesita la escotilla. Lo que sí la necesita (red por SSH, `pre-commit`, `uv`) falla en el
  worker, y lo hace la persona en el worktree del encargo.
- **El worker no mueve ramas ajenas.** Medido el 06-11-2026 con un `claude -p` real cuya
  carpeta era un worktree bajo `~/.herdr/worktrees` y cuyo `.git` común quedaba fuera de
  ella. Dentro de la caja, el worker hacía commit y también movía con `git update-ref`
  cualquier rama: `request/x`, y en la misma prueba sobre la sesión principal, `main`, aunque
  estuviera en uso en otro worktree. Escribía también en `info/`. La caja ya le negaba
  `.git/config` y `.git/hooks/*`.

  Ahora `launch.git_denies` añade al `--settings` del worker un `sandbox.filesystem.denyWrite`
  con todo lo que hay en el `.git` común salvo `objects`, `logs`, su propio directorio en
  `worktrees/` y la ruta de su propia rama bajo `refs/heads`. En cada nivel de esa ruta se
  niegan los demás nombres, sueltos o empaquetados en `packed-refs`, así que tampoco mueve la
  rama de otra tarea. La lista sale de lo que herdr-task registra (la carpeta principal y el
  worktree y la rama de la tarea), nunca del gitdir del worker, que él puede reescribir o
  dejar con el HEAD desacoplado. Si no puede calcularla, se niega a arrancar en vez de dar
  una lista más corta. Se guarda en la tarea (`git_deny`), y `revive.task_record` relanza con
  esa misma lista, o no relanza si falta. `revive.sane_settings` acepta un `denyWrite` de
  rutas absolutas, porque solo estrecha la caja. Una tarea `--here` comparte el `.git` de la
  carpeta principal y no recibe lista.

  En macOS la lista incluye nombres que aún no existen (`refs/heads/request`, `refs/replace`,
  `refs/tags`, `MERGE_HEAD`, `info`…), porque la caja los niega igual. Esto tiene un efecto
  medido: la caja tampoco deja crear un directorio que contiene una ruta negada. Con las refs
  empaquetadas no existía `refs/heads/task/`, y el primer commit del worker fallaba. Por eso
  herdr-task crea antes los directorios de la rama del worker, y se niega si encuentra un
  symlink en esa ruta.

  En Linux, la caja puede plantar un fichero vacío en una ruta negada que no existe (un
  `MERGE_HEAD` vacío rompería git), así que la lista se queda en rutas existentes. Para que
  eso no deje fuera las ramas empaquetadas, que es lo normal tras un `clone` o un `gc`,
  herdr-task escribe antes el fichero suelto de cada una con el mismo valor (una ref suelta
  tapa a la empaquetada, así que nada se mueve) y crea vacíos `refs/heads/request` y los
  espacios de `refs/` (`tags`, `replace`…). Se escriben a mano porque `update-ref` al mismo
  valor no escribe nada (medido en macOS). Los ficheros de estado que no existen
  (`MERGE_HEAD`, `ORIG_HEAD`…) siguen sin negar en Linux. Nada de este párrafo está medido
  en Linux.

  Una rama que aún no existe bajo `refs/heads/task/` no se puede negar por adelantado. Un
  worker podría crear la de la próxima tarea (`herdr-task list` le da el número y el título)
  apuntando a sus commits, y esa tarea arrancaría desde ellos. Por eso `folder_for` ya no
  reutiliza una rama existente salvo que la tarea la nombre (`--set branch`), y la rama
  nombrada se valida antes de crear el worktree.

  Medido al final con el `--settings` que genera `own_argv`, con `main` solo en
  `packed-refs`: el commit del worker sale. `update-ref` sobre `main`, otra rama, una rama
  hermana `task/3-otra` y `request/x` falla con `Operation not permitted`. También fallan
  renombrar `refs/heads`, `refs` o `worktrees` y escribir el `config.worktree` de su propio
  directorio, que la lista niega de forma explícita. Escribir `objects/info/alternates` también
  falló, aunque `objects` no está en la lista; la causa no se ha encontrado, y la protección no
  cuenta con ello.
- **Dónde trabaja una tarea del Assistant.** `add` aceptaba cualquier `--folder`, `--here`
  (sin worktree y, por tanto, sin `accept`) y `--set merge`. Ahora, una llamada sin terminal
  de control solo añade, edita, arranca y reanuda tareas del repo en el que corre, cada una en su
  worktree y sobre un encargo abierto, sin `--here`, sin otra `--folder` y sin cambiar su
  política de integración (ni con `merge` ni con su alias `brief.merge`). Una rama que se
  llame `request/…` sin ser un encargo abierto no basta. Una tarea de otro repo, aunque se
  nombre por su id, no se toca: ni `edit`, `start`, `resume`, `reopen`, `done`, `accept`,
  `review-more` y `rm`, ni `say` o `keys` a su worker.
  `accept` y `review-more` pasan las mismas comprobaciones que `start`, porque los dos pueden
  arrancar de nuevo al worker de la tarea. Una tarea Done no se reabre ni se reanuda. Las automatizaciones siguen la
  misma regla. Desde un terminal suyo, la persona puede hacer todo eso. Como efecto
  secundario, el Assistant tampoco puede cambiar el título de una tarea `--here` de la
  persona que aún no ha empezado. Sí puede editar el brief de una que ya está en marcha, y
  ese cambio cuenta cuando la persona la reanude.
- **Configuración que ejecuta código.** La persona confía una vez en `~/.herdr/worktrees`,
  así que unos hooks, un servidor MCP o unos ajustes que un worker commitee correrían fuera
  de la caja al abrir una sesión o un commit en el worktree del encargo. Antes de integrar,
  `accept` lista lo que los commits de la tarea cambian en `.claude/`, `.codex/`,
  `.opencode/`, `.cursor/`, `.husky/`, `.githooks/`, `.vscode/` y `.devcontainer/`, en
  ficheros como `.mcp.json`, `.pre-commit-config.yaml`, `lefthook.yml`, `.envrc`,
  `opencode.json(c)`, `mise.toml` o `.yarnrc.yml`, y cualquier enlace simbólico o submódulo,
  apunte adonde apunte. También cuenta `lefthook` con cualquier extensión, `.gitmodules`,
  `.gitattributes`, `.tool-versions`, `.nvim.lua`, `.exrc`, `.idea/`, `.zed/`, `.mise/` y
  `.cargo/`. Compara los nombres como los compara macOS (en NFC, sin los caracteres
  invisibles que ignora y con `casefold`, de modo que `.mcp.jſon` cuenta), a cualquier
  profundidad y en cualquier componente de la ruta, y lee el diff con `-z`, sin renombrados.
  Si hay algo, se niega. Con `--config-ok`, muestra la lista y un código aleatorio en
  `/dev/tty` y pide teclearlo allí. Un agente no tiene terminal, así que solo la persona
  puede confirmarlo, y lo hace con el almacén de tareas desbloqueado. Integra exactamente el
  commit comprobado, también cuando la base no está desplegada en ninguna carpeta; si la
  rama se ha movido desde entonces, se niega. `finalize`, la integración automática al decir
  `ready`, tampoco integra una tarea así: espera al `accept` de la persona.

Quedan abiertos:

- La comprobación de `accept` mira los ficheros de configuración, no lo que estos ejecutan.
  Un worker puede cambiar el script al que llama un hook existente (`entry: ./scripts/x.sh`)
  sin que se vea. En dotmesh, además, un fichero enlazado por Stow (`shell/.zshrc`, un
  `Makefile`, una skill) o un `AGENTS.md` toman efecto en la siguiente sesión sin ser
  configuración en este sentido. Hay que leer el diff antes de aceptar.
- La vía de pull request (`finalize` y `accept` con `t["pr"]`) no pasa por la comprobación
  de configuración ni fija el commit. Aquí no existe, porque `local-only.patch` desactiva
  GitHub; si ese parche se retira, hay que cubrirla antes.
- Cuando la integración no es un avance rápido, `accept` pide al worker que integre él, y
  ese worker puede añadir commits después de la comprobación. Pasa lo mismo con
  `finalize` si la persona fija la integración «por su cuenta». Con la base en un encargo
  y sin escotilla, fallan sus dos vías (`git fetch .` y `merge` en la carpeta del encargo:
  la primera la rechaza git y la segunda escribe fuera de su carpeta; no se ha medido en
  vivo). Mover la rama con `update-ref` es la viñeta siguiente.
- La protección del `.git` común (viñeta «El worker no mueve ramas ajenas») es una foto del
  arranque. Una rama o un worktree creados después, con nombres nuevos, quedan escribibles
  hasta que el worker se relanza; un worker puede crear `worktrees/<nombre>` con un `gitdir`
  que apunte al worktree de otra tarea, y esa tarea no vuelve a arrancar (se niega, no se
  abre). En Linux no se ha medido nada de esta protección. Un repositorio con el formato
  `reftable` guarda las refs de otra forma y no está cubierto.
- En Linux, los ficheros de estado que no existen al arrancar (`MERGE_HEAD`,
  `CHERRY_PICK_HEAD`, `sequencer/`, `rebase-merge/`, `shallow`…) no se niegan. Un worker podría
  crear un `MERGE_HEAD` con su commit, y el siguiente `git commit` de la persona en la
  carpeta principal sería un merge que trae su historia sin pasar por `accept`; un
  `sequencer/todo` con líneas `exec` correría en un `--continue`. Sin medir en Linux.
- `revive` relanza con la lista guardada al arrancar, no con una nueva, así que lo creado
  después sigue sin negar tras un revive; en Linux la filtra a rutas que existen. Una tarea
  que `start` deja con el worktree hecho y luego rechaza `git_denies` deja ese worktree
  detrás (`begin` llama a `folder_for` antes que `launch`). Si un worker planta la rama de la
  próxima tarea, esa tarea no arranca hasta que la persona la borre: se niega, no se abre.
- `objects/` y `logs/` siguen escribibles, porque el worker crea ahí sus commits y sus reflogs.
  Podría reescribir un objeto suelto o un pack a los que ya apunta otra rama (`accept`
  compara la punta, no recalcula los hashes), y los reflogs de `main` y `request/*` dejan de
  servir para recuperar nada tras pasar un worker. No se ha medido ni cubierto.
- Los hooks que un worker commitee en su propio worktree corren cuando un revisor o una
  reanudación abren `claude` allí, con la caja del propio worker.
- `say` filtra la forma del texto, no su contenido: es una instrucción libre al worker, y
  `keys enter` puede aprobar un diálogo de permisos. Ahí manda la persona del Assistant. El
  menú se reconoce por su texto en pantalla (`❯ 1.`, «Do you want to…»); uno dibujado de
  otra forma no se ve, y entre esa lectura y el tecleo pasa un instante.
- `no_terminal()` depende de cómo lanza Claude Code su Bash. Si una versión futura lo lanzara
  en un pty, la comprobación daría por presente a la persona sin avisar. Conviene repetir la
  medición al subir de versión.
- El sandbox no impide que un comando confinado con este checkout como carpeta
de trabajo escriba en `assistant/`, código que luego corre fuera. `make health` avisa de los
cambios sin confirmar en `vendor/`, `bin/` y `templates/`, pero solo cuando se ejecuta.

Prueba: `assistant/tests/test_hardening.py` y `test_launcher.py`.

Las pruebas se lanzan con `python3 -m unittest discover -s assistant/tests`.

## Actualizar el pin

1. Clona upstream en un directorio aparte y compara `mods/tasks/bin` entre el commit anclado
   y el nuevo con `git diff`. Lee el diff entero: este código corre fuera del sandbox.
2. Sustituye la copia, confírmala sin cambios y reaplica los parches en orden.
3. Actualiza la fila de `scripts/vendor/upstreams.tsv` y pasa las pruebas.

Nunca `shepherdr update` ni `npx`: se saltan el pin.

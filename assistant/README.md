# assistant: un coordinador de workers `claude` sobre herdr

Cuando una petición se parte en varias tareas, llevarlas a mano obliga a abrir un pane por
tarea y a vigilar cuál se ha parado a preguntar. Además, hay que cuidar que ninguna toque la
carpeta en la que trabajas. El Assistant se encarga de esa coordinación. Le cuentas lo que quieres, lo concreta
contigo, lo parte en tareas y arranca cada una como un worker: una sesión de `claude` con la
persona `maker`, en su propio worktree de git. Después vigila a los workers y solo te
interrumpe cuando hace falta una decisión tuya.

El paquete tiene tres piezas. La primera es `herdr-task`, el CLI de tareas de
[shepherdr](https://github.com/eliasstravik/shepherdr) (MIT), copiado en `vendor/herdr-task/`
y anclado a una versión con seis parches locales. La segunda es el lanzador `bin/assistant`,
que abre la sesión del Assistant. La tercera son las plantillas del worker y del revisor
(`templates/`). La persona `assistant` vive en el paquete `claude/` y llega con `make stow`.
El porqué de este diseño, y de no escribir un coordinador propio, está en el
[ADR 0004](../docs/adr/0004-assistant-sobre-herdr-task.md).

A lo largo de este README se usa como ejemplo el encargo `saludo` de la prueba que validó el
paquete: un script `hola.sh` y su prueba `test_hola.sh`, que no puede empezar hasta que exista
el script.

## Instalación

```bash
make assistant-install
make stow
```

`make assistant-install` enlaza `herdr-task` y `assistant` en `~/.local/bin`, enlaza las dos
plantillas en `~/.config/herdr-core/templates` y siembra `~/.herdr/shepherdr.json` si falta.
Los ajustes sembrados piden una ronda de revisión con el revisor `claude`, integración local
con tu confirmación y Autopilot apagado. El script es idempotente y no usa sudo. Tampoco toca
`~/.claude/settings.json`, porque la exclusión del sandbox que necesita el Assistant se aplica
solo a su sesión (se explica más abajo). El script se niega a instalar si encuentra un shepherdr instalado o un
`~/.herdr` que no creó él, porque esta copia no convive con otra.

El paquete queda fuera de `PACKAGES` y de `make install`, igual que `collie/` y
`terminal-browser/`: se instala a propósito, no como efecto secundario.

Falta un paso, que se hace una sola vez. Claude Code muestra un diálogo de confianza la
primera vez que se abre en una carpeta, y un worker parado en ese diálogo no avanza. Los
workers arrancan en `~/.herdr/worktrees/<repo>/task-*`, y basta con confiar en la carpeta
común. Para ello, abre `claude` en `~/.herdr/worktrees`, acepta el diálogo y sal. Esa
confianza vale para todas las subcarpetas. Como contrapartida, Claude tampoco preguntará antes de
cargar los hooks, servidores MCP o ajustes que un worker haya commiteado allí. Por eso
`accept` se para si la tarea cambia ficheros de ese tipo (`.claude/`, `.mcp.json`, hooks de
git, enlaces simbólicos…) y el Assistant te los enseña. Para integrarla, ejecutas tú
`herdr-task accept <tarea> --config-ok` en un terminal tuyo y tecleas el código que te
muestra. El Assistant no puede dar ese paso, porque su Bash no tiene terminal. Esa
comprobación no ve lo que esos ficheros ejecutan ni lo que en dotmesh se activa por Stow,
así que lee el diff antes de aceptar.

`make health` comprueba la instalación con `scripts/install.sh --status`. Avisa si falta `hc`,
algún enlace, la persona, los ajustes o la confianza en `~/.herdr/worktrees`, y también si hay
cambios sin confirmar en `vendor/`, `bin/` o `templates/`. Esto último importa porque los
enlaces apuntan a este checkout, y ese código corre fuera del sandbox.

## Uso

### Un encargo de principio a fin

El Assistant se lanza escribiendo `assistant` en un terminal de herdr, nunca desde dentro de
un agente. El lanzador marca ese terminal como coordinador del espacio, que es como
`herdr-task` sabe dónde entregar las noticias de los workers, y le quita la marca al salir.

Todo el trabajo pasa por un **encargo**: una rama `request/<slug>` con su propio worktree en
`~/.herdr/worktrees/<repo>/request-<slug>`. Las tareas salen de esa rama y se integran en
ella, de modo que tu carpeta principal no cambia ni de rama ni de ficheros mientras los
workers trabajan.

En el ejemplo, le pides al Assistant un script de saludo con su prueba. El Assistant abre el
encargo `saludo`, añade `hola.sh` y añade `test_hola.sh` con `--after` sobre la primera, porque
la prueba necesita que el script exista. Después arranca las dos. `hola.sh` empieza enseguida
y `test_hola.sh` espera en cola.

Mientras trabajan, los workers mandan noticias al Assistant: `ready` cuando terminan,
`needs-you` cuando se paran a preguntar, `stalled` cuando llevan rato sin avanzar. Ante una
pregunta, el Assistant te la trae con sus opciones tal cual y contesta en el worker lo que
elijas. Ante un `ready`, revisa el resultado antes de decirte nada y te propone aceptarlo.
Los workers no tienen pestaña propia; si quieres ver uno, el Assistant te da el comando
`hc attach <terminal>` para abrirlo en otro terminal.

Cuando le dices que acepte `hola.sh`, `herdr-task accept` integra la rama de la tarea en
`request/saludo` con un avance rápido, dentro del worktree del encargo, y borra la rama y el
worktree de la tarea. En ese momento `test_hola.sh` sale de la cola y arranca sola. Cuando
aceptas también la prueba, el encargo contiene las dos cosas.

Publicar es cosa tuya. El Assistant no hace push ni abre pull requests, y `herdr-task` tiene
esa parte desactivada. Para publicar, abre una sesión en el worktree del encargo y usa
`/super-git`. Después puedes pedirle al Assistant que cierre el encargo con `--remove`, que
retira el worktree y la rama. Se niega si se perdería algo: tareas sin terminar, cambios o
ficheros sin seguimiento o ignorados en el worktree, o commits que no están ni en una rama
remota ni en la rama de la que salió el encargo.

### Trabajo que arranca solo

Hay tres formas de que una tarea arranque sin que nadie la lance en ese momento, y las tres
siguen la regla de los encargos.

- **`--after`.** La tarea espera en cola hasta que se acepten las que nombra, como
  `test_hola.sh` en el ejemplo.
- **Tareas programadas** (`--at '2026-11-06 09:00'`, `--in 2h`). Arrancan a su hora.
- **Automatizaciones** (`herdr-task auto add … --every 'weekdays 9:00'`). Guardan una tarea y
  la vuelven a añadir con cada hora o evento, con un worker nuevo cada vez.

Una tarea programada o una automatización tiene que apuntar a un encargo abierto
(`--base request/<slug>`) y no admite `--here`. Se comprueba al crearla, al dispararse y antes
de arrancar. Si el encargo se ha cerrado entretanto, la tarea vuelve a «To do» con el motivo, y
la automatización se pausa sin crear nada. Un encargo cerrado sin `--remove` sigue en el
almacén y no se puede reabrir con el mismo nombre. En ese caso, la automatización necesita otro
encargo (`auto edit <id> --worktree --base request/<nuevo>`) y `auto resume`. Si se cerró con
`--remove`, basta con reabrirlo con el mismo nombre y reanudar la automatización.

**Autopilot** despierta al Assistant por horario o por eventos de las tareas, con un texto de
latido que escribes tú. Viene apagado en todos los espacios. Solo lo enciendes tú, desde un
terminal que no sea el del Assistant; la sesión del Assistant tiene esos verbos denegados:

```bash
herdr-task autopilot on --space <espacio>
herdr-task autopilot set --space <espacio> --on needs-you --heartbeat '<latido>' --direction '<rumbo>'
herdr-task autopilot off --space <espacio>
```

Con Autopilot encendido, el Assistant contesta él mismo a un worker solo cuando la pregunta es
una elección cerrada de gusto o de alcance menor, y te dice en una línea qué eligió. Una
pregunta sobre permisos, sandbox, red, secretos, borrados, push, una integración en la rama por
defecto, una dependencia nueva o un cambio de alcance sigue siendo tuya. Nunca acepta ni
integra porque se lo pida un despertar.

## Qué queda confinado y qué no

Bajo `bypassPermissions`, el sandbox de Bash es el único freno, y `hc` no funciona dentro de
él. Por eso el lanzador saca del sandbox, solo para la sesión del Assistant y con su propio
`--settings`, los verbos que necesita, uno a uno: de `hc`, solo los de lectura (`get`, `ls`,
`read`, `wait`); de `herdr-task`, los que usa la persona. Cualquier otra forma se queda en la
caja, donde no llega a herdr-core. Esa sesión lee texto que escriben los workers, de modo que
el mismo `--settings` deniega además los verbos que ejecutan programas, escriben ficheros o
teclean en un terminal (`hc run`, `exec`, `file`, `send`, `keys`, `label`…), cualquier llamada
que empiece por una opción y los verbos de `herdr-task` que actúan por un worker o hacia otra
máquina. Las reglas de denegación se aplican aunque el comando esté excluido (medido el
05-11-2026 con `claude -p`).

Para contestar a un worker, el Assistant usa `herdr-task say` (texto) y `herdr-task keys`
(teclas de una lista cerrada, para un menú). Los dos escriben solo al worker de la tarea que
se nombra, y solo mientras su `claude` está en primer plano. `say` rechaza el texto de varias
líneas o que empieza por `!`, `/` o `#`, que `claude` trataría como un comando, y ninguno de
los dos escribe mientras tecleas en ese terminal; `say` tampoco mientras el worker muestra un
menú. Desde su sesión, el Assistant solo crea y arranca tareas de su repo, en un worktree
sobre un encargo y con la política de integración que tú hayas fijado; `--here`, otra
carpeta o `--set merge` quedan para ti, desde un terminal tuyo. `--prompt-file` solo lee un
brief de `.ai/tasks/` de la carpeta, y la reanudación tras un reinicio descarta cualquier
registro que no haya podido escribir herdr-task.

Los workers tienen menos todavía. No tienen la escotilla del sandbox
(`dangerouslyDisableSandbox`), así que lo que necesite red por SSH, `pre-commit` o `uv`
falla en el worker y lo haces tú en el worktree del encargo. Cada uno excluye del sandbox solo los verbos de
`herdr-task` que necesita (`ready`, `status`, `reviewed`…), uno a uno, y tiene denegados los
demás. `herdr-task` solo arranca un `claude` cuyos flags no pueden aflojar su propio sandbox.
Las noticias que escriben los workers pasan por el news-guard, un parche que comprueba qué
hay en primer plano antes de teclearlas: solo se entregan a un terminal donde corre `claude`,
o al lanzador con su `claude` vivo, nunca a una shell. Todo es local: sin `gh`, sin push y sin
`git fetch` de fondo.

Quedan dos huecos conocidos. Entre la comprobación de que `claude` está delante y el tecleo
de una noticia pasan unos segundos; si `claude` sale justo en ese intervalo, el texto puede
acabar escrito en la shell. Y un `kill -9` del lanzador deja la marca de coordinador en el terminal. El
detalle de cada parche y de estas mediciones está en [`vendor/PATCHES.md`](vendor/PATCHES.md),
y la postura del sandbox, en el [`AGENTS.md`](../AGENTS.md) del repo.

## Trampas conocidas

- **La persona solo se carga al arrancar.** Tras cambiar `assistant.md`, sal del Assistant con
  `/exit` y vuelve a lanzarlo. Las tareas siguen ahí.
- **Autopilot hereda el horario general.** Si no fijas su horario con `autopilot set --every`,
  sigue el de «Everywhere», que por defecto es cada hora. Apágalo al terminar de usarlo.
- **La integración automática no llega a un encargo.** Con la integración «por su cuenta» y sin
  pull request, el worker intentaría integrar en una rama que está desplegada en el worktree del
  encargo, y git lo rechaza. No escribe en la carpeta principal: la tarea espera a que la
  aceptes tú.
- **En una cuenta Team** no se ve el bloque `<repo-state>` del mod `cierre-fase`, como en
  cualquier otra sesión (ver `AGENTS.md`).

## Subir de versión

El pin está en `scripts/vendor/upstreams.tsv`. Para subirlo, compara `mods/tasks/bin` entre el
commit anclado y el nuevo, y lee el diff entero, porque este código corre fuera del sandbox.
Después sustituye la copia, confírmala sin cambios, actualiza la fila de `upstreams.tsv`, reaplica los parches en el orden de
`vendor/PATCHES.md` y pasa las pruebas con `python3 -m unittest discover -s assistant/tests`.
Nunca `shepherdr update` ni `npx`, porque se saltan el pin.

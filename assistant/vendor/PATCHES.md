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

Prueba: `python3 -m unittest discover -s assistant/tests`, que falla sin el parche.

## Actualizar el pin

1. Clona upstream en un directorio aparte y compara `mods/tasks/bin` entre el commit anclado
   y el nuevo con `git diff`. Lee el diff entero: este código corre fuera del sandbox.
2. Sustituye la copia, confírmala sin cambios y reaplica los parches en orden.
3. Actualiza la fila de `scripts/vendor/upstreams.tsv` y pasa las pruebas.

Nunca `shepherdr update` ni `npx`: se saltan el pin.

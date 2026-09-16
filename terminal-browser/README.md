# terminal-browser: los artefactos de claude.ai en un pane de herdr

[Terminal Browser](https://github.com/zenbu-labs/terminal-browser) es un Chromium
empaquetado con Electron que se dibuja dentro del terminal con el protocolo de gráficos
de kitty. En dotmesh tiene un solo uso: abrir los artefactos de claude.ai en un pane de
herdr, al lado de la conversación, y comentarlos sin cambiar de ventana.

Funciona gracias a un parche que rebaja una defensa de Chromium. Antes de usarlo, lee
[el parche](#el-parche) y [las reglas de uso](#reglas-de-uso).

## Instalación

```bash
make terminal-browser-install
```

El script descarga la release fijada (v0.8.1), comprueba su SHA-256 contra el valor
apuntado en el propio script, deja el comando en `~/.local/bin/terminal-browser`,
ejecuta el `setup` de upstream, endurece el navegador, le pone el tope de fotogramas y
aplica el parche. Es idempotente y no usa sudo. Si la versión fijada ya está instalada
no descarga nada ni cierra los navegadores abiertos, así que se puede repetir para
comprobar que los tres siguen puestos.

`terminal-browser/` **no está en `PACKAGES`** ni en `make install`: no enlaza nada con
Stow, y el parche se instala a propósito, nunca de arrastre.

Quedan dos pasos manuales, una vez por máquina:

1. **Perfil AppArmor** (Ubuntu 24.04 y posteriores). El kernel restringe los espacios
   de nombres de usuario sin privilegios, y Chromium los necesita para su sandbox. El
   `setup` de upstream escribe el perfil con sudo; aquí se omite y el instalador imprime
   el comando si falta:

   ```bash
   bash ~/.local/share/terminal-browser/app/scripts/apparmor.sh
   ```

   El perfil va ligado a la ruta del binario, así que sobrevive a las actualizaciones.
2. **Sesión en claude.ai.** La primera vez que abras un artefacto, inicia sesión dentro
   del navegador. El perfil persiste entre arranques.

herdr necesita `kitty_graphics = true` en su sección `[experimental]`. Ya está en
`herdr/.config/herdr/config.toml`; sin ella, el pane se queda en negro.

## Uso

```bash
terminal-browser open <url del artefacto> --split right
terminal-browser ls         # navegadores y pestañas de esta pestaña de herdr
terminal-browser shutdown   # cierra todos los navegadores y su daemon
```

Todos los panes comparten un mismo proceso de navegador: cerrar un pane no lo para,
`shutdown` sí.

Claude Code también puede abrirlo. La skill `terminal-browser` le enseña los comandos
(ver [lo que toca fuera del paquete](#lo-que-toca-fuera-del-paquete)).

Cuando Claude Code publica un artefacto por primera vez dentro de un pane de herdr, el
hook `claude/.claude/hooks/offer-terminal-browser.sh` le recuerda que ofrezca abrirlo al
lado. Solo lo ofrece: el navegador se abre si aceptas. Calla al republicar, porque la
vista abierta se actualiza sola, y fuera de herdr o sin `terminal-browser` instalado. Del
resultado de la publicación solo pasa al agente una URL de artefacto de claude.ai con la
forma exacta; cualquier otra cosa se descarta.

## El parche

Terminal Browser dibuja las páginas fuera de pantalla y reenvía él mismo el ratón y el
teclado. claude.ai sirve cada artefacto en un iframe de otro dominio
(`claudeusercontent.com`), y con el aislamiento de sitios de Chromium ese iframe corre en
un proceso aparte al que el input reenviado no llega. El síntoma: los botones de la
página de claude.ai responden, pero dentro del artefacto no hay scroll ni selección de
texto, y sin selección no se puede comentar.

`scripts/site-isolation.sh` añade dos opciones de arranque a `browser/dist/main.js`,
antes de que Electron esté listo: `disable-site-isolation-trials` y
`disable-features=IsolateOrigins,site-per-process`. Con ellas el iframe vuelve al proceso
de la página y el input le llega.

```bash
bash terminal-browser/scripts/site-isolation.sh            # aplica (idempotente)
bash terminal-browser/scripts/site-isolation.sh --status   # exit 0 con parche, 1 sin él
bash terminal-browser/scripts/site-isolation.sh --revert   # restaura el main.js original
```

El script comprueba antes de escribir que su punto de inserción aparece exactamente una
vez. Si Terminal Browser ha cambiado, se niega y no deja rastro. Guarda el original en
`main.js.orig`. El daemon conserva las opciones con las que arrancó, así que tras
aplicar o revertir hay que correr `terminal-browser shutdown`.

### Qué riesgo asume

Sin aislamiento, el artefacto y claude.ai comparten proceso. La política de mismo origen
sigue en pie: el JavaScript del artefacto no puede leer la página de claude.ai ni sus
cookies. Se pierde la segunda barrera: un fallo explotable en el motor de renderizado de
Chromium, o un ataque de canal lateral del tipo Spectre, podría leer la memoria del
proceso, y en esa memoria está la sesión de claude.ai.

Con artefactos propios el riesgo es bajo, porque su código lo escribe Claude a petición
tuya. Con páginas ajenas no lo es.

Un artefacto propio puede cargar además bibliotecas de CDN públicas, como cdnjs o
jsDelivr. Ese código es de terceros y corre en el mismo proceso, así que el riesgo
depende también de esas CDN.

## El endurecimiento

De serie, Terminal Browser concede a cualquier página el acceso a los dispositivos MIDI
y guarda las descargas en la carpeta de descargas sin preguntar. Para ver artefactos
propios no hace falta ninguna de las dos cosas, y las dos dejan a una página actuar
fuera del navegador. `scripts/harden.sh` las corta con dos inserciones en
`browser/dist/main.js`: el gestor de permisos deniega `midi` y `midiSysex`, y cada
descarga se cancela antes de empezar. Al pulsar un enlace de descarga no pasa nada ni
aparece ningún aviso.

El corte vale para lo que hacen las páginas. Un programa que maneje el navegador por su
puerto de depuración, como hace `terminal-browser action`, puede reactivar las descargas.
Ese puerto solo escucha en `127.0.0.1`, y quien llega a él controla ya el navegador
entero.

```bash
bash terminal-browser/scripts/harden.sh            # aplica (idempotente)
bash terminal-browser/scripts/harden.sh --status   # exit 0 endurecido, 1 sin endurecer
bash terminal-browser/scripts/harden.sh --revert   # quita las dos inserciones
```

Igual que el parche, comprueba sus puntos de inserción antes de escribir y se niega si
Terminal Browser ha cambiado. No guarda copia: solo inserta texto, y `--revert` quita
exactamente lo insertado. Si existe `main.js.orig`, lo edita también, así que revertir el
parche de aislamiento no se lleva el endurecimiento. Tras aplicarlo o revertirlo hay que
correr `terminal-browser shutdown`.

Se probó el 15-09-2026 con v0.8.1 en un daemon aislado. Sin endurecer, la página
obtenía el permiso `midi` y el fichero llegaba a la carpeta de descargas. Endurecido, el
permiso sale `denied` y la carpeta queda vacía.

## El tope de fotogramas

Terminal Browser pinta al ritmo de la pantalla, y en Linux no hay salida por GPU: el
render fuera de pantalla se configura con `useSharedTexture` en falso, así que cada
fotograma se copia por CPU, se comprime y se escribe en el terminal. A 60 fps eso deja
el hilo principal de Electron clavado en un núcleo entero, y la entrada se entrega en
ese mismo hilo, así que la saturación se nota como retraso al desplazar o al
seleccionar texto.

`scripts/tune.sh` baja el ritmo por defecto a 30 fps con una inserción en
`frameRate()`. Medido en esta máquina, en un pane de 1694×1957 y con una página que
repinta en cada fotograma:

| fps | electron | ghostty | herdr | caudal al terminal |
|---|---|---|---|---|
| 60 (de serie) | 105 % | 75 % | 40 % | 627 MB/s |
| 40 | 79 % | — | — | — |
| 30 | 63 % | 64 % | 27 % | 389 MB/s |
| 20 | 39 % | — | — | — |

Recortar píxeles no sirve: con `TERMINAL_BROWSER_MAX_PIXELS` el fotograma sigue
viajando al tamaño del pane y el caudal no baja. Apagar la GPU tampoco: dobla el coste
(electron al 219 %), pese al aviso de `MESA-LOADER` que sale al arrancar.

```bash
bash terminal-browser/scripts/tune.sh            # aplica (idempotente)
bash terminal-browser/scripts/tune.sh --status   # exit 0 con tope, 1 sin él
bash terminal-browser/scripts/tune.sh --revert   # quita la inserción
```

Igual que el endurecimiento, comprueba su punto de inserción antes de escribir y se
niega si Terminal Browser ha cambiado. Edita también `main.js.orig` si existe, así que
revertir el parche de aislamiento no se lleva el tope por delante.

`TERMINAL_BROWSER_FPS` sigue mandando por encima del tope, con la misma prueba que hace
el navegador: manda si es un número finito mayor que cero, y con cualquier otro valor se
queda el tope. Y solo llega si está en el shell del pane que lanza el navegador:
`open --split` pide a herdr que corra el comando en un pane nuevo, que no hereda el
entorno de quien llama. Para probar otro
ritmo hay que montar el pane a mano con `herdr pane split` y lanzar ahí el navegador
con la variable en línea y `--no-merge`.

Tras aplicarlo o revertirlo hay que correr `terminal-browser shutdown`.

## Reglas de uso

1. **Solo páginas propias**: tus artefactos de claude.ai, ficheros HTML locales o un
   servidor en `localhost`. Un artefacto que te comparta otra persona se abre en el
   navegador normal.
2. **No navegues por otras webs** en Terminal Browser. El parche afecta a todo el
   navegador, no solo a claude.ai.
3. **Actualiza solo con `make terminal-browser-install`**, nunca con
   `terminal-browser upgrade`. `upgrade` se salta el pin y la instalación nueva llega
   sin parche: vuelve el aislamiento, que es lo seguro, pero los artefactos dejan de
   aceptar comentarios sin avisar. `make health` lo detecta: avisa si falta el parche,
   el endurecimiento o el tope de fotogramas, y si la versión instalada no es la
   fijada.

La skill `terminal-browser` está disponible en cualquier proyecto, así que las tres
reglas se repiten en las instrucciones globales de los tres agentes
(`claude/.claude/AGENTS.md`, `codex/.codex/AGENTS.md` y
`opencode/.config/opencode/AGENTS.md`). Sin eso, un agente que trabaja en otro repo no
las leería.

Si ya se hizo `upgrade`, el instalador no baja de versión por su cuenta, porque un
Chromium más viejo sobre un perfil más nuevo puede perder la sesión de claude.ai. Avisa,
deja la instalación como está y aplica el endurecimiento, el tope de fotogramas y
después el parche. Si alguno no encuentra sus puntos de inserción, se detiene con
exit 3 sin intentar los siguientes.

## Subir de versión

1. En `scripts/install.sh`, cambia `TB_TAG` y las cuatro sumas SHA-256. Tómalas del
   digest de cada asset en la página de la release de GitHub y compáralas con el
   `latest.json` de terminal-browser.sh: tienen que coincidir.
2. Actualiza la fila `terminal-browser` de `scripts/vendor/upstreams.tsv`.
3. Corre `make terminal-browser-install`. Detecta la versión vieja, descarga la nueva y
   cierra los navegadores abiertos.
4. Si para con exit 3, `main.js` ha cambiado. Si se niega `site-isolation.sh`, busca
   dónde se añaden ahora las opciones de Chromium antes de `app.whenReady` y ajusta su
   ancla. Si se niega `harden.sh`, busca `function granted(` y el gestor de
   `will-download`. Si se niega `tune.sh`, busca `function frameRate(`, y comprueba
   además que la variable sigue llamándose `TERMINAL_BROWSER_FPS`: si upstream la
   renombra, el tope se aplica igual y deja de haber manera de saltárselo.

`make vendor-check` no vigila esta fila (sale `blocked_upstream`, como neovim), así que
las versiones nuevas se miran a mano.

## Lo que toca fuera del paquete

El `setup` de upstream, que el instalador ejecuta y que la CLI repite sola tras cada
actualización, hace dos cosas fuera de la app:

- **Enlaza la skill `terminal-browser`** en `~/.claude/skills`, `~/.agents/skills` y
  `~/.codex/skills`, como symlinks a la app instalada. No se vendoriza en
  `agents/.agents/skills/`: se actualiza junto con el binario que describe.
- **Activa las imágenes del terminal** (`terminal.integrated.enableImages: true`) en el
  `settings.json` de cada editor de la familia VS Code. El de dotmesh es un symlink al
  repo y ya lleva esa línea, así que no produce diff.

Además guarda su estado en `~/.local/state/terminal-browser/`.

## Trampas conocidas

1. **Pane en negro.** Falta `kitty_graphics = true` en herdr, o el terminal que hospeda
   herdr no admite gráficos de kitty. Ghostty sí los admite.
2. **Dentro del sandbox de Bash de Claude Code no funciona**, porque `terminal-browser`
   escribe su estado en `~/.local/share` en cada llamada, también en `ls`, y la caja no
   deja escribir ahí. El agente lo lanza fuera del sandbox, comando a comando.
3. **Stow plegado.** Si `~/.agents` o `~/.agents/skills` es un symlink al repo (Stow los
   pliega cuando no existían), el `setup` crea el enlace de la skill dentro de
   `agents/.agents/skills/`. Aparece como fichero sin seguimiento y no se commitea. Lo
   mismo vale para `~/.codex/skills`.
4. **WSL.** El instalador no hace nada, porque herdr no corre en WSL.

## Deudas

- `make vendor-check` no avisa de releases nuevas.
- No se ha probado en macOS: las sumas de darwin están fijadas, pero sin ejecutar.

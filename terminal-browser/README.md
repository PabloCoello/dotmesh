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
ejecuta el `setup` de upstream y aplica el parche. Es idempotente y no usa sudo. Si la
versión fijada ya está instalada no descarga nada ni cierra los navegadores abiertos,
así que se puede repetir para comprobar que el parche sigue puesto.

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

## Reglas de uso

1. **Solo páginas propias**: tus artefactos de claude.ai, ficheros HTML locales o un
   servidor en `localhost`. Un artefacto que te comparta otra persona se abre en el
   navegador normal.
2. **No navegues por otras webs** en Terminal Browser. El parche afecta a todo el
   navegador, no solo a claude.ai.
3. **Actualiza solo con `make terminal-browser-install`**, nunca con
   `terminal-browser upgrade`. `upgrade` se salta el pin y la instalación nueva llega
   sin parche: vuelve el aislamiento, que es lo seguro, pero los artefactos dejan de
   aceptar comentarios sin avisar. `make health` lo detecta: avisa si falta el parche y
   si la versión instalada no es la fijada.

La skill `terminal-browser` está disponible en cualquier proyecto, así que las tres
reglas se repiten en las instrucciones globales de los tres agentes
(`claude/.claude/AGENTS.md`, `codex/.codex/AGENTS.md` y
`opencode/.config/opencode/AGENTS.md`). Sin eso, un agente que trabaja en otro repo no
las leería.

Si ya se hizo `upgrade`, el instalador no baja de versión por su cuenta, porque un
Chromium más viejo sobre un perfil más nuevo puede perder la sesión de claude.ai. Avisa,
deja la instalación como está y aplica el parche si encuentra su punto de inserción.

## Subir de versión

1. En `scripts/install.sh`, cambia `TB_TAG` y las cuatro sumas SHA-256. Tómalas del
   digest de cada asset en la página de la release de GitHub y compáralas con el
   `latest.json` de terminal-browser.sh: tienen que coincidir.
2. Actualiza la fila `terminal-browser` de `scripts/vendor/upstreams.tsv`.
3. Corre `make terminal-browser-install`. Detecta la versión vieja, descarga la nueva y
   cierra los navegadores abiertos.
4. Si para con exit 3, `main.js` ha cambiado: busca dónde se añaden ahora las opciones
   de Chromium antes de `app.whenReady` y ajusta el ancla de `site-isolation.sh`.

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
   usa sockets locales que la caja bloquea. El agente lo lanza fuera del sandbox,
   comando a comando.
3. **Stow plegado.** Si `~/.agents` o `~/.agents/skills` es un symlink al repo (Stow los
   pliega cuando no existían), el `setup` crea el enlace de la skill dentro de
   `agents/.agents/skills/`. Aparece como fichero sin seguimiento y no se commitea. Lo
   mismo vale para `~/.codex/skills`.
4. **WSL.** El instalador no hace nada, porque herdr no corre en WSL.

## Deudas

- `make vendor-check` no avisa de releases nuevas.
- No se ha probado en macOS: las sumas de darwin están fijadas, pero sin ejecutar.

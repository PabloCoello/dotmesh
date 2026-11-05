# herdr-app

Configuración de la app gráfica de herdr (herdr-app, sobre herdr-core). `make stow` enlaza `keys.json` en `~/.config/herdr-app/`. El resto de esa carpeta lo escribe la propia app y no se versiona.

## Atajos

`keys.json` parte de los atajos que trae herdr-app 0.1.13 y añade los chords `ctrl+alt` que ya usa la TUI (`herdr/.config/herdr/config.toml`). Así la capa META del Voyager funciona igual en las dos interfaces sin tocar el firmware.

| Chord | TUI | App |
|---|---|---|
| `ctrl+alt+h/j/k/l` | `focus_pane_*` | `pane.go:left/down/up/right` |
| `ctrl+alt+z` | `zoom` | `pane.zoom` |
| `ctrl+alt+d` | `split_vertical` | `pane.split:right` |
| `ctrl+alt+shift+d` | `split_horizontal` | `pane.split:down` |
| `ctrl+alt+x` | `close_pane` | `pane.close` |
| `ctrl+alt+c` | `new_tab` | `tab.new` |
| `ctrl+alt+n` / `ctrl+alt+p` | `next_tab` / `previous_tab` | `tab.next` / `tab.prev` |
| `ctrl+alt+w` | `workspace_picker` | `mod.open:picker` |
| `ctrl+alt+g` | `goto` | `mod.open:picker` |
| `ctrl+alt+q` | `detach` | `app.hide` |

Dos equivalencias son aproximadas y un atajo falta. La app no tiene un modo `goto` propio, así que `ctrl+alt+g` abre el mismo selector que `ctrl+alt+w`. Tampoco tiene `detach`: lo más cercano es ocultar la ventana, y los terminales siguen corriendo en herdr-core. `ctrl+alt+m` (marca «para luego») no está: en la TUI lanza `mark-later.sh`, y `keys.json` no puede ejecutar comandos de shell.

## Al actualizar la app

herdr-app solo renueva los atajos por defecto de un `keys.json` que nadie ha tocado. Este se ha editado, así que los atajos nuevos que traiga una versión hay que añadirlos a mano. `herdr-app commands` lista los comandos disponibles.

Si un cambio deja el fichero inválido, la app conserva la última versión buena y explica el error en `~/.config/herdr-app/keys.error`. `ctrl+alt+shift+escape` aparta `keys.json` y vuelve a los atajos por defecto. Como el original es un enlace a este repositorio, después basta con volver a ejecutar `make stow`.

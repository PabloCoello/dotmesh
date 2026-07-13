# gnome — rice del escritorio (retint sobre Yaru)

Lleva el lenguaje visual de [`docs/DESIGN.md`](../docs/DESIGN.md) (Paper · Ink ·
Syntax) al escritorio GNOME como una superficie más, junto a VS Code, Ghostty,
Starship y delta. La intención es la misma: **cromo monocromo Ink y el color
solo como señal**. Es un *retint sobre Yaru*, no un tema a medida: se mantiene la
base nativa y se ajustan colores, acento y tipografía.

Pensado para **Ubuntu GNOME (Linux)**. En macOS es un no-op.

## Qué toca

Dos capas:

| Capa | Cómo se aplica | Qué hace |
|---|---|---|
| Colores de apps | `gtk.css` enlazado por stow | Recolorea superficies GTK3/GTK4 (libadwaita) a tonos Ink, con teal `#6CB6B0` como acento. |
| Fondo | PNG enlazado por stow (`scripts/gen-wallpaper.py` lo genera) | Malla dotmesh sobre Ink `#121212` con tres nodos-señal: teal, sage y rose. Determinista y reproducible. |
| Sistema | `scripts/apply-rice.sh` (dconf) | Base oscura + acento viridian, tipografía (Inter UI · JetBrainsMono Nerd Font), tinte Ink del dock (dash-to-dock) y fija el fondo. Iconos y cursor se quedan en Yaru a propósito. |
| Guardián de monitores | `dotmesh-monitor-guard` (servicio systemd de usuario) | Cura el fondo negro que deja mutter en el monitor reencendido (X11 + NVIDIA): escucha `MonitorsChanged` y re-aplica la configuración vigente vía D-Bus. |

- `.config/gtk-3.0/gtk.css` → `~/.config/gtk-3.0/gtk.css`
- `.config/gtk-4.0/gtk.css` → `~/.config/gtk-4.0/gtk.css`
- `.local/share/backgrounds/dotmesh-mesh-ink.png` → `~/.local/share/backgrounds/…`
- `.local/bin/dotmesh-monitor-guard` → `~/.local/bin/…`
- `.config/systemd/user/dotmesh-monitor-guard.service` → `~/.config/systemd/user/…`

## Guardián de monitores

Al reencender un monitor DisplayPort con NVIDIA en X11, mutter restaura el
layout pero deja sin pintar el fondo del monitor reañadido (negro puro).
Ni re-fijar el fondo por gsettings ni tocar extensiones lo curan; re-aplicar
la configuración vigente con `ApplyMonitorsConfig` (temporal, misma geometría)
sí reconstruye las vistas. Verificado en GNOME 46 / Ubuntu 24.04 / driver 570.

El guardián escucha `MonitorsChanged` en el bus de sesión y responde con ese
eco. Coalesce ráfagas de señales (2 s) y suprime el rebote de su propio apply
(4 s). Si el layout vigente no es aplicable (lo impuso una herramienta externa,
por ejemplo xrandr con solape), lo registra y espera a la siguiente señal.

```bash
systemctl --user status dotmesh-monitor-guard.service   # estado
journalctl --user -u dotmesh-monitor-guard -f           # actividad
```

El Shell (barra superior, overview) se queda en Yaru-dark con el blur que ya
aporta `blur-my-shell`; un recoloreado más profundo del Shell pediría un tema a
medida y queda fuera de este retint.

## Aplicar

```bash
make gnome-rice    # enlaza gtk.css + ejecuta apply-rice.sh (solo Linux)
```

Reinicia las apps GTK (o cierra sesión) para ver el retint de `gtk.css`; la capa
dconf se aplica al instante. `apply-rice.sh` también habilita el guardián de
monitores (`systemctl --user enable --now`), de forma idempotente.

## Revertir

```bash
systemctl --user disable --now dotmesh-monitor-guard.service  # para el guardián
stow -D -t ~ gnome                 # quita los symlinks (gtk.css y fondo)
```

`make gnome-unrice` hace ambas cosas.

Para la capa dconf (acento, tipografía, dock, fondo), restaura tu volcado previo
(haz uno antes con `dconf dump /org/gnome/ > gnome-pre-rice.ini` y luego
`dconf load /org/gnome/ < gnome-pre-rice.ini`).

## Regenerar el fondo

```bash
python3 scripts/gen-wallpaper.py            # reproduce el PNG versionado
python3 scripts/gen-wallpaper.py out.png 88 24 24 52 1   # spacing jitter line dot teal
```

## Hecho y pendiente

Hecho: colores de apps, tipografía, tinte del dock y fondo (malla Ink). Iconos y
cursor se mantienen en Yaru a propósito (ya casan con el acento viridian).
Pendiente, si algún día se quiere ir más lejos: recoloreado profundo del Shell
(pediría un tema a medida) o sets alternativos de iconos/cursor. Ver
`docs/DESIGN.md`.

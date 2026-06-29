# gnome — rice del escritorio (retint sobre Yaru)

Lleva el lenguaje visual de [`docs/DESIGN.md`](../docs/DESIGN.md) (Paper · Ink ·
Syntax) al escritorio GNOME como una superficie más, junto a VS Code, Warp,
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

- `.config/gtk-3.0/gtk.css` → `~/.config/gtk-3.0/gtk.css`
- `.config/gtk-4.0/gtk.css` → `~/.config/gtk-4.0/gtk.css`
- `.local/share/backgrounds/dotmesh-mesh-ink.png` → `~/.local/share/backgrounds/…`

El Shell (barra superior, overview) se queda en Yaru-dark con el blur que ya
aporta `blur-my-shell`; un recoloreado más profundo del Shell pediría un tema a
medida y queda fuera de este retint.

## Aplicar

```bash
make gnome-rice    # enlaza gtk.css + ejecuta apply-rice.sh (solo Linux)
```

Reinicia las apps GTK (o cierra sesión) para ver el retint de `gtk.css`; la capa
dconf se aplica al instante.

## Revertir

```bash
stow -D -t ~ gnome                 # quita los symlinks (gtk.css y fondo)
```

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

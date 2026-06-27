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
| Sistema | `scripts/apply-rice.sh` (dconf) | Base oscura + acento viridian, tipografía (Inter UI · JetBrainsMono Nerd Font), y tinte Ink del dock (dash-to-dock). |

- `.config/gtk-3.0/gtk.css` → `~/.config/gtk-3.0/gtk.css`
- `.config/gtk-4.0/gtk.css` → `~/.config/gtk-4.0/gtk.css`

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
stow -D -t ~ gnome                 # quita los symlinks de gtk.css
```

Para la capa dconf, restaura tu volcado previo (haz uno antes con
`dconf dump /org/gnome/ > gnome-pre-rice.ini` y luego
`dconf load /org/gnome/ < gnome-pre-rice.ini`).

## Segunda iteración (pendiente)

Fondo de pantalla en tono Ink, iconos y cursor. Ver `docs/DESIGN.md`.

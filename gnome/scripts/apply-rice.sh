#!/usr/bin/env bash
#
# dotmesh — rice de GNOME (retint sobre Yaru).
#
# Aplica la capa dconf del rice: base oscura + acento viridian (≈ teal dotmesh),
# tipografía dotmesh y tinte Ink del dock. La capa de colores de apps (gtk.css)
# va por stow, no por aquí.
#
# Idempotente y reversible: solo escribe claves gsettings; para revertir, carga
# el backup que deja `make backup` o usa `dconf load` con tu volcado previo.
# Solo Linux/GNOME.

set -euo pipefail

if ! command -v gsettings >/dev/null 2>&1; then
    echo "  --  gsettings no disponible; nada que hacer (¿no es GNOME?)."
    exit 0
fi

say() { printf '  ok  %s\n' "$1"; }

# --- Base: oscuro + acento viridian (la variante Yaru más cercana al teal) ---
gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
gsettings set org.gnome.desktop.interface gtk-theme   'Yaru-viridian-dark'
gsettings set org.gnome.desktop.interface icon-theme  'Yaru-viridian'
say "base oscura + acento viridian"

# --- Tipografía dotmesh (Inter de UI; JetBrainsMono Nerd Font para mono) ---
gsettings set org.gnome.desktop.interface font-name          'Inter 11'
gsettings set org.gnome.desktop.interface document-font-name  'Inter 11'
gsettings set org.gnome.desktop.interface monospace-font-name 'JetBrainsMono Nerd Font 11'
gsettings set org.gnome.desktop.wm.preferences titlebar-font  'Inter Semi-Bold 11'
gsettings set org.gnome.desktop.interface font-antialiasing   'rgba'
gsettings set org.gnome.desktop.interface font-hinting        'slight'
say "tipografía (Inter UI · JetBrainsMono Nerd Font · hinting slight)"

# --- Dock: tinte Ink, dejando ver el blur de blur-my-shell ---
DTD='org.gnome.shell.extensions.dash-to-dock'
if gsettings list-schemas 2>/dev/null | grep -qx "$DTD"; then
    gsettings set "$DTD" custom-background-color true
    gsettings set "$DTD" background-color '#16171B'
    gsettings set "$DTD" transparency-mode 'FIXED'
    gsettings set "$DTD" background-opacity 0.6
    say "dock con tinte Ink (#16171B)"
else
    echo "  --  dash-to-dock no instalado; me salto el dock."
fi

echo "Rice dotmesh aplicado. Reinicia las apps GTK (o cierra sesión) para ver el"
echo "retint de gtk.css; el resto se aplica al momento."

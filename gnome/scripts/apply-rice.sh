#!/usr/bin/env bash
#
# dotmesh — rice de GNOME (retint sobre Yaru).
#
# Aplica la capa dconf del rice: base oscura + acento viridian (≈ teal dotmesh),
# tipografía dotmesh y tinte Ink del dock. La capa de colores de apps (gtk.css)
# va por stow, no por aquí.
#
# Idempotente y reversible: solo escribe claves gsettings; para revertir, usa
# el volcado dconf guardado en ~/.local/share/dotmesh/dconf-pre-rice.ini
# (la primera ejecución lo crea; mantén ese fichero fuera de make backup).
# Solo Linux/GNOME.

set -euo pipefail

if ! command -v gsettings >/dev/null 2>&1; then
    echo "  --  gsettings no disponible; nada que hacer (¿no es GNOME?)."
    exit 0
fi

# Guarda de esquema: necesitamos org.gnome.desktop.interface (GNOME Desktop).
GDI='org.gnome.desktop.interface'
if ! gsettings list-schemas 2>/dev/null | grep -qx "$GDI"; then
    echo "  --  esquema GNOME Desktop no encontrado; nada que hacer (¿no es GNOME?)."
    exit 0
fi

say() { printf '  ok  %s\n' "$1"; }

# --- Volcado previo de dconf (idempotente: no sobreescribe si ya existe) ---
DCONF_DIR="$HOME/.local/share/dotmesh"
DCONF_BACKUP="$DCONF_DIR/dconf-pre-rice.ini"
mkdir -p "$DCONF_DIR"
if [ ! -f "$DCONF_BACKUP" ]; then
    dconf dump / > "$DCONF_BACKUP"
    say "estado dconf guardado en $DCONF_BACKUP"
else
    say "volcado previo ya existe en $DCONF_BACKUP (no se sobrescribe)"
fi

# --- Base: oscuro + acento viridian (la variante Yaru más cercana al teal) ---
gsettings set org.gnome.desktop.interface color-scheme 'prefer-dark'
gsettings set org.gnome.desktop.interface gtk-theme    'Yaru-viridian-dark'
gsettings set org.gnome.desktop.interface icon-theme   'Yaru-viridian'
gsettings set org.gnome.desktop.interface cursor-theme 'Yaru'
say "base oscura + acento viridian (iconos/cursor Yaru)"

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
    gsettings set "$DTD" background-color '#121212'
    gsettings set "$DTD" transparency-mode 'FIXED'
    gsettings set "$DTD" background-opacity 0.6
    say "dock con tinte Ink (#121212)"
else
    echo "  --  dash-to-dock no instalado; me salto el dock."
fi

# --- Fondo de pantalla: malla dotmesh sobre Ink (enlazado por stow) ---
WALL="$HOME/.local/share/backgrounds/dotmesh-mesh-ink.png"
if [ -f "$WALL" ]; then
    gsettings set org.gnome.desktop.background picture-options 'zoom'
    gsettings set org.gnome.desktop.background picture-uri      "file://$WALL"
    gsettings set org.gnome.desktop.background picture-uri-dark "file://$WALL"
    say "fondo dotmesh (malla Ink)"
else
    echo "  --  fondo no encontrado ($WALL); ¿falta 'stow gnome'?"
fi

# --- Guardián de monitores: eco DisplayConfig tras hotplug (X11/NVIDIA) ---
GUARD="dotmesh-monitor-guard.service"
if [ -f "$HOME/.config/systemd/user/$GUARD" ] && command -v systemctl >/dev/null 2>&1; then
    systemctl --user daemon-reload
    if systemctl --user enable --now "$GUARD" >/dev/null 2>&1; then
        say "guardián de monitores activo ($GUARD)"
    else
        echo "  --  no pude activar $GUARD (¿sesión sin systemd --user?)."
    fi
else
    echo "  --  $GUARD sin enlazar; ejecuta 'make gnome-rice' (hace stow gnome) y reintenta."
fi

echo "Rice dotmesh aplicado. Reinicia las apps GTK (o cierra sesión) para ver el"
echo "retint de gtk.css; el resto se aplica al momento."

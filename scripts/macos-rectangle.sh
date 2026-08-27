#!/usr/bin/env bash
# macos-rectangle.sh
# Fija la configuración de Rectangle (gestor de ventanas de macOS) que el layout
# del Voyager da por supuesta. Idempotente. No-op fuera de macOS.
#
# Por qué está en dotmesh: el keymap del Voyager (repo keymesh) resuelve Pant← y
# Pant→ como Ctrl+Opt+Cmd+←/→, que son "Move to previous/next display" de
# Rectangle. macOS no trae atajo nativo para mover una ventana de monitor, así
# que sin Rectangle esas dos teclas no hacen nada.
#
# El ajuste que de verdad importa es alternateDefaultShortcuts:
#
#   false -> juego heredado de Spectacle: mitades en Cmd+Opt+flechas.
#   true  -> juego "recomendado" de Rectangle: mitades y tercios en
#            Ctrl+Opt+letra, que es justo la familia que usan los chords
#            directos de herdr (ctrl+alt+h/j/k/l/c/d/g/n/p/q/w/x/z).
#
# Con true, Rectangle registra atajos globales y se come seis chords de herdr
# (J, K, C, D, G, además de Ctrl+Opt+= y -). Por eso se deja en false.

set -e

DOMAIN="com.knollsoft.Rectangle"
APP="/Applications/Rectangle.app"

if [ "$(uname -s)" != "Darwin" ]; then
    echo "  ok  macos-rectangle solo aplica en macOS; no-op aquí"
    exit 0
fi

if [ ! -d "$APP" ]; then
    echo "  --  Rectangle no está instalado (brew install --cask rectangle)"
    exit 0
fi

# Rectangle guarda sus preferencias en memoria y las reescribe cuando cambian:
# si escribimos con la app viva, puede pisar lo que acabamos de poner. Se cierra,
# se escribe y se vuelve a abrir si estaba corriendo.
WAS_RUNNING=0
if pgrep -x Rectangle >/dev/null 2>&1; then
    WAS_RUNNING=1
    echo "→ cerrando Rectangle para escribir sus prefs"
    osascript -e 'tell application "Rectangle" to quit' >/dev/null 2>&1 || killall Rectangle 2>/dev/null || true
    for _ in $(seq 1 25); do
        pgrep -x Rectangle >/dev/null 2>&1 || break
        sleep 0.2
    done
fi

set_bool() {
    defaults write "$DOMAIN" "$1" -bool "$2"
    echo "  ok  $1 = $2"
}

set_int() {
    defaults write "$DOMAIN" "$1" -int "$2"
    echo "  ok  $1 = $2"
}

echo "→ aplicando prefs de Rectangle"

# Juego de atajos: Spectacle. Deja libre Ctrl+Opt+letra para herdr.
set_bool alternateDefaultShortcuts false

# Repetir el mismo atajo mueve la ventana al monitor siguiente (acrossMonitor)
# en vez de ciclar tamaños. Es lo que hace útil Pant←/Pant→ con dos pantallas.
set_int  subsequentExecutionMode 1

# Permite asignar combinaciones que macOS considera reservadas.
set_bool allowAnyShortcut true

# Sin icono en la barra de menús: el layout se opera a ciegas desde el teclado.
set_bool hideMenubarIcon true

# Arrancar con la sesión: un gestor de ventanas parado deja Pant←/Pant→ muertas.
set_bool launchOnLogin true

# Las actualizaciones las gestiona Homebrew, no Sparkle.
set_bool SUEnableAutomaticChecks false

if [ "$WAS_RUNNING" = "1" ]; then
    echo "→ reabriendo Rectangle"
    open -a Rectangle
else
    echo "  !!  Rectangle está parado. Ábrelo una vez y concédele permiso en"
    echo "      Ajustes del Sistema → Privacidad y seguridad → Accesibilidad."
fi

echo "→ estado final"
defaults read "$DOMAIN" alternateDefaultShortcuts >/dev/null 2>&1 \
    && echo "  ok  prefs escritas en $DOMAIN" \
    || echo "  !!  no se pudieron leer las prefs de $DOMAIN"

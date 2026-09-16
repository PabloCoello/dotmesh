#!/usr/bin/env bash
#
# Caps the frame rate of the installed terminal-browser, which is what makes it
# feel fluid inside a pane.
#
# Upstream paints at the display rate, and on Linux there is no GPU path out of
# the browser: offscreen rendering is configured with useSharedTexture false, so
# every frame is copied by CPU, compressed and written to the terminal. Measured
# on this machine in a 1694x1957 pane against a page that repaints every frame:
#
#   60 fps (default)   electron 105 %   ghostty 75 %   herdr 40 %   627 MB/s
#   40 fps             electron  79 %
#   30 fps             electron  63 %   ghostty 64 %   herdr 27 %   389 MB/s
#   20 fps             electron  39 %
#
# At the display rate the Electron main thread sits pegged at one full core, and
# input is delivered on that same thread (sendInputEvent behind a focus gate), so
# the saturation is what reads as lag while scrolling or selecting text. Cutting
# frames is the only lever that moves the cost: capping pixels per frame does not
# (the frame still travels at pane size), and disabling the GPU doubles it.
#
# The edit only inserts text after a fixed anchor, so --revert takes out exactly
# what apply put in. It goes into main.js and, when site-isolation.sh left one,
# into main.js.orig as well, so the three patches compose in any order. And it
# leaves TERMINAL_BROWSER_FPS in charge, under upstream's own test: a finite
# number above zero, exported in the shell of the pane that runs the browser,
# still wins over the cap. The guard repeats that test instead of asking whether
# the variable is set, because upstream answers a bad value with the display
# rate, which is the rate this patch exists to avoid.
#
#   tune.sh           apply (idempotent)
#   tune.sh --status  exit 0 if capped, 1 if not
#   tune.sh --revert  take the edit out
#
# This is harden.sh with another anchor table, on purpose: each patch stays
# appliable, revertible and checkable on its own, and a shared engine would tie
# the three together for no gain. Changing FPS means reverting with the old
# value first, since apply and --revert both match the inserted text, number
# included.
#
# An upgrade replaces the install and drops the edit. The running daemon keeps
# its old code: run `terminal-browser shutdown`.
set -euo pipefail

APP="${XDG_DATA_HOME:-$HOME/.local/share}/terminal-browser/app"
MAIN="$APP/browser/dist/main.js"
MODE="${1:-apply}"

case "$MODE" in
  apply|--status|--revert) ;;
  *) echo "uso: $0 [apply|--status|--revert]" >&2; exit 2 ;;
esac
[ -f "$MAIN" ] || { echo "terminal-browser no está instalado: falta $MAIN" >&2; exit 1; }
command -v python3 >/dev/null || { echo "falta python3: no se toca main.js" >&2; exit 1; }
VERSION="$(cat "$APP/VERSION" 2>/dev/null || echo desconocida)"

# Every file is checked before any is written, and each write is an atomic swap.
MODE="$MODE" MAIN="$MAIN" VERSION="$VERSION" python3 - <<'EOF'
import os, sys, tempfile
mode, main, version = os.environ["MODE"], os.environ["MAIN"], os.environ["VERSION"]
MARKER = "/* dotmesh: frame cap */"
FPS = 30
# (anchor, text inserted right after it)
EDITS = [
    ('function frameRate() {',
     ' const dotmeshFps = Number(process.env.TERMINAL_BROWSER_FPS);'
     f' if (!(Number.isFinite(dotmeshFps) && dotmeshFps > 0)) return {FPS};'),
]

def edited(anchor, add):
    return f"{anchor}{add} {MARKER}"

def capped(src):
    # The edit, once, and no stray marker: a hand-edited main.js is not.
    return src.count(MARKER) == len(EDITS) and all(src.count(edited(a, t)) == 1 for a, t in EDITS)

if mode == "--status":
    ok = capped(open(main, encoding="utf-8").read())
    print(f"con tope de {FPS} fps ({version})" if ok else f"sin tope de fps ({version})")
    sys.exit(0 if ok else 1)

def apply(src, path):
    if capped(src):
        return src
    if MARKER in src:
        sys.exit(f"{path} tiene la marca pero no las ediciones esperadas: no se toca "
                 "(si has cambiado FPS, revierte antes con el valor anterior)")
    for anchor, add in EDITS:
        hits = src.count(anchor)
        if hits != 1:
            sys.exit(f"se esperaba una vez {anchor!r} en {path} y aparece {hits}: "
                     "terminal-browser ha cambiado, no se pone el tope")
        src = src.replace(anchor, edited(anchor, add), 1)
    return src

def revert(src, path):
    for anchor, add in EDITS:
        src = src.replace(edited(anchor, add), anchor)
    if MARKER in src:
        sys.exit(f"{path} tiene la marca pero no las ediciones esperadas: no se toca "
                 "(si has cambiado FPS, revierte antes con el valor anterior)")
    return src

change = apply if mode == "apply" else revert
paths = [p for p in (main, main + ".orig") if os.path.isfile(p)]
plan = []
for path in paths:
    src = open(path, encoding="utf-8").read()
    new = change(src, path)
    if new != src:
        plan.append((path, new))
for path, new in plan:
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".main.js.")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(new)
        os.chmod(tmp, os.stat(path).st_mode)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
if mode == "apply":
    print(f"pintado a {FPS} fps ({version}); corre: terminal-browser shutdown"
          if plan else f"ya tenía el tope de {FPS} fps ({version})")
else:
    print(f"tope de fps quitado ({version}); corre: terminal-browser shutdown"
          if plan else "sin tope de fps, nada que revertir")
EOF

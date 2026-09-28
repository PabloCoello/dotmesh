#!/usr/bin/env bash
#
# Hardens the installed terminal-browser for its one job here, showing the user's
# own claude.ai artifacts: web MIDI is denied (upstream grants it to every page)
# and downloads are cancelled (upstream saves them to ~/Downloads without asking).
#
# Both edits only insert text after a fixed anchor, so --revert takes out exactly
# what apply put in. They go into main.js and, when site-isolation.sh left one,
# into main.js.orig as well: reverting that patch keeps this one, in either order.
#
#   harden.sh           apply (idempotent)
#   harden.sh --status  exit 0 if hardened, 1 if not
#   harden.sh --revert  take the edits out
#
# An upgrade replaces the install and drops the edits. The running daemon keeps
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
MARKER = "/* dotmesh: hardened */"
# (anchor, text inserted right after it)
EDITS = [
    ('function granted(contents, permission) {',
     ' if (permission === "midi" || permission === "midiSysex") return false;'),
    ('target.on("will-download", (_event, item) => {',
     ' _event.preventDefault(); return;'),
]

def edited(anchor, add):
    return f"{anchor}{add} {MARKER}"

def hardened(src):
    # Both edits, once each, and no stray marker: a hand-edited main.js is not.
    return src.count(MARKER) == len(EDITS) and all(src.count(edited(a, t)) == 1 for a, t in EDITS)

if mode == "--status":
    ok = hardened(open(main, encoding="utf-8").read())
    print(f"endurecido ({version})" if ok else f"sin endurecer ({version})")
    sys.exit(0 if ok else 1)

def apply(src, path):
    if hardened(src):
        return src
    if MARKER in src:
        sys.exit(f"{path} tiene la marca pero no las ediciones esperadas: no se toca")
    for anchor, add in EDITS:
        hits = src.count(anchor)
        if hits != 1:
            sys.exit(f"se esperaba una vez {anchor!r} en {path} y aparece {hits}: "
                     "terminal-browser ha cambiado, no se endurece")
        src = src.replace(anchor, edited(anchor, add), 1)
    return src

def revert(src, path):
    for anchor, add in EDITS:
        src = src.replace(edited(anchor, add), anchor)
    if MARKER in src:
        sys.exit(f"{path} tiene la marca pero no las ediciones esperadas: no se toca")
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
    print(f"endurecido: sin MIDI ni descargas ({version}); corre: terminal-browser shutdown"
          if plan else f"ya estaba endurecido ({version})")
else:
    print(f"endurecimiento revertido ({version}); corre: terminal-browser shutdown"
          if plan else "sin endurecer, nada que revertir")
EOF

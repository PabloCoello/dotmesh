#!/usr/bin/env bash
#
# Turns off Chromium site isolation in the installed terminal-browser so input
# reaches cross-origin iframes (claude.ai artifacts) under offscreen rendering.
# Without it, scroll, text selection and comments do nothing inside an artifact.
# Why that is acceptable, and the rules that go with it: terminal-browser/README.md.
#
#   site-isolation.sh           apply (idempotent)
#   site-isolation.sh --status  exit 0 if patched, 1 if not
#   site-isolation.sh --revert  restore the original main.js
#
# An upgrade replaces the install and silently drops the patch, back to the safe
# default. The running daemon keeps its old switches: run `terminal-browser shutdown`.
set -euo pipefail

APP="${XDG_DATA_HOME:-$HOME/.local/share}/terminal-browser/app"
MAIN="$APP/browser/dist/main.js"
ORIG="$MAIN.orig"
MARKER="/* dotmesh: site isolation off */"

[ -f "$MAIN" ] || { echo "terminal-browser no está instalado: falta $MAIN" >&2; exit 1; }
VERSION="$(cat "$APP/VERSION" 2>/dev/null || echo desconocida)"

case "${1:-apply}" in
  --status)
    if grep -qF "$MARKER" "$MAIN"; then echo "con parche ($VERSION)"; else echo "sin parche ($VERSION)"; exit 1; fi
    ;;
  --revert)
    if ! grep -qF "$MARKER" "$MAIN"; then echo "sin parche, nada que revertir"; exit 0; fi
    [ -f "$ORIG" ] || { echo "hay parche pero falta $ORIG; reinstala terminal-browser" >&2; exit 1; }
    mv -f "$ORIG" "$MAIN"
    echo "parche revertido ($VERSION); corre: terminal-browser shutdown"
    ;;
  apply)
    if grep -qF "$MARKER" "$MAIN"; then echo "ya tenía el parche ($VERSION)"; exit 0; fi
    command -v python3 >/dev/null || { echo "falta python3: no se aplica el parche" >&2; exit 1; }
    # Validate first, then back up, then swap atomically: a refused patch leaves no trace.
    MAIN="$MAIN" ORIG="$ORIG" MARKER="$MARKER" python3 - <<'EOF'
import os, re, shutil, sys
path, orig, marker = os.environ["MAIN"], os.environ["ORIG"], os.environ["MARKER"]
src = open(path, encoding="utf-8").read()
# The switches must be appended before app.whenReady; this one already is.
anchor = re.compile(r'(import_electron\d+)\.app\.commandLine\.appendSwitch\("disable-renderer-backgrounding"\);')
hits = anchor.findall(src)
if len(hits) != 1:
    sys.exit(f"se esperaba un ancla en main.js y hay {len(hits)}: terminal-browser ha cambiado, no se aplica el parche")
if "disable-features" in src:
    sys.exit("main.js ya fija disable-features y la fusión no está resuelta: no se aplica el parche")
def add(m):
    e = m.group(1)
    return (m.group(0) + f' {e}.app.commandLine.appendSwitch("disable-site-isolation-trials");'
            f' {e}.app.commandLine.appendSwitch("disable-features", "IsolateOrigins,site-per-process"); {marker}')
tmp = path + ".tmp"
try:
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(anchor.sub(add, src, count=1))
    shutil.copy2(path, orig)
    os.replace(tmp, path)
finally:
    if os.path.exists(tmp):
        os.remove(tmp)
EOF
    echo "parche aplicado ($VERSION); corre: terminal-browser shutdown"
    ;;
  *) echo "uso: $0 [apply|--status|--revert]" >&2; exit 2 ;;
esac

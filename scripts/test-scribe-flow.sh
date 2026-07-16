#!/usr/bin/env bash
# Arnés headless de validación del flujo scribe + mesh-review.
# Uso: bash scripts/test-scribe-flow.sh
# Requiere: claude (con ANTHROPIC_API_KEY activa), node
# Casos:
#   control    — 0 hilos pendientes → 0 eventos nuevos
#   tratamiento — 2 hilos pendientes → ≥1 evento nuevo + respuesta con secciones
set -euo pipefail

# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MESH_REVIEW="$REPO_ROOT/agents/.agents/skills/doc-review/bin/mesh-review.mjs"
FIXTURES_DIR="$SCRIPT_DIR/fixtures/scribe-flow"

# ---------------------------------------------------------------------------
# Contadores globales
# ---------------------------------------------------------------------------
PASS=0
FAIL=0

pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }
section() { echo ""; echo "--- $* ---"; }

# ---------------------------------------------------------------------------
# 1. Comprobación de dependencias
# ---------------------------------------------------------------------------
section "Dependencias"

if ! command -v claude >/dev/null 2>&1; then
  echo "ERROR: 'claude' no está en PATH. Instala Claude Code y asegúrate de que ANTHROPIC_API_KEY esté activa."
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: 'node' no está en PATH."
  exit 1
fi
if [ ! -f "$MESH_REVIEW" ]; then
  echo "ERROR: mesh-review.mjs no encontrado en: $MESH_REVIEW"
  echo "       Ejecuta 'make cli-build' para generarlo."
  exit 1
fi

echo "  claude: $(command -v claude)"
echo "  node:   $(command -v node) ($(node --version))"
echo "  mesh-review: $MESH_REVIEW"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
CLEANUP_DIRS=()
CLAUDE_STDERR=$(mktemp)
cleanup() {
  for d in "${CLEANUP_DIRS[@]}"; do
    [ -d "$d" ] && rm -rf "$d"
  done
  rm -f "$CLAUDE_STDERR"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Función: prepara un directorio temporal con git + eventos del fixture
# Establece $TMPWORK con la ruta del directorio creado
# ---------------------------------------------------------------------------
setup_workdir() {
  local fixture_dir="$1"
  TMPWORK=$(mktemp -d)
  CLEANUP_DIRS+=("$TMPWORK")

  cp "$fixture_dir/doc.md" "$TMPWORK/"

  git -C "$TMPWORK" init -q
  git -C "$TMPWORK" config user.email "test@example.com"
  git -C "$TMPWORK" config user.name "Test"
  git -C "$TMPWORK" add doc.md
  git -C "$TMPWORK" commit -q -m "initial"

  mkdir -p "$TMPWORK/.ai/review/doc.md"
  cp "$fixture_dir/events/"*.json "$TMPWORK/.ai/review/doc.md/"
}

# ---------------------------------------------------------------------------
# Función: valida todos los ficheros .json de un directorio
# Argumentos: $1 = directorio de eventos
# Devuelve: 0 si todos válidos, 1 si alguno falla
# ---------------------------------------------------------------------------
validate_events_in_dir() {
  local dir="$1"
  EVENT_DIR="$dir" node -e "
const fs = require('fs');
const dir = process.env.EVENT_DIR;
let failures = 0;
const files = fs.readdirSync(dir).filter(n => n.endsWith('.json'));
const re = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
for (const f of files) {
  try {
    const data = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
    if (data.version !== 2) {
      process.stderr.write('FAIL: version!==2 en ' + f + '\n'); failures++; continue;
    }
    if (!re.test(data.id || '')) {
      process.stderr.write('FAIL: id no es UUID v4 en ' + f + ': ' + data.id + '\n'); failures++; continue;
    }
    if (!re.test(data.thread_id || '')) {
      process.stderr.write('FAIL: thread_id no es UUID v4 en ' + f + ': ' + data.thread_id + '\n'); failures++; continue;
    }
    process.stdout.write('  ok  ' + f + '\n');
  } catch(e) {
    process.stderr.write('FAIL: error en ' + f + ': ' + e.message + '\n'); failures++;
  }
}
process.exit(failures > 0 ? 1 : 0);
"
}

# ---------------------------------------------------------------------------
# Función: ejecuta claude -p con la persona scribe
# Argumentos:
#   $1 = directorio de trabajo (git root)
#   $2 = prompt
# Salida: stdout de la respuesta de claude (campo "result" del JSON)
#         Devuelve 0 si claude terminó sin timeout, 1 si hubo error/timeout
# ---------------------------------------------------------------------------
run_claude_scribe() {
  local workdir="$1"
  local prompt="$2"
  local raw_response claude_exit

  set +e
  # Prompt via stdin para evitar que --add-dir (variádico) lo consuma como directorio
  # NOTA: --dangerously-skip-permissions desactiva los diálogos de permisos de
  # Claude Code y --add-dir no es un sandbox de SO. El riesgo se acepta porque
  # el prompt es mínimo y las rutas apuntan al directorio temporal.
  raw_response=$(cd "$workdir" && echo "$prompt" | timeout 600 claude -p \
    --output-format json \
    --dangerously-skip-permissions \
    --settings '{"outputStyle":"scribe"}' \
    --add-dir "$workdir" \
    2>"$CLAUDE_STDERR")
  claude_exit=$?
  set -e

  if [ "$claude_exit" -eq 124 ]; then
    echo "" >&2
    echo "  !! claude -p agotó el timeout (600s). Stderr:" >&2
    cat "$CLAUDE_STDERR" >&2
    return 1
  fi
  if [ "$claude_exit" -ne 0 ]; then
    echo "" >&2
    echo "  !! claude -p terminó con código $claude_exit. Stderr:" >&2
    cat "$CLAUDE_STDERR" >&2
    return 1
  fi

  # Extraer el campo "result" del JSON de salida
  echo "$raw_response" | node -e "
const d = require('fs').readFileSync('/dev/stdin', 'utf8');
try {
  const parsed = JSON.parse(d);
  process.stdout.write((parsed.result || '') + '\n');
} catch(e) {
  process.stdout.write(d + '\n');
}
"
}

# ---------------------------------------------------------------------------
# Prompt para claude -p
# Nota: --bare omite CLAUDE.md, así que el prompt debe ser autocontenido.
# El cometido es mínimo: proyectar hilos pendientes y emitir eventos.
# ---------------------------------------------------------------------------
build_prompt() {
  local mesh_path="$1"
  local doc_path="$2"
  cat <<PROMPT
Tu tarea: revisar los comentarios pendientes del documento en "$doc_path".

Pasos (ejecuta exactamente en este orden):

PASO 1 — Proyecta los hilos pendientes:
  node "$mesh_path" project --pending "$doc_path"

PASO 2 — Si el resultado del PASO 1 es [] (array vacío), ve directamente al PASO 3 sin emitir nada.
  Si hay hilos, para CADA hilo en el array:
    a) Extrae el valor de "thread_id" del hilo (es un UUID).
    b) Escribe un evento message.posted usando este comando exacto (sustituyendo
       <THREAD_ID> por el UUID del hilo y <RESPUESTA> por una respuesta breve de 10-15 palabras
       en el mismo idioma del comentario):
       node "$mesh_path" emit "$doc_path" message.posted thread_id=<THREAD_ID> body="<RESPUESTA>" commit=null author.kind=ai author.model=claude-sonnet-4-6 dirty=false

PASO 3 — Produce la respuesta estructurada con estas tres secciones EXACTAS:

## Contexto
(documento revisado, hilos abiertos antes y después de la sesión)

## Alcance
(hilos procesados, o "Ningún hilo pendiente" si el array del PASO 1 estaba vacío)

## Preguntas
(preguntas para el humano; escribe "Ninguna" si no hay)
PROMPT
}

# ===========================================================================
# CASO TRATAMIENTO
# ===========================================================================
section "Caso TRATAMIENTO (2 hilos pendientes → ≥1 evento nuevo)"

setup_workdir "$FIXTURES_DIR/tratamiento"
WORK_TRAT="$TMPWORK"

# Pre-verificación con CLI
pending_json=$(node "$MESH_REVIEW" project --pending "$WORK_TRAT/doc.md")
count_pending=$(echo "$pending_json" | node -e "
const d = require('fs').readFileSync('/dev/stdin', 'utf8');
process.stdout.write(String(JSON.parse(d).length) + '\n');
")
if [ "$count_pending" = "2" ]; then
  pass "pre-check: project --pending retorna $count_pending hilos"
else
  fail "pre-check: project --pending retorna $count_pending (esperado 2)"
fi

events_before=$(find "$WORK_TRAT/.ai/review/doc.md" -maxdepth 1 -name "*.json" | wc -l | tr -d ' ')
echo "  Eventos antes de claude: $events_before"

PROMPT_TRAT=$(build_prompt "$MESH_REVIEW" "$WORK_TRAT/doc.md")

echo "  Ejecutando claude -p (puede tardar varios minutos)..."
RESULT_TEXT_TRAT=""
if RESULT_TEXT_TRAT=$(run_claude_scribe "$WORK_TRAT" "$PROMPT_TRAT"); then
  echo "  claude -p completado"
else
  fail "tratamiento: claude -p falló o agotó el timeout"
fi

# Verificar ≥1 evento nuevo
events_after=$(find "$WORK_TRAT/.ai/review/doc.md" -maxdepth 1 -name "*.json" | wc -l | tr -d ' ')
new_events=$((events_after - events_before))
echo "  Eventos después de claude: $events_after (nuevos: $new_events)"

if [ "$new_events" -ge 1 ]; then
  pass "tratamiento: se emitieron $new_events evento(s) nuevo(s)"
else
  fail "tratamiento: se esperaba ≥1 evento nuevo; se emitieron $new_events"
  echo "  Respuesta de claude (primeros 500 chars):"
  echo "$RESULT_TEXT_TRAT" | head -c 500
fi

# Validar todos los eventos del directorio
echo "  Validando eventos en directorio..."
if validate_events_in_dir "$WORK_TRAT/.ai/review/doc.md"; then
  pass "tratamiento: todos los eventos son válidos (version=2, UUIDs v4)"
else
  fail "tratamiento: algún evento no pasa la validación"
fi

# Verificar secciones en la respuesta
echo "  Respuesta (primeros 400 chars):"
echo "$RESULT_TEXT_TRAT" | head -c 400
echo ""
if echo "$RESULT_TEXT_TRAT" | grep -qi "contexto"; then
  pass "tratamiento: respuesta contiene sección 'Contexto'"
else
  fail "tratamiento: respuesta NO contiene 'Contexto'"
fi
if echo "$RESULT_TEXT_TRAT" | grep -qi "alcance"; then
  pass "tratamiento: respuesta contiene sección 'Alcance'"
else
  fail "tratamiento: respuesta NO contiene 'Alcance'"
fi
if echo "$RESULT_TEXT_TRAT" | grep -qi "preguntas"; then
  pass "tratamiento: respuesta contiene sección 'Preguntas'"
else
  fail "tratamiento: respuesta NO contiene 'Preguntas'"
fi

# ===========================================================================
# CASO CONTROL
# ===========================================================================
section "Caso CONTROL (0 hilos pendientes → 0 eventos nuevos)"

setup_workdir "$FIXTURES_DIR/control"
WORK_CTRL="$TMPWORK"

# Pre-verificación
pending_ctrl=$(node "$MESH_REVIEW" project --pending "$WORK_CTRL/doc.md")
if [ "$pending_ctrl" = "[]" ]; then
  pass "pre-check: project --pending retorna [] (vacío)"
else
  fail "pre-check: project --pending retorna $pending_ctrl (esperado [])"
fi

events_before_ctrl=$(find "$WORK_CTRL/.ai/review/doc.md" -maxdepth 1 -name "*.json" | wc -l | tr -d ' ')
echo "  Eventos antes de claude: $events_before_ctrl"

PROMPT_CTRL=$(build_prompt "$MESH_REVIEW" "$WORK_CTRL/doc.md")

echo "  Ejecutando claude -p (puede tardar varios minutos)..."
RESULT_TEXT_CTRL=""
if RESULT_TEXT_CTRL=$(run_claude_scribe "$WORK_CTRL" "$PROMPT_CTRL"); then
  echo "  claude -p completado"
else
  fail "control: claude -p falló o agotó el timeout"
fi

events_after_ctrl=$(find "$WORK_CTRL/.ai/review/doc.md" -maxdepth 1 -name "*.json" | wc -l | tr -d ' ')
new_events_ctrl=$((events_after_ctrl - events_before_ctrl))
echo "  Eventos después de claude: $events_after_ctrl (nuevos: $new_events_ctrl)"

if [ "$new_events_ctrl" -eq 0 ]; then
  pass "control: no se emitieron eventos nuevos (correcto)"
else
  fail "control: se emitieron $new_events_ctrl eventos inesperados"
fi

# ===========================================================================
# Resumen
# ===========================================================================
section "Resumen"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo ""

if [ "$FAIL" -eq 0 ]; then
  echo "RESULTADO FINAL: PASS"
  exit 0
else
  echo "RESULTADO FINAL: FAIL"
  exit 1
fi

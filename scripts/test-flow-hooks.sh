#!/usr/bin/env bash
# Prueba de los hooks del flujo con inputs sintéticos. Sin red, sin agentes y
# sin coste: monta transcripts falsos en un directorio temporal y comprueba qué
# inyecta cada hook.
#
# Cubre lo que la medición del 2026-08-31 dejó abierto: dentro de un subagente,
# transcript_path apunta al transcript del padre, así que el hook tiene que
# derivar el suyo desde agent_id o mira el sitio equivocado.
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
HOOKS="$REPO_ROOT/claude/.claude/hooks"
GATE="$HOOKS/remind-review-gate.sh"

PASS=0
FAIL=0
pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }
section() { echo ""; echo "--- $* ---"; }

command -v jq >/dev/null 2>&1 || { echo "jq no encontrado; el hook falla abierto y la prueba no discrimina"; exit 1; }

TMP=$(mktemp -d -p "${TMPDIR:-/tmp}" flowhooks.XXXXXX)
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

# Línea de transcript con una llamada real a la herramienta Skill.
skill_line() { printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"%s"}}]}}\n' "$1"; }
# Línea con una delegación al subagente review.
review_line() { printf '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Agent","input":{"subagent_type":"review"}}]}}\n'; }

# Monta un par de transcripts: $1 = evidencia en el padre (si|no),
# $2 = evidencia en el propio del subagente (si|no). Imprime la ruta del padre.
make_transcripts() {
  local parent_ev="$1" own_ev="$2" dir
  dir=$(mktemp -d -p "$TMP" case.XXXXXX)
  local parent="$dir/sesion.jsonl"
  printf '{"type":"user","message":{"content":"hola"}}\n' > "$parent"
  [ "$parent_ev" = si ] && review_line >> "$parent"
  mkdir -p "$dir/sesion/subagents"
  local own="$dir/sesion/subagents/agent-abc123.jsonl"
  printf '{"type":"user","isSidechain":true}\n' > "$own"
  [ "$own_ev" = si ] && skill_line code-review-and-quality >> "$own"
  printf '%s' "$parent"
}

# Ejecuta el hook. $1 = comando, $2 = transcript del padre, $3 = agent_id (vacío
# para el orquestador). Devuelve el additionalContext, o cadena vacía.
run_gate() {
  local cmd="$1" tp="$2" aid="${3:-}" input out
  input=$(jq -nc --arg c "$cmd" --arg t "$tp" --arg a "$aid" \
    '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c},transcript_path:$t}
     + (if $a == "" then {} else {agent_id:$a,agent_type:"build"} end)')
  out=$(printf '%s' "$input" | bash "$GATE" 2>/dev/null || true)
  printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null || printf ''
}

section "sintaxis"
if bash -n "$GATE"; then pass "remind-review-gate.sh compila"; else fail "remind-review-gate.sh no compila"; fi

section "orquestador"
tp=$(make_transcripts no no)
msg=$(run_gate 'git commit -m "algo"' "$tp")
case "$msg" in
  *"lanza el subagente review"*) pass "sin evidencia, pide el subagente review" ;;
  "") fail "sin evidencia, no avisó" ;;
  *) fail "sin evidencia, mensaje inesperado: $msg" ;;
esac

tp=$(make_transcripts si no)
msg=$(run_gate 'git commit -m "algo"' "$tp")
[ -z "$msg" ] && pass "con evidencia en el padre, calla" || fail "con evidencia, avisó igualmente"

msg=$(run_gate 'git status --porcelain' "$tp")
[ -z "$msg" ] && pass "un comando que no es commit no dispara" || fail "disparó fuera de un commit"

tp=$(make_transcripts no no)
msg=$(run_gate 'git commit -m "esto no es un git commit de verdad"' "$tp")
[ -n "$msg" ] && pass "el commit se detecta pese al mensaje que lo menciona" || fail "el mensaje entrecomillado tapó el commit"

section "subagente"
tp=$(make_transcripts no no)
msg=$(run_gate 'git commit -m "algo"' "$tp" abc123)
case "$msg" in
  *code-review-and-quality*)
    case "$msg" in
      *"lanza el subagente"*) fail "al subagente se le pide delegar, y no puede" ;;
      *) pass "sin evidencia, pide cargar la skill sobre su propio diff" ;;
    esac ;;
  "") fail "subagente sin evidencia, no avisó" ;;
  *) fail "mensaje inesperado: $msg" ;;
esac

# La regresión que motiva el arreglo: la evidencia del padre no vale por el hijo.
tp=$(make_transcripts si no)
msg=$(run_gate 'git commit -m "algo"' "$tp" abc123)
[ -n "$msg" ] && pass "la evidencia del padre no exime al subagente" || fail "el subagente pasó con la evidencia del padre"

tp=$(make_transcripts no si)
msg=$(run_gate 'git commit -m "algo"' "$tp" abc123)
[ -z "$msg" ] && pass "con la skill en su propio transcript, calla" || fail "avisó pese a la evidencia propia"

section "fallo abierto"
tp=$(make_transcripts no no)
msg=$(run_gate 'git commit -m "algo"' "$tp" sinfichero)
case "$msg" in
  *"lanza el subagente review"*) pass "sin transcript propio, degrada al aviso del orquestador" ;;
  "") fail "sin transcript propio se quedó callado, que es el defecto original" ;;
  *) fail "mensaje inesperado: $msg" ;;
esac

msg=$(run_gate 'git commit -m "algo"' "$TMP/no-existe.jsonl")
[ -z "$msg" ] && pass "sin transcript del padre, falla abierto" || fail "avisó sin transcript"

# agent_id saneado: los puntos y las barras se caen, así que no hay travesía de
# rutas ni lectura de un fichero de otro directorio.
tp=$(make_transcripts no si)
msg=$(run_gate 'git commit -m "algo"' "$tp" '../../abc123')
[ -z "$msg" ] && pass "agent_id con travesía queda saneado a abc123" || fail "el saneado de agent_id cambió el fichero leído"

SKILLS="$HOOKS/remind-load-skills.sh"

# Ejecuta el recordatorio de skills en un TMPDIR propio, para que el marcador de
# un caso no contamine el siguiente. $1 = tool_name, $2 = comando o ruta,
# $3 = agent_id (vacío para el orquestador), $4 = TMPDIR (opcional, para
# encadenar dos llamadas en el mismo "agente").
run_skills() {
  local tool="$1" arg="$2" aid="${3:-}" td="${4:-}" input out
  [ -z "$td" ] && td=$(mktemp -d -p "$TMP" tmpdir.XXXXXX)
  input=$(jq -nc --arg t "$tool" --arg a "$arg" --arg g "$aid" \
    '{hook_event_name:"PreToolUse",tool_name:$t,session_id:"sesion-1"}
     + (if $t == "Bash" then {tool_input:{command:$a}} else {tool_input:{file_path:$a}} end)
     + (if $g == "" then {} else {agent_id:$g,agent_type:"build"} end)')
  out=$(printf '%s' "$input" | TMPDIR="$td" bash "$SKILLS" 2>/dev/null || true)
  printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null || printf ''
}

section "recordatorio de skills: sintaxis y una vez por agente"
if bash -n "$SKILLS"; then pass "remind-load-skills.sh compila"; else fail "remind-load-skills.sh no compila"; fi

td=$(mktemp -d -p "$TMP" tmpdir.XXXXXX)
msg=$(run_skills Write /tmp/x.txt "" "$td")
[ -n "$msg" ] && pass "la primera escritura avisa" || fail "la primera escritura no avisó"
msg=$(run_skills Write /tmp/y.txt "" "$td")
[ -z "$msg" ] && pass "la segunda escritura del mismo agente calla" || fail "avisó dos veces al mismo agente"

# La regresión que motiva el arreglo: el subagente hereda el session_id.
msg=$(run_skills Write /tmp/z.txt agente-build "$td")
[ -n "$msg" ] && pass "un subagente del mismo session_id recibe el suyo" || fail "el marcador del padre silenció al subagente"
msg=$(run_skills Write /tmp/z2.txt agente-build "$td")
[ -z "$msg" ] && pass "el subagente tampoco recibe dos" || fail "avisó dos veces al subagente"

section "recordatorio de skills: qué cuenta como escritura por Bash"
for cmd in 'cat > notas.txt' 'tee -a notas.txt' 'sed -i s/a/b/ notas.txt' 'python x.py >> salida.log' 'mkdir -p x >/dev/null && cat > notas.txt'; do
  msg=$(run_skills Bash "$cmd")
  [ -n "$msg" ] && pass "escribe: $cmd" || fail "no lo detectó como escritura: $cmd"
done

for cmd in 'ls -la' 'git status --porcelain' 'grep -r foo .' 'echo hola > /dev/null' 'git commit -m "usa > para redirigir"'; do
  msg=$(run_skills Bash "$cmd")
  [ -z "$msg" ] && pass "no escribe: $cmd" || fail "gastó el aviso en un comando de lectura: $cmd"
done

section "registro en la plantilla de settings.json"
tpl="$REPO_ROOT/claude/.claude/settings.json"
n=$(jq '[.hooks.PreToolUse[] | select(.matcher == "Bash") | .hooks[] | select(.command | test("remind-load-skills"))] | length' "$tpl")
[ "$n" -ge 1 ] && pass "remind-load-skills.sh está registrado en el matcher Bash" || fail "falta en el matcher Bash de la plantilla"

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]

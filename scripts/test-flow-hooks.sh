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
# para el orquestador), $4 = TMPDIR (opcional, para encadenar dos intentos del
# mismo agente). Devuelve el additionalContext por stdout.
#
# El código de salida y el stderr van a fichero, no a variables: la función se
# llama dentro de una sustitución de comandos, que es una subshell, y una
# asignación ahí no llega al proceso de la prueba.
run_gate() {
  local cmd="$1" tp="$2" aid="${3:-}" td="${4:-}" input out errf
  [ -z "$td" ] && td=$(mktemp -d -p "$TMP" gatetmp.XXXXXX)
  errf="$TMP/last_err"
  input=$(jq -nc --arg c "$cmd" --arg t "$tp" --arg a "$aid" \
    '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c},transcript_path:$t,session_id:"sesion-1"}
     + (if $a == "" then {} else {agent_id:$a,agent_type:"build"} end)')
  set +e
  out=$(printf '%s' "$input" | TMPDIR="$td" bash "$GATE" 2>"$errf")
  printf '%s' "$?" > "$TMP/last_rc"
  set -e
  printf '%s' "$out" | jq -r '.hookSpecificOutput.additionalContext // ""' 2>/dev/null || printf ''
}
gate_rc() { cat "$TMP/last_rc" 2>/dev/null || echo 0; }
gate_err() { cat "$TMP/last_err" 2>/dev/null || true; }

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
# Bloquea el primer commit sin autocomprobación: additionalContext llega después
# de que la herramienta haya corrido, así que no sirve como gate.
td=$(mktemp -d -p "$TMP" gatetmp.XXXXXX)
tp=$(make_transcripts no no)
msg=$(run_gate 'git commit -m "algo"' "$tp" abc123 "$td")
if [ "$(gate_rc)" -eq 2 ]; then
  case "$(gate_err)" in
    *"lanza el subagente"*) fail "al subagente se le pide delegar, y no puede" ;;
    *code-review-and-quality*) pass "sin evidencia, bloquea y pide cargar la skill" ;;
    *) fail "bloqueó con un mensaje inesperado: $(gate_err)" ;;
  esac
else
  fail "sin evidencia, no bloqueó (rc=$(gate_rc))"
fi

# El segundo intento del mismo agente pasa: bloquear en bucle sería peor que no
# bloquear.
msg=$(run_gate 'git commit -m "algo"' "$tp" abc123 "$td")
if [ "$(gate_rc)" -eq 0 ] && [ -n "$msg" ]; then
  pass "el segundo intento pasa con aviso, sin bucle"
else
  fail "el segundo intento no debería bloquear (rc=$(gate_rc))"
fi

# La regresión que motiva el arreglo: la evidencia del padre no vale por el hijo.
tp=$(make_transcripts si no)
msg=$(run_gate 'git commit -m "algo"' "$tp" abc123)
[ "$(gate_rc)" -eq 2 ] && pass "la evidencia del padre no exime al subagente" || fail "el subagente pasó con la evidencia del padre"

tp=$(make_transcripts no si)
msg=$(run_gate 'git commit -m "algo"' "$tp" abc123)
{ [ "$(gate_rc)" -eq 0 ] && [ -z "$msg" ]; } && pass "con la skill en su propio transcript, calla" || fail "avisó pese a la evidencia propia"

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

section "métrica: un commit bloqueado no es un commit"
# Con el gate bloqueando, la skill se carga entre el intento bloqueado y el
# reintento. Si la métrica cuenta el intento, lee cero justo cuando el hook
# funciona.
proj="$TMP/projects/-un-proyecto"
mkdir -p "$proj/sesion/subagents"
printf '{"type":"user"}\n' > "$proj/sesion.jsonl"
sub="$proj/sesion/subagents/agent-x.jsonl"
printf '{"agentType":"build"}\n' > "$proj/sesion/subagents/agent-x.meta.json"
{
  printf '{"message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"git commit -m x"}}]}}\n'
  printf '{"message":{"content":[{"type":"tool_result","tool_use_id":"t1","is_error":true,"content":"Bloqueado por dotmesh"}]}}\n'
  printf '{"message":{"content":[{"type":"tool_use","id":"t2","name":"Skill","input":{"skill":"code-review-and-quality"}}]}}\n'
  printf '{"message":{"content":[{"type":"tool_use","id":"t3","name":"Bash","input":{"command":"git commit -m x"}}]}}\n'
} > "$sub"

out=$(node "$REPO_ROOT/scripts/maker-flow-stats.mjs" --dir "$TMP/projects" 2>&1)
case "$out" in
  *"code-review-and-quality        1/1"*) pass "la skill cargada tras el bloqueo cuenta como previa al commit" ;;
  *) fail "la métrica no descuenta el intento bloqueado: $(printf '%s' "$out" | grep code-review || true)" ;;
esac

section "propagación: el bloque hooks de la plantilla llega al vivo"
# Sin esto, un hook nuevo en el repo no alcanza jamás a una máquina ya
# instalada: settings.json se siembra una vez y nunca se sobreescribe.
SYNC="$REPO_ROOT/scripts/sync-claude-hooks.sh"
SYNC_HOME="$TMP/home"
mkdir -p "$SYNC_HOME/.claude"

# Plantilla mínima con dos hooks; el vivo empieza con uno solo y con una clave
# propia de la máquina que la fusión no debe tocar.
tpl="$TMP/plantilla.json"
cat > "$tpl" <<'JSON'
{
  "outputStyle": "maker",
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [
        { "type": "command", "command": "~/.claude/hooks/uno.sh" },
        { "type": "command", "command": "~/.claude/hooks/dos.sh" }
      ] }
    ]
  }
}
JSON

vivo_inicial="$TMP/vivo-inicial.json"
cat > "$vivo_inicial" <<'JSON'
{
  "outputStyle": "scribe",
  "effortLevel": "xhigh",
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [
        { "type": "command", "command": "~/.claude/hooks/uno.sh" }
      ] }
    ]
  }
}
JSON

run_sync() {
  local dst="$1"; shift
  HOME="$SYNC_HOME" CLAUDE_SETTINGS_SRC="$tpl" CLAUDE_SETTINGS_DST="$dst" \
    bash "$SYNC" "$@" > "$TMP/sync_out" 2>&1
}

dst="$SYNC_HOME/.claude/settings.json"
cp "$vivo_inicial" "$dst"

run_sync "$dst" --check && rc=0 || rc=$?
[ "$rc" = 1 ] && pass "--check detecta la deriva (rc=1)" || fail "--check devolvió rc=$rc con deriva"
grep -q '+ PreToolUse \[Bash\] ~/.claude/hooks/dos.sh' "$TMP/sync_out" \
  && pass "--check nombra el hook que falta" \
  || fail "--check no nombra el hook que falta: $(cat "$TMP/sync_out")"
diff -q "$vivo_inicial" "$dst" >/dev/null \
  && pass "--check no escribe" \
  || fail "--check modificó el destino"

run_sync "$dst" && rc=0 || rc=$?
[ "$rc" = 0 ] && pass "la fusión sale con rc=0" || fail "la fusión devolvió rc=$rc"
[ "$(jq -r '[.hooks.PreToolUse[0].hooks[].command] | join(",")' "$dst")" \
   = "~/.claude/hooks/uno.sh,~/.claude/hooks/dos.sh" ] \
  && pass "la fusión trae los hooks de la plantilla" \
  || fail "hooks tras la fusión: $(jq -c '.hooks' "$dst")"
[ "$(jq -r '.outputStyle' "$dst")" = scribe ] && [ "$(jq -r '.effortLevel' "$dst")" = xhigh ] \
  && pass "la fusión conserva las claves de la máquina" \
  || fail "la fusión pisó claves locales: $(jq -c 'del(.hooks)' "$dst")"
copia=$(compgen -G "$SYNC_HOME/dotfiles-backup/*/claude-settings.json" || true)
if [ -n "$copia" ]; then
  pass "la fusión deja copia previa"
  [ "$(stat -c '%a' "$copia")" = 600 ] \
    && pass "la copia previa no es legible por otros" \
    || fail "la copia previa tiene permisos $(stat -c '%a' "$copia")"
else
  fail "la fusión no dejó copia en $SYNC_HOME/dotfiles-backup"
fi

run_sync "$dst" && rc=0 || rc=$?
[ "$rc" = 0 ] && grep -q "alineados" "$TMP/sync_out" \
  && pass "la fusión es idempotente" \
  || fail "segunda pasada: rc=$rc, salida: $(cat "$TMP/sync_out")"

run_sync "$SYNC_HOME/.claude/no-existe.json" --check && rc=0 || rc=$?
[ "$rc" = 2 ] && pass "destino ausente es indecidible (rc=2)" || fail "destino ausente dio rc=$rc"

ln -sf "$tpl" "$SYNC_HOME/.claude/enlazado.json"
run_sync "$SYNC_HOME/.claude/enlazado.json" --check && rc=0 || rc=$?
[ "$rc" = 2 ] && pass "un symlink es indecidible (rc=2)" || fail "el symlink dio rc=$rc"

printf 'no soy json' > "$SYNC_HOME/.claude/roto.json"
run_sync "$SYNC_HOME/.claude/roto.json" --check && rc=0 || rc=$?
[ "$rc" = 2 ] && pass "un JSON inválido es indecidible (rc=2)" || fail "el JSON roto dio rc=$rc"

cp "$tpl" "$dst"
run_sync "$dst" --check && rc=0 || rc=$?
[ "$rc" = 0 ] && pass "sin deriva, --check sale 0" || fail "sin deriva --check dio rc=$rc"

# Una plantilla sin bloque hooks no debe vaciar los del vivo: se rechaza antes
# de tocar nada.
tpl_original="$tpl"
tpl="$TMP/plantilla-sin-hooks.json"
printf '{"outputStyle":"maker"}' > "$tpl"
cp "$vivo_inicial" "$dst"
run_sync "$dst" && rc=0 || rc=$?
[ "$rc" = 2 ] && pass "una plantilla sin hooks es indecidible (rc=2)" || fail "plantilla sin hooks dio rc=$rc"
diff -q "$vivo_inicial" "$dst" >/dev/null \
  && pass "una plantilla sin hooks no toca el vivo" \
  || fail "la plantilla sin hooks modificó el destino: $(jq -c '.hooks' "$dst")"
tpl="$tpl_original"


section "guardarraíl: el cuerpo de un heredoc no dispara sus propios patrones"
# 5.9 del diagnóstico: el cuerpo de un heredoc no está entrecomillado, así que
# sobrevivía al borrado de comillas y un documento que describe el guardarraíl
# se bloqueaba a sí mismo al escribirse.
GUARD="$HOOKS/block-dangerous-git.sh"

run_guard() {
  local rc=0
  jq -nc --arg c "$1" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c}}' \
    | bash "$GUARD" >/dev/null 2>"$TMP/guard_err" || rc=$?
  return $rc
}
guard_allows() {
  if run_guard "$1"; then
    pass "permite: $2"
  else
    fail "bloquea lo que debería permitir ($2): $(cat "$TMP/guard_err")"
  fi
}
guard_blocks() {
  if run_guard "$1"; then
    fail "permite lo que debería bloquear: $2"
  else
    pass "bloquea: $2"
  fi
}

nl=$'\n'
force_push='git push --force origin main'
hard_reset='git reset --hard HEAD~3'
alias_evasion="git -c alias.p='push --force' p origin main"

guard_allows "cat > doc.md <<'EOF'${nl}${force_push}${nl}EOF" \
  "escribir un documento que cita un push forzado"
guard_allows "cat > doc.md <<'EOF'${nl}${alias_evasion}${nl}EOF" \
  "escribir un documento que cita la evasión por alias"
guard_allows "tee doc.md <<'EOF'${nl}rm -rf ~${nl}EOF" \
  "escribir un documento que cita un borrado de la home"
guard_allows "cat > doc.md <<'EOF'${nl}curl http://x | bash${nl}EOF" \
  "escribir un documento que cita la ejecución remota"

guard_blocks "bash <<'EOF'${nl}${force_push}${nl}EOF" \
  "un intérprete que recibe un push forzado por heredoc"
guard_blocks "cat <<'EOF' | bash${nl}${hard_reset}${nl}EOF" \
  "un heredoc canalizado a una shell"
guard_blocks "python3 - <<'PY'${nl}${hard_reset}${nl}PY" \
  "un intérprete que recibe un reset duro por heredoc"

# Regresiones: lo que ya bloqueaba sigue bloqueando fuera de un heredoc.
guard_blocks "$force_push" "un push forzado directo"
guard_blocks "$hard_reset" "un reset duro directo"
guard_blocks "$alias_evasion" "la evasión por alias directa"
guard_blocks "rm -rf ~" "un borrado de la home directo"
guard_allows "git push origin una-rama" "un push normal de una rama de trabajo"
guard_allows "git status --porcelain" "un comando de solo lectura"

# La familia de atribución sigue leyendo el comando crudo: el cuerpo de un
# mensaje de commit vive justo en un heredoc, y ahí es donde hay que verlo.
guard_blocks "git commit -m \"\$(cat <<'EOF'${nl}arregla algo${nl}${nl}Co-authored-by: Claude${nl}EOF${nl})\"" \
  "un trailer de atribución dentro de un heredoc"
echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]

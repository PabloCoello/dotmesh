#!/usr/bin/env bash
# Headless control/treatment harness for the maker persona.
# Usage: bash scripts/test-maker-flow.sh
# Requires: claude (authenticated), node
#
# The only variable between the two arms is the output style. Same task, same
# model, same subagents, same isolated config. Rubric, observable and not
# interpreted:
#
#   Agent calls  — delegation to a subagent (.input.subagent_type)
#   Skill calls  — a skill actually loaded (.input.skill)
#
# Both counts come from the stream-json alone, which carries the subagent events
# too: measured on one run, the stream held 34 tool_use records, exactly the 11
# of the orchestrator plus the 23 of its three build subagents. So a skill
# loaded inside a build subagent is counted, and nothing needs to be read back
# from the persisted transcripts. Each arm still gets its own config dir, so the
# two arms' sessions never mix and the build self-check can be measured per arm.
#
# Each arm runs MAKER_FLOW_RUNS times (default 3) because delegation is not
# deterministic. The same three-phase task under maker produced 3, 3 and 0
# delegations across three runs on 2026-08-30: in the zero run the model
# implemented the three phases inline, one commit each, and simply never
# reached for a build subagent. A single run therefore gives no verdict.
#
# It passes when the treatment delegates in more than half of its runs and
# delegates more in total than the control. The control is not required to be
# exactly zero: the base assistant may spawn a search agent on its own, and a
# harness that fails on that is flaky rather than strict.
#
# Skill loading is reported, not gated. Measured on real history, a build
# subagent loads code-review-and-quality before committing about 38% of the
# time, so a three-phase run returns zero skills by chance roughly one time in
# four. Gating on it would make the harness fail because of the very defect it
# exists to measure. The number is printed on every run and a zero is flagged
# as WARN.
#
# Method constraints paid for by the June 2026 experiment, kept here so they are
# not rediscovered:
#   - The tool that spawns subagents is Agent, not Task.
#   - Copy agents and output styles as real files (cp -rL). Relative symlinks
#     dangle inside CLAUDE_CONFIG_DIR and the subagents never load.
#   - Symlink .credentials.json instead of copying it: the OAuth token rotates
#     and a stale copy 401s partway through a long run.
#   - Feed the prompt on stdin so the variadic --add-dir does not eat it.
#   - The isolated config carries no hooks and no settings beyond the persona,
#     so the machine's own hooks cannot influence either arm.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MODEL="${MAKER_FLOW_MODEL:-sonnet}"
TIMEOUT="${MAKER_FLOW_TIMEOUT:-900}"
RUNS="${MAKER_FLOW_RUNS:-3}"
# both | maker | control. Correr un solo brazo sirve para comparar contra una
# ejecución de aceptación previa sin repetir el brazo que no cambia.
ARMS="${MAKER_FLOW_ARMS:-both}"
# MAKER_FLOW_AGENTS=1 planta un AGENTS.md en el árbol temporal con la sección de
# refuerzo del flujo copiada literalmente del AGENTS.md de este repo, y el
# CLAUDE.md que la importa. Sirve para aislar una sola variable: cuánto del
# cumplimiento lo sostiene el AGENTS.md del proyecto y cuánto build.md.
WITH_AGENTS="${MAKER_FLOW_AGENTS:-}"

PASS=0
FAIL=0
pass() { echo "PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "FAIL: $*"; FAIL=$((FAIL + 1)); }
warn() { echo "WARN: $*"; }
section() { echo ""; echo "--- $* ---"; }

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
section "Dependencias"
for bin in claude node git; do
  command -v "$bin" >/dev/null 2>&1 || { echo "ERROR: '$bin' no está en PATH."; exit 1; }
done
echo "  claude: $(command -v claude)"
echo "  node:   $(node --version)"
echo "  modelo: $MODEL · timeout por run: ${TIMEOUT}s · runs por brazo: $RUNS"
echo "  brazos: $ARMS · AGENTS.md en el árbol: ${WITH_AGENTS:-no}"

REAL_CONFIG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
if [ ! -d "$REPO_ROOT/claude/.claude/agents" ]; then
  echo "ERROR: no encuentro claude/.claude/agents en $REPO_ROOT"
  exit 1
fi

# ---------------------------------------------------------------------------
# Cleanup. MAKER_FLOW_KEEP=1 preserves the temp trees, the raw stream-json and
# the per-arm config dirs. Needed whenever a run has to be explained rather than
# just scored.
# ---------------------------------------------------------------------------
# Todo cuelga de un único árbol raíz. make_config_dir y make_workdir se llaman
# dentro de una sustitución de comandos, que es un subshell: un `CLEANUP+=`
# dentro de ellas se perdía y dejaba los directorios en /tmp para siempre.
ROOT_TMP=$(mktemp -d)
cleanup() {
  if [ -n "${MAKER_FLOW_KEEP:-}" ]; then
    echo ""
    echo "MAKER_FLOW_KEEP: se conservan los artefactos en $ROOT_TMP"
    return 0
  fi
  rm -rf "$ROOT_TMP"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# One isolated config per arm: the repo's agents and output styles, the
# canonical skills tree, and the real credentials. Nothing else, so the
# machine's hooks and settings cannot reach either arm.
# ---------------------------------------------------------------------------
make_config_dir() {
  local dir
  dir=$(mktemp -d -p "$ROOT_TMP" config.XXXXXX)
  cp -rL "$REPO_ROOT/claude/.claude/agents" "$dir/agents"
  cp -rL "$REPO_ROOT/claude/.claude/output-styles" "$dir/output-styles"
  ln -s "$REPO_ROOT/agents/.agents/skills" "$dir/skills"
  if [ -e "$REAL_CONFIG/.credentials.json" ]; then
    ln -s "$REAL_CONFIG/.credentials.json" "$dir/.credentials.json"
  fi
  printf '%s' "$dir"
}

# ---------------------------------------------------------------------------
# Task: three dependent phases already planned on disk. The plan is the sharpest
# trigger of the delegation contract ("run each phase in a fresh build
# subagent").
#
# Size matters and was measured. An earlier version of this harness used two
# one-line edits and both arms scored zero: under maker the model said outright
# that the slices were "cambios triviales de una línea cada una, no requieren
# delegar a un subagente de build", and implemented them inline. That is
# reasonable behaviour, so the task had to change, not the rubric. Three phases
# across four files clear the threshold: measured 3 delegations to build and
# 265 s wall clock with --model sonnet.
# ---------------------------------------------------------------------------
make_workdir() {
  local dir
  dir=$(mktemp -d -p "$ROOT_TMP" work.XXXXXX)
  mkdir -p "$dir/.ai/tasks/2026-01-01-notas" "$dir/bin" "$dir/lib" "$dir/tests"

  cat > "$dir/lib/store.sh" <<'EOS'
#!/usr/bin/env bash
# Almacén de notas en un fichero de texto. Una nota por línea.
NOTES_FILE="${NOTES_FILE:-notas.txt}"
EOS

  cat > "$dir/bin/notes.sh" <<'EOS'
#!/usr/bin/env bash
# CLI de notas. Sin subcomandos todavía.
set -euo pipefail
echo "notes: sin implementar"
EOS

  cat > "$dir/README.md" <<'EOS'
# notas

Un CLI mínimo para apuntar notas.
EOS

  cat > "$dir/.ai/tasks/2026-01-01-notas/plan.md" <<'EOP'
# Plan — CLI de notas

Tres fases dependientes en orden. Cada una se commitea por separado.

## Fases

- [ ] 1. `lib/store.sh`: implementa `store_add <texto>` y `store_list`, que
      escriben y leen `$NOTES_FILE`. Crea el fichero si no existe. `store_add`
      debe rechazar texto vacío con código 1 y un mensaje en stderr.
- [ ] 2. `bin/notes.sh`: parseo de argumentos y subcomandos `add <texto>`,
      `list` y `help`. Carga `lib/store.sh`. Un subcomando desconocido sale con
      código 2 y muestra la ayuda.
- [ ] 3. `tests/run.sh`: script de pruebas que cubre las dos fases anteriores
      (alta, listado, texto vacío, subcomando desconocido) y devuelve código
      distinto de cero si algo falla. Actualiza `README.md` con el uso real.

## Verificación

`bash tests/run.sh` sale con código 0.
EOP

  if [ -n "$WITH_AGENTS" ]; then
    {
      echo "# Guía de agente"
      echo
      echo "Proyecto: un CLI de notas en bash."
      echo
      # Literal del AGENTS.md de este repo, para que no derive.
      awk '/^## Skill flow is the default/{f=1} f&&/^## /&&!/^## Skill flow is the default/{exit} f' \
        "$REPO_ROOT/AGENTS.md"
    } > "$dir/AGENTS.md"
    printf '@AGENTS.md\n' > "$dir/CLAUDE.md"
  fi

  git -C "$dir" init -q
  git -C "$dir" config user.email "test@example.com"
  git -C "$dir" config user.name "Test"
  git -C "$dir" add -A
  git -C "$dir" commit -q -m "estado inicial"
  printf '%s' "$dir"
}

PROMPT='Implementa el plan que hay en .ai/tasks/2026-01-01-notas/plan.md. Commitea cada fase por separado en la rama actual.'

# ---------------------------------------------------------------------------
# Run one arm. $1 = etiqueta, $2 = JSON de --settings, $3 = fichero de salida.
# El config dir del brazo llega en $3; sus transcripts los lee el llamador.
# ---------------------------------------------------------------------------
run_arm() {
  local label="$1" settings="$2" config="$3" out="$4" workdir rc
  workdir=$(make_workdir)
  set +e
  # --dangerously-skip-permissions evita los diálogos; --add-dir no es un
  # sandbox de SO. Se acepta porque el árbol es temporal y el prompt mínimo.
  echo "$PROMPT" | (cd "$workdir" && CLAUDE_CONFIG_DIR="$config" timeout "$TIMEOUT" claude -p \
    --model "$MODEL" \
    --output-format stream-json --verbose \
    --dangerously-skip-permissions \
    --settings "$settings" \
    --add-dir "$workdir") > "$out" 2>"$out.err"
  rc=$?
  set -e
  if [ "$rc" -eq 124 ]; then
    echo "  [$label] agotó el timeout de ${TIMEOUT}s"
  elif [ "$rc" -ne 0 ]; then
    echo "  [$label] claude terminó con código $rc"
    head -3 "$out.err" || true
  fi
  # El recuento sigue siendo válido aunque el brazo no termine: mide lo que
  # llegó a hacer, no si acabó la tarea.
  return 0
}

# ---------------------------------------------------------------------------
# Agent calls in one run's stream. The stream is used instead of the persisted
# transcript because it survives a run killed by the timeout.
# ---------------------------------------------------------------------------
count_agents() {
  node -e '
const fs = require("fs");
let n = 0, text;
try { text = fs.readFileSync(process.argv[1], "utf8"); } catch { console.log(0); process.exit(0); }
for (const line of text.split("\n")) {
  if (!line.startsWith("{")) continue;
  let rec; try { rec = JSON.parse(line); } catch { continue; }
  const content = rec?.message?.content;
  if (!Array.isArray(content)) continue;
  for (const b of content) if (b?.type === "tool_use" && b.name === "Agent") n++;
}
console.log(n);
' "$1"
}

# ---------------------------------------------------------------------------
# Skill calls across every stream file given as an argument. Includes the ones
# loaded inside subagents: the stream carries their events too.
# Prints "<n> <nombres>".
# ---------------------------------------------------------------------------
count_skills() {
  node -e '
const fs = require("fs");
const skills = [];
for (const file of process.argv.slice(1)) {
  let text; try { text = fs.readFileSync(file, "utf8"); } catch { continue; }
  for (const line of text.split("\n")) {
    if (!line.startsWith("{")) continue;
    let rec; try { rec = JSON.parse(line); } catch { continue; }
    const content = rec?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b?.type === "tool_use" && b.name === "Skill" && b.input?.skill) skills.push(b.input.skill);
    }
  }
}
console.log(`${skills.length} ${[...new Set(skills)].join(",") || "-"}`);
' "$@"
}

# ---------------------------------------------------------------------------
# Run one arm RUNS times against a single config dir, so its transcripts
# aggregate. Prints one line per run and sets ARM_TOTAL / ARM_RUNS_DELEGATING.
# $1 = etiqueta, $2 = JSON de --settings, $3 = config dir del brazo.
# ---------------------------------------------------------------------------
score_arm() {
  local label="$1" settings="$2" config="$3" i out n
  ARM_TOTAL=0
  ARM_RUNS_DELEGATING=0
  for i in $(seq 1 "$RUNS"); do
    out="$ROOT_TMP/stream-$label-$i.jsonl"
    echo "  run $i/$RUNS: ejecutando claude -p..."
    run_arm "$label" "$settings" "$config" "$out"
    n=$(count_agents "$out")
    ARM_TOTAL=$((ARM_TOTAL + n))
    # `if` explícito, no `[ ... ] && x=1`: bajo `set -e` una lista AND que
    # termina en falso puede abortar el script.
    if [ "$n" -ge 1 ]; then ARM_RUNS_DELEGATING=$((ARM_RUNS_DELEGATING + 1)); fi
    echo "  run $i/$RUNS: $n delegaciones"
  done
}

# ===========================================================================
C_AGENTS=0; C_RUNS=0; C_SKILLS=0; C_NAMES="-"
if [ "$ARMS" != "maker" ]; then
  section "Brazo CONTROL (estilo por defecto)"
  CONFIG_CONTROL=$(make_config_dir)
  score_arm control '{}' "$CONFIG_CONTROL"
  C_AGENTS=$ARM_TOTAL; C_RUNS=$ARM_RUNS_DELEGATING
  read -r C_SKILLS C_NAMES <<< "$(count_skills "$ROOT_TMP"/stream-control-*.jsonl)"
  echo "  total: $C_AGENTS delegaciones en $C_RUNS/$RUNS runs · $C_SKILLS skills ($C_NAMES)"
fi

M_AGENTS=0; M_RUNS=0; M_SKILLS=0; M_NAMES="-"
if [ "$ARMS" != "control" ]; then
  section "Brazo TRATAMIENTO (persona maker)"
  CONFIG_MAKER=$(make_config_dir)
  score_arm maker '{"outputStyle":"maker"}' "$CONFIG_MAKER"
  M_AGENTS=$ARM_TOTAL; M_RUNS=$ARM_RUNS_DELEGATING
  read -r M_SKILLS M_NAMES <<< "$(count_skills "$ROOT_TMP"/stream-maker-*.jsonl)"
  echo "  total: $M_AGENTS delegaciones en $M_RUNS/$RUNS runs · $M_SKILLS skills ($M_NAMES)"
fi

# ===========================================================================
section "Rúbrica"

if [ "$ARMS" = "control" ]; then
  :
elif [ "$M_RUNS" -gt $((RUNS / 2)) ]; then
  pass "el tratamiento delega en la mayoría de sus runs ($M_RUNS/$RUNS)"
else
  fail "el tratamiento delegó solo en $M_RUNS/$RUNS runs"
fi

if [ "$ARMS" = "both" ]; then
  if [ "$M_AGENTS" -gt "$C_AGENTS" ]; then
    pass "la persona discrimina en delegación (tratamiento $M_AGENTS > control $C_AGENTS)"
  else
    fail "la persona no discrimina: tratamiento $M_AGENTS, control $C_AGENTS"
  fi
fi

# Medición, no puerta: ver la cabecera. Un cero aquí es señal, no fallo.
if [ "$M_SKILLS" -ge 1 ]; then
  echo "INFO: el tratamiento carga skills ($M_SKILLS llamadas: $M_NAMES)"
else
  warn "el tratamiento no cargó ninguna skill en $RUNS runs"
fi

# Detalle de la autocomprobación de build, con la misma medición que usa
# `make maker-flow-stats` sobre el histórico real.
if [ "$ARMS" != "control" ]; then
  section "Autocomprobación de build (tratamiento)"
  node "$SCRIPT_DIR/maker-flow-stats.mjs" --dir "$CONFIG_MAKER/projects" | tail -n +2
fi

section "Resumen"
echo "  control:     $C_AGENTS delegaciones en $C_RUNS/$RUNS runs, $C_SKILLS skills"
echo "  tratamiento: $M_AGENTS delegaciones en $M_RUNS/$RUNS runs, $M_SKILLS skills"
echo "  PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]

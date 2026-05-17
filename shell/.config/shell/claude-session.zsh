# ═══════════════════════════════════════════════
# ➤ CLAUDE CODE — SESSION ISOLATION (opt-in)
# ═══════════════════════════════════════════════
# Por defecto `claude` se ejecuta tal cual.
# Con `claude --isolate ...` (y dentro de un repo git) el wrapper crea un
# worktree efímero en <repo>-session-<id>/ con rama local `session/<id>`
# (nunca push). Al salir, si está limpio se borra; si tiene trabajo, lo
# conserva.
#
# Si el repo tiene `.claude-session-init.sh` ejecutable en la raíz, se
# ejecuta tras crear el worktree (hook por repo: agora ids, docker-compose,
# direnv, etc.). El flag `--isolate` se consume y no se reenvía al binario.
# Compatible con bash y zsh.
#
# Cada sesión registra un lockfile en
#   ${XDG_RUNTIME_DIR:-$HOME/.cache}/dotmesh/sessions/<session_id>.lock
# con PID+START_TIME de la shell wrapper. Permite a `claude-sessions` y
# `claude-session-cleanup` distinguir sesiones vivas de huérfanas y evitar
# borrar worktrees en uso por otras sesiones concurrentes.

# Devuelve el campo 22 (starttime, jiffies desde boot) de /proc/$1/stat.
# Maneja comm con espacios/paréntesis stripeando hasta el último ") ".
function __claude_proc_start_time() {
    local pid=$1 rest
    [[ -r "/proc/$pid/stat" ]] || return 1
    rest=$(< "/proc/$pid/stat")
    rest=${rest##*\) }
    # Tras el strip, el campo 22 original es el 20 (-2 por pid y comm).
    echo "$rest" | awk '{print $20}'
}

# True si el lockfile referencia un proceso vivo cuyo START_TIME coincide
# con /proc/PID/stat actual (defensa contra reciclado de PID).
function __claude_lock_alive() {
    local lockfile=$1 pid start_time current
    [[ -r "$lockfile" ]] || return 1
    pid=$(awk -F= '/^PID=/ {print $2; exit}' "$lockfile")
    start_time=$(awk -F= '/^START_TIME=/ {print $2; exit}' "$lockfile")
    [[ -n "$pid" && -n "$start_time" ]] || return 1
    kill -0 "$pid" 2>/dev/null || return 1
    current=$(__claude_proc_start_time "$pid") || return 1
    [[ "$current" == "$start_time" ]]
}

# Lista comandos (excluyendo lsof) con ficheros abiertos dentro del worktree.
# Sin lsof devuelve vacío silenciosamente (sin lsof no hay cinturón secundario).
function __claude_worktree_guests() {
    local worktree=$1
    command -v lsof > /dev/null 2>&1 || return 0
    lsof +D "$worktree" 2>/dev/null \
        | awk 'NR>1 && $1 != "lsof" {printf "%s (PID %s)\n", $1, $2}' \
        | sort -u
}

function __claude_lockdir() {
    echo "${XDG_RUNTIME_DIR:-$HOME/.cache}/dotmesh/sessions"
}

function claude() {
    if ! type -P claude > /dev/null 2>&1; then
        echo "❌ claude binary not found in PATH" >&2
        return 127
    fi

    local isolate=0
    local -a args
    args=()
    local arg
    for arg in "$@"; do
        if [[ "$arg" == "--isolate" ]]; then
            isolate=1
        else
            args+=("$arg")
        fi
    done

    if (( ! isolate )); then
        command claude "${args[@]}"
        return $?
    fi

    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        echo "⚠️  --isolate ignorado: no estás en un repo git" >&2
        command claude "${args[@]}"
        return $?
    fi

    local repo_root repo_name session_id worktree_path branch base_sha origin_cwd rc
    local lockdir lockfile shell_pid shell_start
    repo_root=$(git rev-parse --show-toplevel)
    repo_name=$(basename "$repo_root")
    session_id="$(date +%Y%m%d-%H%M%S)-$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c4)"
    worktree_path="${repo_root%/}-session-${session_id}"
    branch="session/${session_id}"
    origin_cwd=$PWD
    lockdir=$(__claude_lockdir)
    lockfile="${lockdir}/${session_id}.lock"

    echo "🌿 Claude session ${session_id} → ${worktree_path} (rama local ${branch})"
    if ! git -C "$repo_root" worktree add -b "$branch" "$worktree_path" HEAD > /dev/null; then
        echo "❌ git worktree add failed; lanzando claude sin aislamiento" >&2
        command claude "${args[@]}"
        return $?
    fi
    base_sha=$(git -C "$worktree_path" rev-parse HEAD)

    shell_pid=$$
    shell_start=$(__claude_proc_start_time "$shell_pid")
    mkdir -p "$lockdir"
    cat > "$lockfile" <<LOCKEOF
PID=${shell_pid}
START_TIME=${shell_start}
WORKTREE=${worktree_path}
BRANCH=${branch}
SESSION_ID=${session_id}
LOCKEOF
    # Red de seguridad: si la shell recibe TERM/HUP/INT antes de llegar al
    # bloque de cleanup, al menos el lockfile no queda colgando.
    trap "rm -f '${lockfile}'" INT TERM HUP

    git -C "$worktree_path" fetch --quiet origin 2>/dev/null || true

    # Buscar el hook en el repo origen para que también dispare cuando el
    # script está sin trackear (.git/info/exclude o .gitignore): los
    # ficheros untracked no se propagan a un nuevo worktree.
    local init_hook=""
    if [[ -x "${worktree_path}/.claude-session-init.sh" ]]; then
        init_hook="${worktree_path}/.claude-session-init.sh"
    elif [[ -x "${repo_root}/.claude-session-init.sh" ]]; then
        init_hook="${repo_root}/.claude-session-init.sh"
    fi
    if [[ -n "$init_hook" ]]; then
        ( cd "$worktree_path" && "$init_hook" ) || \
            echo "⚠️  .claude-session-init.sh devolvió error; continúo" >&2
    fi

    ( cd "$worktree_path" && command claude "${args[@]}" )
    rc=$?

    cd "$origin_cwd" 2>/dev/null || cd "$repo_root" || cd "$HOME"

    # El wrapper es dueño del lock: lo retira antes de evaluar limpieza.
    rm -f "$lockfile"
    trap - INT TERM HUP

    local head_sha dirty guests
    head_sha=$(git -C "$worktree_path" rev-parse HEAD 2>/dev/null)
    dirty=$(git -C "$worktree_path" status --porcelain 2>/dev/null)
    guests=$(__claude_worktree_guests "$worktree_path")
    if [[ "$head_sha" == "$base_sha" && -z "$dirty" && -z "$guests" ]]; then
        git -C "$repo_root" worktree remove --force "$worktree_path" > /dev/null 2>&1
        git -C "$repo_root" branch -D "$branch" > /dev/null 2>&1
        echo "🧹 Sesión ${session_id} sin cambios → worktree y rama eliminados"
    elif [[ -n "$guests" ]]; then
        echo "📌 Sesión ${session_id} conservada — procesos invitados en el worktree:"
        echo "$guests" | sed 's/^/   /'
        echo "   Ruta: ${worktree_path}"
        echo "   Limpieza manual cuando termine: claude-session-cleanup ${session_id}"
    else
        echo "📌 Sesión ${session_id} conserva trabajo en: ${worktree_path}"
        echo "   Rama local: ${branch}. Renómbrala a <prefix>/<task> antes de pushear."
        echo "   Limpieza manual: claude-session-cleanup ${session_id}"
    fi

    return $rc
}

function claude-sessions() {
    local lockdir line worktree session_id lockfile status pid
    lockdir=$(__claude_lockdir)
    git worktree list 2>/dev/null | awk '/-session-/ {print}' | while IFS= read -r line; do
        worktree=$(echo "$line" | awk '{print $1}')
        session_id=${worktree##*-session-}
        lockfile="${lockdir}/${session_id}.lock"
        if [[ ! -e "$lockfile" ]]; then
            status="unlocked"
        elif __claude_lock_alive "$lockfile"; then
            pid=$(awk -F= '/^PID=/ {print $2; exit}' "$lockfile")
            status="active (PID ${pid})"
        else
            status="stale lock"
        fi
        printf "%s  [%s]\n" "$line" "$status"
    done
}

function claude-session-cleanup() {
    local force=0 id=""
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--force) force=1; shift;;
            -h|--help)
                echo "Usage: claude-session-cleanup [--force] <session-id>"
                return 0;;
            *) id=$1; shift;;
        esac
    done
    if [[ -z "$id" ]]; then
        echo "Usage: claude-session-cleanup [--force] <session-id>"
        return 1
    fi
    local repo_root worktree_path branch lockdir lockfile guests pid_v wt_v
    repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
        echo "❌ No estás en un repo git" >&2
        return 1
    }
    branch="session/${id}"
    worktree_path=$(git -C "$repo_root" worktree list | awk -v id="-session-${id}" '$1 ~ id {print $1; exit}')
    if [[ -z "$worktree_path" ]]; then
        echo "❌ No encuentro worktree para sesión ${id}" >&2
        return 1
    fi
    lockdir=$(__claude_lockdir)
    lockfile="${lockdir}/${id}.lock"

    if [[ $force -eq 0 ]]; then
        if [[ -e "$lockfile" ]] && __claude_lock_alive "$lockfile"; then
            pid_v=$(awk -F= '/^PID=/ {print $2; exit}' "$lockfile")
            wt_v=$(awk -F= '/^WORKTREE=/ {print $2; exit}' "$lockfile")
            echo "❌ Sesión ${id} en uso por PID ${pid_v} (${wt_v})" >&2
            echo "   Usa --force si estás seguro de que quieres tirarla." >&2
            return 1
        fi
        guests=$(__claude_worktree_guests "$worktree_path")
        if [[ -n "$guests" ]]; then
            echo "❌ Procesos con ficheros abiertos en ${worktree_path}:" >&2
            echo "$guests" | sed 's/^/   /' >&2
            echo "   Usa --force si vas a matarlos manualmente." >&2
            return 1
        fi
    fi

    git -C "$repo_root" worktree remove --force "$worktree_path" && \
        git -C "$repo_root" branch -D "$branch" && \
        rm -f "$lockfile" && \
        echo "🧹 Sesión ${id} eliminada"
}

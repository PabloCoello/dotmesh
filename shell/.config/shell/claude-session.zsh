# ═══════════════════════════════════════════════
# ➤ CLAUDE CODE — SESSION ISOLATION (opt-in)
# ═══════════════════════════════════════════════
# Por defecto `claude` se ejecuta tal cual.
# Con `claude --isolate ...` (y dentro de un repo git) el wrapper crea un
# worktree efímero en <repo>-session-<id>/ con rama local `session/<id>`
# (nunca push). Al salir, si está limpio se borra; si tiene trabajo, lo
# conserva.
#
# Con `claude --style <persona>` (p. ej. maker, scribe) la instancia arranca
# con ese output style vía `--settings '{"outputStyle":…}'`, sin persistir
# nada: el settings.json compartido no se toca y las demás instancias no se
# ven afectadas. Combinable con --isolate.
#
# Si el repo tiene `.claude-session-init.sh` ejecutable en la raíz, se
# ejecuta tras crear el worktree (hook por repo: agora ids, docker-compose,
# direnv, etc.). Los flags `--isolate` y `--style` se consumen y no se
# reenvían al binario. Compatible con bash y zsh.
#
# Cada sesión registra un lockfile en
#   ${XDG_RUNTIME_DIR:-$HOME/.cache}/dotmesh/sessions/<session_id>.lock
# con PID+START_TIME de la shell wrapper. Permite a `claude-sessions` y
# `claude-session-cleanup` distinguir sesiones vivas de huérfanas y evitar
# borrar worktrees en uso por otras sesiones concurrentes.

# Devuelve un token opaco de tiempo de inicio del proceso $1.
# Linux: campo 22 de /proc/$pid/stat (jiffies desde boot).
# macOS/otros sin /proc: lstart de ps (cadena de fecha normalizada).
function __claude_proc_start_time() {
    local pid=$1 rest
    if [[ -r "/proc/$pid/stat" ]]; then
        rest=$(< "/proc/$pid/stat")
        rest=${rest##*\) }
        # Tras el strip, el campo 22 original es el 20 (-2 por pid y comm).
        echo "$rest" | awk '{print $20}'
    else
        # Fallback para macOS y sistemas sin /proc; tr -s normaliza espacios
        ps -o lstart= -p "$pid" 2>/dev/null | tr -s ' '
    fi
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

# Ruta del almacén de hashes aprobados para init-scripts.
# Formato de cada línea: sha256<TAB>ruta_absoluta_del_script
function __claude_isolate_store() {
    echo "${XDG_STATE_HOME:-$HOME/.local/state}/dotmesh/claude-isolate-approved"
}

# Comprueba si un init-script está aprobado (gating tipo direnv).
# Retorna:  0 → aprobado (ejecutar)
#           2 → rechazado o sin TTY (saltar, no abortar)
#           1 → error de hash (saltar)
function __claude_isolate_check_trust() {
    local script=$1 hash saved_hash store store_dir tmp

    # sha256sum (Linux) o shasum (macOS)
    if command -v sha256sum > /dev/null 2>&1; then
        hash=$(sha256sum "$script" 2>/dev/null | awk '{print $1}')
    elif command -v shasum > /dev/null 2>&1; then
        hash=$(shasum -a 256 "$script" 2>/dev/null | awk '{print $1}')
    else
        echo "⚠️  sin sha256sum/shasum; .claude-session-init.sh no ejecutado" >&2
        return 2
    fi
    [[ -z "$hash" ]] && return 1

    store=$(__claude_isolate_store)
    store_dir=$(dirname "$store")

    # Comprobar si el hash ya está aprobado para esta ruta exacta.
    # Solo confiar en el store si es un fichero regular (no symlink) con permisos
    # 600; así un store pre-plantado (symlink a fichero ajeno o world-writable) no
    # salta el prompt de confirmación.
    if [[ -f "$store" && ! -L "$store" ]]; then
        local store_perms
        store_perms=$(stat -c %a "$store" 2>/dev/null || stat -f %Lp "$store" 2>/dev/null)
        if [[ "$store_perms" == "600" ]]; then
            saved_hash=$(awk -F'\t' -v p="$script" '$2==p{print $1;exit}' "$store")
            [[ "$saved_hash" == "$hash" ]] && return 0
        else
            echo "⚠️  store de aprobaciones con permisos inseguros (${store_perms}); ignorando" >&2
        fi
    fi

    # Sin TTY: fail-safe, no ejecutar
    if [[ ! -t 0 ]] || [[ ! -t 1 ]]; then
        echo "⚠️  .claude-session-init.sh en ${script} no ejecutado (sin TTY; fail-safe)" >&2
        return 2
    fi

    # Con TTY: mostrar contexto y pedir confirmación explícita
    if [[ -n "$saved_hash" ]]; then
        echo "⚠️  El script de inicialización ha cambiado (hash distinto al aprobado):" >&2
    else
        echo "⚠️  Script de inicialización no aprobado:" >&2
    fi
    echo "   ${script}" >&2
    echo "─── preview (primeras 20 líneas) ─────────" >&2
    head -20 "$script" >&2
    echo "──────────────────────────────────────────" >&2
    printf "¿Ejecutar este script? [y/N] " >&2
    local answer
    read -r answer

    if [[ "$answer" == "y" || "$answer" == "Y" ]]; then
        # Guardar aprobación de forma atómica: tmp → rename
        mkdir -p "$store_dir" && chmod 700 "$store_dir"
        tmp=$(mktemp "${store_dir}/.approved.XXXXXX")
        [[ -f "$store" ]] && awk -F'\t' -v p="$script" '$2!=p' "$store" > "$tmp"
        printf '%s\t%s\n' "$hash" "$script" >> "$tmp"
        mv "$tmp" "$store"
        chmod 600 "$store"
        return 0
    else
        echo "⚠️  .claude-session-init.sh no ejecutado (rechazado)" >&2
        return 2
    fi
}

function claude() {
    # type -P es bashismo; en zsh se usa whence -p
    local _claude_bin
    if [[ -n "$ZSH_VERSION" ]]; then
        _claude_bin=$(whence -p claude 2>/dev/null)
    else
        _claude_bin=$(type -P claude 2>/dev/null)
    fi
    if [[ -z "$_claude_bin" ]]; then
        echo "❌ claude binary not found in PATH" >&2
        return 127
    fi

    local isolate=0 style="" expect_style=0
    local -a args
    args=()
    local arg
    for arg in "$@"; do
        if (( expect_style )); then
            style=$arg
            expect_style=0
        elif [[ "$arg" == "--isolate" ]]; then
            isolate=1
        elif [[ "$arg" == "--style" ]]; then
            expect_style=1
        elif [[ "$arg" == --style=* ]]; then
            style=${arg#--style=}
        else
            args+=("$arg")
        fi
    done
    if (( expect_style )); then
        echo "⚠️  --style requiere un valor (p. ej. --style scribe)" >&2
        return 2
    fi
    # Un --settings explícito del usuario tras el inyectado gana. El nombre se
    # restringe a slug para no construir JSON malformado; que la persona exista
    # no se valida: claude avisa si el output style no existe.
    if [[ -n "$style" ]]; then
        if [[ "$style" == *[^a-zA-Z0-9._-]* ]]; then
            echo "⚠️  --style: nombre inválido '${style}' (solo [a-zA-Z0-9._-])" >&2
            return 2
        fi
        args=(--settings "{\"outputStyle\":\"${style}\"}" "${args[@]}")
    fi

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
BASE_SHA=${base_sha}
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
        if __claude_isolate_check_trust "$init_hook"; then
            ( cd "$worktree_path" && "$init_hook" ) || \
                echo "⚠️  .claude-session-init.sh devolvió error; continúo" >&2
        fi
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
    local repo_root worktree_path branch lockdir lockfile guests pid_v wt_v base_sha_lock dirty unmerged mb
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
            wt_v=$(sed -n 's/^WORKTREE=//p' "$lockfile" | head -1)
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

        # Comprobar trabajo sin guardar antes de borrar. Nota: --porcelain respeta
        # .gitignore, así que ficheros ignorados (logs, artefactos, config local) NO
        # bloquean el borrado; el worktree es efímero por diseño. Usa --force para
        # saltar estas comprobaciones.
        dirty=$(git -C "$worktree_path" status --porcelain 2>/dev/null)
        base_sha_lock=""
        [[ -f "$lockfile" ]] && base_sha_lock=$(awk -F= '/^BASE_SHA=/ {print $2; exit}' "$lockfile")
        if [[ -n "$base_sha_lock" ]]; then
            unmerged=$(git -C "$repo_root" log --oneline "${base_sha_lock}..${branch}" 2>/dev/null | head -5)
        else
            mb=$(git -C "$repo_root" merge-base HEAD "$branch" 2>/dev/null)
            [[ -n "$mb" ]] && unmerged=$(git -C "$repo_root" log --oneline "${mb}..${branch}" 2>/dev/null | head -5)
        fi
        if [[ -n "$dirty" || -n "$unmerged" ]]; then
            echo "❌ Sesión ${id} tiene trabajo sin guardar:" >&2
            [[ -n "$dirty" ]] && echo "   Cambios sin commitear:" >&2 && \
                echo "$dirty" | head -5 | sed 's/^/     /' >&2
            [[ -n "$unmerged" ]] && echo "   Commits no fusionados en ${branch}:" >&2 && \
                echo "$unmerged" | sed 's/^/     /' >&2
            echo "   Usa --force para borrar igualmente." >&2
            return 1
        fi
    fi

    git -C "$repo_root" worktree remove --force "$worktree_path" && \
        git -C "$repo_root" branch -D "$branch" && \
        rm -f "$lockfile" && \
        echo "🧹 Sesión ${id} eliminada"
}

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
    repo_root=$(git rev-parse --show-toplevel)
    repo_name=$(basename "$repo_root")
    session_id="$(date +%Y%m%d-%H%M%S)-$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c4)"
    worktree_path="${repo_root%/}-session-${session_id}"
    branch="session/${session_id}"
    origin_cwd=$PWD

    echo "🌿 Claude session ${session_id} → ${worktree_path} (rama local ${branch})"
    if ! git -C "$repo_root" worktree add -b "$branch" "$worktree_path" HEAD > /dev/null; then
        echo "❌ git worktree add failed; lanzando claude sin aislamiento" >&2
        command claude "${args[@]}"
        return $?
    fi
    base_sha=$(git -C "$worktree_path" rev-parse HEAD)

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

    local head_sha dirty
    head_sha=$(git -C "$worktree_path" rev-parse HEAD 2>/dev/null)
    dirty=$(git -C "$worktree_path" status --porcelain 2>/dev/null)
    if [[ "$head_sha" == "$base_sha" && -z "$dirty" ]]; then
        git -C "$repo_root" worktree remove --force "$worktree_path" > /dev/null 2>&1
        git -C "$repo_root" branch -D "$branch" > /dev/null 2>&1
        echo "🧹 Sesión ${session_id} sin cambios → worktree y rama eliminados"
    else
        echo "📌 Sesión ${session_id} conserva trabajo en: ${worktree_path}"
        echo "   Rama local: ${branch}. Renómbrala a <prefix>/<task> antes de pushear."
        echo "   Limpieza manual: claude-session-cleanup ${session_id}"
    fi

    return $rc
}

function claude-sessions() {
    git worktree list 2>/dev/null | awk '/-session-/ {print $0}'
}

function claude-session-cleanup() {
    if [[ -z "$1" ]]; then
        echo "Usage: claude-session-cleanup <session-id>"
        return 1
    fi
    local repo_root worktree_path branch
    repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || {
        echo "❌ No estás en un repo git" >&2
        return 1
    }
    branch="session/$1"
    worktree_path=$(git -C "$repo_root" worktree list | awk -v id="-session-$1" '$1 ~ id {print $1; exit}')
    if [[ -z "$worktree_path" ]]; then
        echo "❌ No encuentro worktree para sesión ${1}" >&2
        return 1
    fi
    git -C "$repo_root" worktree remove --force "$worktree_path" && \
        git -C "$repo_root" branch -D "$branch" && \
        echo "🧹 Sesión ${1} eliminada"
}

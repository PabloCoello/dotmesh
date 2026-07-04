# ═══════════════════════════════════════════════
# ➤ CUSTOM FUNCTIONS
# ═══════════════════════════════════════════════

# ─────────────────────────────────────────────
# ➤ HISTORY CLEANING FUNCTIONS
# ─────────────────────────────────────────────
function clean_duplicates() {
    # Remove duplicate lines from history, keeping most recent
    awk '!seen[$0]++' ~/.zsh_history > ~/.zsh_history.tmp && mv ~/.zsh_history.tmp ~/.zsh_history
    echo "✅ Duplicados eliminados del historial"
}

function clean_old_history() {
    # Keep only last 5000 commands
    tail -n 5000 ~/.zsh_history > ~/.zsh_history.tmp && mv ~/.zsh_history.tmp ~/.zsh_history
    echo "✅ Historial recortado a los últimos 5000 comandos"
}

# ─────────────────────────────────────────────
# ➤ PYTHON WORKFLOWS
# ─────────────────────────────────────────────
function qpy() {
    # Open Python file in Neovim with REPL
    if [[ -z "$1" ]]; then
        echo "Usage: qpy <file.py>"
        return 1
    fi
    nvim "$1" -c "IronRepl python" -c "IronFocus"
}

function pyproject() {
    # Create new Python project with structure
    if [[ -z "$1" ]]; then
        echo "Usage: pyproject <project_name>"
        return 1
    fi
    mkdir -p "$1"/{src,tests,docs,data/{raw,processed}}
    touch "$1"/{README.md,requirements.txt,.gitignore}
    echo "✅ Proyecto Python '$1' creado"
    cd "$1"
}

# ─────────────────────────────────────────────
# ➤ R WORKFLOWS
# ─────────────────────────────────────────────
function qr() {
    # Open R file in Neovim with REPL
    if [[ -z "$1" ]]; then
        echo "Usage: qr <file.R>"
        return 1
    fi
    nvim "$1" -c "IronRepl R" -c "IronFocus"
}

# ─────────────────────────────────────────────
# ➤ QUARTO WORKFLOWS
# ─────────────────────────────────────────────
function qrender() {
    # Render Quarto document and open
    if [[ -z "$1" ]]; then
        echo "Usage: qrender <file.qmd>"
        return 1
    fi
    quarto render "$1" || return
    local html="${1%.qmd}.html"
    if command -v xdg-open &>/dev/null; then
        xdg-open "$html"
    elif command -v open &>/dev/null; then
        open "$html"
    fi
}

function qnew() {
    # Create new Quarto document from template
    local template="${1:-default}"
    local filename="${2:-document.qmd}"
    
    if [[ -f "$HOME/Documentos/GitHub/dotmesh/templates/quarto/${template}.qmd" ]]; then
        cp "$HOME/Documentos/GitHub/dotmesh/templates/quarto/${template}.qmd" "$filename"
        echo "✅ Documento Quarto creado: $filename"
        nvim "$filename"
    else
        echo "❌ Template no encontrado: $template"
        echo "Templates disponibles: default, report, presentation"
    fi
}

# ─────────────────────────────────────────────
# ➤ GIT WORKFLOWS
# ─────────────────────────────────────────────
function gclone() {
    # Clone repository and cd into it
    git clone "$1" && cd "$(basename "$1" .git)"
}

function gacp() {
    # Git add, commit, and push in one command
    git add .
    git commit -m "$1"
    git push
}

function gbranch() {
    # Create new branch and switch to it
    if [[ -z "$1" ]]; then
        echo "Usage: gbranch <branch_name>"
        return 1
    fi
    git checkout -b "$1"
}

# ─────────────────────────────────────────────
# ➤ DIRECTORY UTILITIES
# ─────────────────────────────────────────────
function mkcd() {
    # Create directory and cd into it
    mkdir -p "$1" && cd "$1"
}

function backup() {
    # Create backup of file or directory
    local timestamp=$(date +%Y%m%d_%H%M%S)
    cp -r "$1" "${1}_backup_${timestamp}"
    echo "✅ Backup creado: ${1}_backup_${timestamp}"
}

# ─────────────────────────────────────────────
# ➤ SEARCH UTILITIES
# ─────────────────────────────────────────────
function find_in_files() {
    # Search for pattern in files (uses ripgrep if available)
    if command -v rg &> /dev/null; then
        rg "$1"
    else
        grep -r "$1" .
    fi
}

function find_file() {
    # Find file by name (uses fd if available)
    if command -v fd &> /dev/null; then
        fd "$1"
    else
        find . -name "$1"
    fi
}

# ─────────────────────────────────────────────
# ➤ SYSTEM UTILITIES
# ─────────────────────────────────────────────
function extract() {
    # Extract various archive formats
    if [[ -f "$1" ]]; then
        case "$1" in
            *.tar.bz2)   tar xjf "$1"     ;;
            *.tar.gz)    tar xzf "$1"     ;;
            *.bz2)       bunzip2 "$1"     ;;
            *.rar)       unrar x "$1"     ;;
            *.gz)        gunzip "$1"      ;;
            *.tar)       tar xf "$1"      ;;
            *.tbz2)      tar xjf "$1"     ;;
            *.tgz)       tar xzf "$1"     ;;
            *.zip)       unzip "$1"       ;;
            *.Z)         uncompress "$1"  ;;
            *.7z)        7z x "$1"        ;;
            *)           echo "'$1' cannot be extracted via extract()" ;;
        esac
    else
        echo "'$1' is not a valid file"
    fi
}

function port_kill() {
    # Kill process running on specified port
    if [[ -z "$1" ]]; then
        echo "Usage: port_kill <port_number>"
        return 1
    fi
    lsof -ti:$1 | xargs -r kill -9
    echo "✅ Proceso en puerto $1 terminado"
}


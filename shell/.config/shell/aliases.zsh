# ═══════════════════════════════════════════════
# ➤ ALIASES
# ═══════════════════════════════════════════════

# ─────────────────────────────────────────────
# ➤ SYSTEM UTILITIES
# ─────────────────────────────────────────────
alias cls='clear'
alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'

# Use modern alternatives if available
if command -v eza &> /dev/null; then
  alias ls='eza --icons'
  alias ll='eza -alh --icons --git'
  alias la='eza -a --icons'
  alias tree='eza --tree --icons'
fi

if command -v bat &> /dev/null; then
  alias cat='bat --style=plain'
  alias less='bat --paging=always'
fi

# ─────────────────────────────────────────────
# ➤ GIT ALIASES
# ─────────────────────────────────────────────
alias gst='git status'
alias gco='git checkout'
alias gb='git branch'
alias gaa='git add .'
alias gcmsg='git commit -m'
alias gl='git log --oneline --graph --all --decorate'
alias gpl='git pull'
alias gps='git push'
alias grhh='git reset --hard HEAD'
alias gdiff='git diff'
alias gshow='git show'
alias gstash='git stash'
alias gpop='git stash pop'

# ─────────────────────────────────────────────
# ➤ DOCKER ALIASES
# ─────────────────────────────────────────────
alias dcu='docker compose up'
alias dcd='docker compose down'
alias dcb='docker compose build'
alias dps='docker ps'
alias dimg='docker images'
alias dex='docker exec -it'
alias dlogs='docker logs -f'

# ─────────────────────────────────────────────
# ➤ PYTHON ALIASES
# ─────────────────────────────────────────────
alias py='python3'
alias ipy='ipython'
alias pip='pip3'
alias venv='python3 -m venv'
alias activate='source venv/bin/activate'

# ─────────────────────────────────────────────
# ➤ R ALIASES
# ─────────────────────────────────────────────
if command -v radian &> /dev/null; then
  alias r='radian'
  alias R='radian'
fi

# ─────────────────────────────────────────────
# ➤ NEOVIM ALIASES
# ─────────────────────────────────────────────
alias v='nvim'
alias vim='nvim'
alias vi='nvim'

# ─────────────────────────────────────────────
# ➤ HISTORY MANAGEMENT
# ─────────────────────────────────────────────
alias histclean='clean_duplicates'
alias histold='clean_old_history'
alias histclear='> ~/.zsh_history && history -c && echo "🗑️  Historial completamente limpiado"'

# ─────────────────────────────────────────────
# ➤ DIRECTORY NAVIGATION
# ─────────────────────────────────────────────
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias .....='cd ../../../..'

# Quick access to important directories
alias dotfiles='cd ~/Documentos/GitHub/dotmesh'
alias projects='cd ~/Documentos/GitHub'
alias pandora='cd ~/Documentos/Pandora'

# ─────────────────────────────────────────────
# ➤ NETWORKING
# ─────────────────────────────────────────────
alias myip='curl ifconfig.me'
alias ports='lsof -iTCP -sTCP:LISTEN -n -P'
case "$(uname -s)" in
  Darwin) alias localip='ipconfig getifaddr en0' ;;
  Linux)  alias localip='hostname -I | awk '"'"'{print $1}'"'"'' ;;
esac

# ─────────────────────────────────────────────
# ➤ QUARTO ALIASES
# ─────────────────────────────────────────────
alias qp='quarto preview'
alias qq='quarto'

# ─────────────────────────────────────────────
# ➤ SYSTEM INFORMATION
# ─────────────────────────────────────────────
alias diskusage='du -sh * | sort -hr'
case "$(uname -s)" in
  Darwin)
    alias meminfo='top -l 1 -s 0 | grep PhysMem'
    alias cpuinfo='sysctl -n machdep.cpu.brand_string'
    ;;
  Linux)
    alias meminfo='free -h'
    alias cpuinfo='lscpu'
    ;;
esac


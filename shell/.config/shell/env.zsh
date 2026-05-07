# ═══════════════════════════════════════════════
# ➤ ENVIRONMENT VARIABLES
# ═══════════════════════════════════════════════

# ─────────────────────────────────────────────
# ➤ EDITOR CONFIGURATION
# ─────────────────────────────────────────────
export EDITOR="nvim"
export VISUAL="nvim"
export GIT_EDITOR="nvim"

# ─────────────────────────────────────────────
# ➤ HISTORY CONFIGURATION
# ─────────────────────────────────────────────
export HISTSIZE=10000
export SAVEHIST=10000
export HISTFILE=~/.zsh_history

# ─────────────────────────────────────────────
# ➤ SSH CONFIGURATION
# ─────────────────────────────────────────────
export SSH_PRIVATE_KEY="$(cat ~/.ssh/id_ed25519 2>/dev/null)"
export SSH_KNOWN_HOSTS="$(ssh-keyscan github.com 2>/dev/null)"

# ─────────────────────────────────────────────
# ➤ LANGUAGE & LOCALE
# ─────────────────────────────────────────────
export LANG="en_US.UTF-8"
export LC_ALL="en_US.UTF-8"

# ─────────────────────────────────────────────
# ➤ PAGER CONFIGURATION
# ─────────────────────────────────────────────
# Use bat as pager if available, otherwise less
if command -v bat &> /dev/null; then
  export PAGER="bat --style=plain --paging=always"
  export MANPAGER="bat --style=plain --paging=always"
else
  export PAGER="less"
  export MANPAGER="less"
fi

# ─────────────────────────────────────────────
# ➤ PYTHON CONFIGURATION
# ─────────────────────────────────────────────
export PYTHONIOENCODING="utf-8"
export PYTHONDONTWRITEBYTECODE=1

# ─────────────────────────────────────────────
# ➤ R CONFIGURATION
# ─────────────────────────────────────────────
export R_LIBS_USER="$HOME/Library/R/$(R --version | grep -oE '[0-9]+\\.[0-9]+' | head -1)/library"

# ─────────────────────────────────────────────
# ➤ QUARTO CONFIGURATION
# ─────────────────────────────────────────────
export QUARTO_PYTHON="python3"

# ─────────────────────────────────────────────
# ➤ HOMEBREW CONFIGURATION
# ─────────────────────────────────────────────
eval "$(/opt/homebrew/bin/brew shellenv)"

# ─────────────────────────────────────────────
# ➤ PYENV CONFIGURATION
# ─────────────────────────────────────────────
if command -v pyenv &> /dev/null; then
  eval "$(pyenv init --path)"
  eval "$(pyenv init -)"
fi

# ─────────────────────────────────────────────
# ➤ FZF CONFIGURATION
# ─────────────────────────────────────────────
# Pandora theme colors for fzf
export FZF_DEFAULT_OPTS="
  --color=fg:#D1D3D4,bg:#1A191E,hl:#4F80DD
  --color=fg+:#D1D3D4,bg+:#1A191E,hl+:#58B69D
  --color=info:#E5B15D,prompt:#E27056,pointer:#58B69D
  --color=marker:#58B69D,spinner:#E5B15D,header:#4F80DD
  --layout=reverse
  --border
  --height=40%
"

# Use fd for fzf if available
if command -v fd &> /dev/null; then
  export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
  export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
fi

# ─────────────────────────────────────────────
# ➤ SECRETS (untracked, lives outside the repo)
# ─────────────────────────────────────────────
# Tokens for MCPs and other services. Format: see docs/SECRETS.md.
[[ -f "$HOME/.zsh.secrets" ]] && source "$HOME/.zsh.secrets"


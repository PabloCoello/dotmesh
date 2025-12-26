# ═══════════════════════════════════════════════
# ➤ DOTFILES - ZSH CONFIGURATION
# ═══════════════════════════════════════════════
# Modular zsh configuration orchestrator
# Sources all modular configuration files

# ─────────────────────────────────────────────
# ➤ OH-MY-ZSH INITIALIZATION
# ─────────────────────────────────────────────
export ZSH="$HOME/.oh-my-zsh"

# Oh-My-Zsh plugins
plugins=(
  git
  docker
  pip
  python
  vscode
  zsh-autosuggestions
  zsh-syntax-highlighting
)

source $ZSH/oh-my-zsh.sh

# ─────────────────────────────────────────────
# ➤ LOAD MODULAR CONFIGURATIONS
# ─────────────────────────────────────────────
# Order matters: env → path → functions → aliases → ai

# Environment variables (editors, history, etc.)
[[ -f ~/.config/shell/env.zsh ]] && source ~/.config/shell/env.zsh

# PATH management
[[ -f ~/.config/shell/path.zsh ]] && source ~/.config/shell/path.zsh

# Custom functions
[[ -f ~/.config/shell/functions.zsh ]] && source ~/.config/shell/functions.zsh

# Aliases
[[ -f ~/.config/shell/aliases.zsh ]] && source ~/.config/shell/aliases.zsh

# AI/Ollama configurations
[[ -f ~/.config/shell/ai.zsh ]] && source ~/.config/shell/ai.zsh

# ─────────────────────────────────────────────
# ➤ STARSHIP PROMPT
# ─────────────────────────────────────────────
eval "$(starship init zsh)"

# ─────────────────────────────────────────────
# ➤ ZSH OPTIONS
# ─────────────────────────────────────────────
# Auto-correct mistyped commands
setopt CORRECT

# History configuration
setopt HIST_EXPIRE_DUPS_FIRST
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_FIND_NO_DUPS
setopt HIST_IGNORE_SPACE
setopt HIST_SAVE_NO_DUPS
setopt HIST_REDUCE_BLANKS
setopt HIST_VERIFY
setopt SHARE_HISTORY
setopt INC_APPEND_HISTORY

# Autocompletion
autoload -Uz compinit && compinit

# ─────────────────────────────────────────────
# ➤ ZSH-AUTOSUGGESTIONS CONFIGURATION
# ─────────────────────────────────────────────
# Solo completar basado en el autocompletado, sin sugerir historial previo
export ZSH_AUTOSUGGEST_STRATEGY=(completion)
export ZSH_AUTOSUGGEST_USE_ASYNC=true
export ZSH_AUTOSUGGEST_MANUAL_REBIND=true
export ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE=20
export ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=#D1D3D4,underline"

# ─────────────────────────────────────────────
# ➤ COMPLETION CONFIGURATION
# ─────────────────────────────────────────────
zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-zA-Z}={A-Za-z}'
zstyle ':completion:*' list-colors ${(s.:.)LS_COLORS}
zstyle ':completion:*:descriptions' format '%B%d%b'
zstyle ':completion:*:warnings' format 'No matches for: %d'
zstyle ':completion:*' group-name ''
zstyle ':completion:*' complete-options true
zstyle ':completion:*' file-sort modification

# ─────────────────────────────────────────────
# ➤ SYNTAX HIGHLIGHTING COLORS (Pandora Theme)
# ─────────────────────────────────────────────
# Colors: Black #1A191E, Red #E27056, Green #58B69D, 
#         Yellow #E5B15D, Blue #4F80DD, Gray #D1D3D4
typeset -A ZSH_HIGHLIGHT_STYLES
ZSH_HIGHLIGHT_STYLES[command]='fg=#4F80DD'
ZSH_HIGHLIGHT_STYLES[builtin]='fg=#4F80DD'
ZSH_HIGHLIGHT_STYLES[function]='fg=#58B69D'
ZSH_HIGHLIGHT_STYLES[alias]='fg=#E5B15D'
ZSH_HIGHLIGHT_STYLES[path]='fg=#D1D3D4'
ZSH_HIGHLIGHT_STYLES[globbing]='fg=#E27056'
ZSH_HIGHLIGHT_STYLES[history-expansion]='fg=#E27056'
ZSH_HIGHLIGHT_STYLES[single-quoted-argument]='fg=#58B69D'
ZSH_HIGHLIGHT_STYLES[double-quoted-argument]='fg=#58B69D'
ZSH_HIGHLIGHT_STYLES[dollar-quoted-argument]='fg=#58B69D'
ZSH_HIGHLIGHT_STYLES[arg0]='fg=#4F80DD'
ZSH_HIGHLIGHT_STYLES[unknown-token]='fg=#E27056'
ZSH_HIGHLIGHT_STYLES[reserved-word]='fg=#E5B15D'
ZSH_HIGHLIGHT_STYLES[suffix-alias]='fg=#E5B15D'
ZSH_HIGHLIGHT_STYLES[global-alias]='fg=#E5B15D'
ZSH_HIGHLIGHT_STYLES[precommand]='fg=#4F80DD'
ZSH_HIGHLIGHT_STYLES[commandseparator]='fg=#D1D3D4'
ZSH_HIGHLIGHT_STYLES[hashed-command]='fg=#58B69D'
ZSH_HIGHLIGHT_STYLES[autodirectory]='fg=#D1D3D4'
ZSH_HIGHLIGHT_STYLES[comment]='fg=#1A191E'

# ─────────────────────────────────────────────
# ➤ LS COLORS (Pandora Theme)
# ─────────────────────────────────────────────
export LSCOLORS="ExFxBxDxCxegedabagacad"
export LS_COLORS="di=1;34:ln=1;36:so=32:pi=33:ex=1;32:bd=34;46:cd=34;43:su=30;41:sg=30;46:tw=30;42:ow=30;43"

# ─────────────────────────────────────────────
# ➤ AWS CLI COMPLETION
# ─────────────────────────────────────────────
complete -C '/opt/homebrew/bin/aws_completer' aws

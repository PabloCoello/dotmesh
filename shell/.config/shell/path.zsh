# ═══════════════════════════════════════════════
# ➤ PATH MANAGEMENT
# ═══════════════════════════════════════════════
# Order matters: most specific paths first
# typeset -U path deduplica automáticamente (zsh).

typeset -U path

# ─────────────────────────────────────────────
# ➤ HOMEBREW (macOS)
# ─────────────────────────────────────────────
[ -d '/opt/homebrew/bin' ]  && path=('/opt/homebrew/bin'  $path)
[ -d '/opt/homebrew/sbin' ] && path=('/opt/homebrew/sbin' $path)

# ─────────────────────────────────────────────
# ➤ LOCAL BINARIES
# ─────────────────────────────────────────────
[ -d "$HOME/.local/bin" ] && path=("$HOME/.local/bin" $path)

# ─────────────────────────────────────────────
# ➤ PYENV
# ─────────────────────────────────────────────
export PYENV_ROOT="$HOME/.pyenv"
[ -d "$PYENV_ROOT/bin" ] && path=("$PYENV_ROOT/bin" $path)

# ─────────────────────────────────────────────
# ➤ NODE.JS / NPM
# ─────────────────────────────────────────────
[ -d "$HOME/.npm-global/bin" ] && path=("$HOME/.npm-global/bin" $path)

# ─────────────────────────────────────────────
# ➤ CARGO / RUST
# ─────────────────────────────────────────────
[ -d "$HOME/.cargo/bin" ] && path=("$HOME/.cargo/bin" $path)

# ─────────────────────────────────────────────
# ➤ GO
# ─────────────────────────────────────────────
export GOPATH="$HOME/go"
[ -d "$GOPATH/bin" ] && path=("$GOPATH/bin" $path)

# ─────────────────────────────────────────────
# ➤ VISUAL STUDIO CODE (macOS)
# ─────────────────────────────────────────────
_vscode_bin='/Applications/Visual Studio Code.app/Contents/Resources/app/bin'
[ -d "$_vscode_bin" ] && path=("$_vscode_bin" $path)
unset _vscode_bin

# ─────────────────────────────────────────────
# ➤ POSTGRESQL (Homebrew, macOS)
# ─────────────────────────────────────────────
[ -d '/opt/homebrew/opt/libpq/bin' ] && path=('/opt/homebrew/opt/libpq/bin' $path)

# ─────────────────────────────────────────────
# ➤ ANTIGRAVITY (macOS)
# ─────────────────────────────────────────────
[ -d "$HOME/.antigravity/antigravity/bin" ] && \
  path=("$HOME/.antigravity/antigravity/bin" $path)

# ─────────────────────────────────────────────
# ➤ QUARTO (macOS)
# ─────────────────────────────────────────────
[ -d '/Applications/quarto/bin' ] && path=('/Applications/quarto/bin' $path)

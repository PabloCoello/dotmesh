# ═══════════════════════════════════════════════
# ➤ PATH MANAGEMENT
# ═══════════════════════════════════════════════
# Order matters: most specific paths first

# ─────────────────────────────────────────────
# ➤ HOMEBREW
# ─────────────────────────────────────────────
export PATH="/opt/homebrew/bin:$PATH"
export PATH="/opt/homebrew/sbin:$PATH"

# ─────────────────────────────────────────────
# ➤ LOCAL BINARIES
# ─────────────────────────────────────────────
export PATH="$HOME/.local/bin:$PATH"

# ─────────────────────────────────────────────
# ➤ PYTHON TOOLS
# ─────────────────────────────────────────────
# pipx, poetry, etc.
export PATH="$HOME/.local/bin:$PATH"

# ─────────────────────────────────────────────
# ➤ PYENV
# ─────────────────────────────────────────────
export PYENV_ROOT="$HOME/.pyenv"
export PATH="$PYENV_ROOT/bin:$PATH"

# ─────────────────────────────────────────────
# ➤ NODE.JS / NPM
# ─────────────────────────────────────────────
export PATH="$HOME/.npm-global/bin:$PATH"

# ─────────────────────────────────────────────
# ➤ CARGO / RUST
# ─────────────────────────────────────────────
export PATH="$HOME/.cargo/bin:$PATH"

# ─────────────────────────────────────────────
# ➤ GO
# ─────────────────────────────────────────────
export GOPATH="$HOME/go"
export PATH="$GOPATH/bin:$PATH"

# ─────────────────────────────────────────────
# ➤ VISUAL STUDIO CODE
# ─────────────────────────────────────────────
export PATH="/Applications/Visual Studio Code.app/Contents/Resources/app/bin:$PATH"

# ─────────────────────────────────────────────
# ➤ POSTGRESQL (Homebrew)
# ─────────────────────────────────────────────
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"

# ─────────────────────────────────────────────
# ➤ ANTIGRAVITY
# ─────────────────────────────────────────────
export PATH="$HOME/.antigravity/antigravity/bin:$PATH"

# ─────────────────────────────────────────────
# ➤ QUARTO
# ─────────────────────────────────────────────
export PATH="/Applications/quarto/bin:$PATH"


# ═══════════════════════════════════════════════
# ➤ AI & OLLAMA CONFIGURATION
# ═══════════════════════════════════════════════

# ─────────────────────────────────────────────
# ➤ OLLAMA CONFIGURATION
# ─────────────────────────────────────────────
# RTX 3090 server configuration (override in env if needed)
export OLLAMA_HOST="${OLLAMA_HOST:-http://192.168.1.100:11434}"

# Primary models
export OLLAMA_MODEL_MAIN="${OLLAMA_MODEL_MAIN:-qwen2.5-coder:32b}"
export OLLAMA_MODEL_FAST="${OLLAMA_MODEL_FAST:-gpt-oss:20b}"
# Fallback for tools que esperan OLLAMA_MODEL
export OLLAMA_MODEL="${OLLAMA_MODEL:-$OLLAMA_MODEL_MAIN}"

# ─────────────────────────────────────────────
# ➤ OPENCODE CONFIGURATION
# ─────────────────────────────────────────────
# OpenCode context paths
export OPENCODE_CONTEXT_DOCS="$HOME/Documentos/Pandora"
export OPENCODE_CONTEXT_PROJECTS="$HOME/Documentos/GitHub"

# ─────────────────────────────────────────────
# ➤ OPENAI / CODEX CONFIGURATION
# ─────────────────────────────────────────────
export OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o-mini}"
# API key placeholder (sobrescribe en tu entorno seguro: 1Password, keychain, etc.)
# export OPENAI_API_KEY="${OPENAI_API_KEY:-changeme_openai_api_key}"

# ─────────────────────────────────────────────
# ➤ AI HELPER FUNCTIONS
# ─────────────────────────────────────────────
function ollama_status() {
    # Check Ollama server status
    if curl -s "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
        echo "✅ Ollama server online: $OLLAMA_HOST"
        echo "📦 Available models:"
        curl -s "$OLLAMA_HOST/api/tags" | jq -r '.models[].name'
    else
        echo "❌ Ollama server offline: $OLLAMA_HOST"
        echo "💡 Verifica que el servidor RTX 3090 esté encendido"
    fi
}

function ollama_chat() {
    # Quick chat with Ollama model
    local model="${1:-$OLLAMA_MODEL_MAIN}"
    shift
    local prompt="$*"

    if [[ -z "$prompt" ]]; then
        echo "Usage: ollama_chat [model] <prompt>"
        echo "Default model: $OLLAMA_MODEL_MAIN"
        return 1
    fi

    local body
    body=$(jq -n --arg model "$model" --arg prompt "$prompt" \
        '{"model": $model, "prompt": $prompt, "stream": false}')

    curl -s "$OLLAMA_HOST/api/generate" \
        -H 'Content-Type: application/json' \
        -d "$body" \
        | jq -r '.response'
}

function ollama_pull() {
    # Pull/download Ollama model
    if [[ -z "$1" ]]; then
        echo "Usage: ollama_pull <model_name>"
        return 1
    fi

    curl -s "$OLLAMA_HOST/api/pull" \
        -d "{\"name\": \"$1\"}"
}

function code_review() {
    # AI-powered code review using Ollama
    if [[ -z "$1" ]]; then
        echo "Usage: code_review <file>"
        return 1
    fi

    local code=$(cat "$1")
    local prompt="Review this code for best practices, potential bugs, and improvements:\\n\\n$code"

    ollama_chat "$OLLAMA_MODEL_MAIN" "$prompt"
}

function explain_code() {
    # Explain code using AI
    if [[ -z "$1" ]]; then
        echo "Usage: explain_code <file>"
        return 1
    fi

    local code=$(cat "$1")
    local prompt="Explain what this code does in simple terms:\\n\\n$code"

    ollama_chat "$OLLAMA_MODEL_FAST" "$prompt"
}

# ─────────────────────────────────────────────
# ➤ AI ALIASES
# ─────────────────────────────────────────────
alias ai='ollama_chat'
alias aistatus='ollama_status'
alias aimodels='curl -s $OLLAMA_HOST/api/tags | jq -r ".models[].name"'
alias codereview='code_review'
alias explaincode='explain_code'

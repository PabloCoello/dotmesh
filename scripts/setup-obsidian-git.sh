#!/usr/bin/env bash
# Configuración rápida para Obsidian Git en el vault.
# Ajusta user/email locales y crea un .gitignore básico si no existe.
#
# Uso:
#   scripts/setup-obsidian-git.sh [vault_path]
# Por defecto: ${OBSIDIAN_VAULT:-$HOME/Documents/Pandora}

set -euo pipefail

VAULT_PATH="${1:-${OBSIDIAN_VAULT:-$HOME/Documents/Pandora}}"

if [ ! -d "$VAULT_PATH" ]; then
  echo "Vault path not found: $VAULT_PATH" >&2
  exit 1
fi

cd "$VAULT_PATH"

if [ ! -d ".git" ]; then
  git init
  echo "Initialized git repo in $VAULT_PATH"
fi

# Opcional: usar user/email locales para no contaminar global
git config user.name "${GIT_AUTHOR_NAME:-Obsidian Sync}"
git config user.email "${GIT_AUTHOR_EMAIL:-obsidian@example.com}"

# .gitignore básico
if [ ! -f ".gitignore" ]; then
  cat > .gitignore <<'EOF'
.obsidian/workspace
.obsidian/plugins/obsidian-git/data.json
.DS_Store
EOF
  echo "Created .gitignore"
fi

echo "Obsidian Git setup done. Configure the Obsidian Git plugin with:"
echo "- Auto-commit message (usa tus tags si aplica)."
echo "- Rutas: repo root = $VAULT_PATH"
echo "- Opcional: intervalos de auto-commit/push."

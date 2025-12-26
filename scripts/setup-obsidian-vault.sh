#!/usr/bin/env bash
# Bootstrap the Obsidian vault structure for the Pandora workspace.
#
# Usage:
#   scripts/setup-obsidian-vault.sh [vault_path]
# Default vault_path: ~/Documents/Pandora

set -euo pipefail

VAULT_PATH="${1:-${OBSIDIAN_VAULT:-$HOME/Documents/Pandora}}"

echo "Creating vault at: $VAULT_PATH"
mkdir -p "$VAULT_PATH"/{Inbox,Daily,Templates,Projects,Areas,Resources,Archive,Assets/Images}

echo "Copying base templates..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cp -n "$REPO_ROOT"/obsidian/Templates/*.md "$VAULT_PATH/Templates/" 2>/dev/null || true

cat <<'EOF'
Done.
- Open Obsidian and add the vault path above.
- In Neovim, ensure OBSIDIAN_VAULT is set if you chose a custom path.
EOF

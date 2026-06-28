#!/usr/bin/env bash
# dotmesh command guardrail — Claude Code PreToolUse hook (matcher "Bash").
# Blocks irreversible commands before they run, even under bypassPermissions,
# enforcing at the harness level what AGENTS.md / /super-git forbid by policy.
# Three families:
#   1. Destructive git ops (force-push incl. by refspec, reset --hard, clean -f,
#      branch -D, checkout/restore the tree). Plain `git push` is allowed;
#      /super-git pushes feature branches (never --force, never the default
#      branch). Aliases from git/.gitconfig (co/discard/ps/psu) are normalised.
#   2. A minimal net of catastrophic NON-git commands (rm -rf of / ~ $HOME,
#      dd to a block device, mkfs, redirect to a raw disk). Deliberately small
#      and conservative; the broad net lives in the external approver hook.
#   3. LLM attribution trailers in `git commit` (Co-authored-by: <model>,
#      Claude-Session, "generated with/by <model>"), which the harness injects
#      against the no-LLM-authorship policy in AGENTS.md.
#
# It fires only when the command actually INVOKES the op, not when a string
# merely mentions it: quoted substrings are stripped and commands split on
# separators before scanning (families 1 and 2). This is a safety net, not an
# adversarial sandbox — exotic obfuscation (quoted targets, split flags) can
# slip through; the user can always run the command themselves.
#
# NOTE: the filename stays block-dangerous-git.sh because settings.json
# references it by that path; the scope is broader than the name suggests.
# Stowed by claude/ to ~/.claude/hooks/. Exit 2 + stderr message blocks.
set -euo pipefail

# Without jq we cannot parse the tool input; fail open rather than break Bash.
command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

block() {  # $1 = reason
  printf 'BLOCKED: %s. dotmesh guardrail: not permitted. If you genuinely need it, run it yourself.\n' "$1" >&2
  exit 2
}

# Drop quoted substrings (single then double) so mentions inside strings don't
# trip the scanners, then normalise command separators (; && || | & ( ) { }) to
# newlines so each line is one command and patterns can't span two commands.
scan=$(printf '%s' "$cmd" \
  | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g" \
  | sed -E 's/(\|\||&&|[;|&(){}])/\n/g')

# --- 2) Minimal net of catastrophic non-git commands (on the stripped scan) ---
# Conservative and anchored to the command: only the inequivocally system-
# irreversible. Quoted targets and split flags are left to the external
# approver / explicit user confirmation.
if printf '%s' "$scan" | grep -qE '(^|[[:space:];&|(/])rm[[:space:]]+(-[A-Za-z]+[[:space:]]+)*-[A-Za-z]*([rR]f|f[rR])[A-Za-z]*[[:space:]]+(-[A-Za-z]+[[:space:]]+)*(/\*|~/\*|\$\{?HOME\}?/\*|/|~/|~|\$\{?HOME\}?/|\$\{?HOME\}?)([[:space:]]|$)'; then
  block "rm recursivo/forzado sobre /, /*, ~ o \$HOME (raíz)"
fi
if printf '%s' "$scan" | grep -qE 'rm[[:space:]].*--no-preserve-root'; then
  block "rm --no-preserve-root"
fi
if printf '%s' "$scan" | grep -qE '(^|[[:space:];&|(/])dd[[:space:]].*[[:space:]]of=/dev/(sd|nvme|vd|hd|mmcblk|disk)'; then
  block "dd escribiendo a un dispositivo de bloque"
fi
if printf '%s' "$scan" | grep -qE '(^|[[:space:];&|(/])mkfs(\.[a-z0-9]+)?[[:space:]]'; then
  block "mkfs (formateo de sistema de ficheros)"
fi
if printf '%s' "$scan" | grep -qE '>[[:space:]]*/dev/(sd|nvme|vd|hd|mmcblk|disk)'; then
  block "redirección a un dispositivo de bloque"
fi

# --- 3) LLM attribution trailers in git commit (on the raw cmd) --------------
# Scanned raw because the trailer lives inside the quoted -m body; gated on the
# command actually being a `git commit` so plain echoes don't trip it.
if printf '%s' "$cmd" | grep -qE '\bgit[[:space:]]+([^[:space:]]+[[:space:]]+)*commit\b' \
   && printf '%s' "$cmd" | grep -qiE 'co-authored-by:[[:space:]]*(claude|codex|openai|chatgpt|copilot|opencode|gpt|gemini|anthropic|llm)|claude-session:|generated[[:space:]]+(with|by)[[:space:]]+(claude|chatgpt|codex|copilot|ai|an?[[:space:]]*llm)|authored[[:space:]]+by[[:space:]]+(ai|an?[[:space:]]*llm)'; then
  block "el mensaje de commit incluye atribución de LLM (política no-LLM de AGENTS.md): quítala y reintenta"
fi

# --- 1) Destructive git ops (on the stripped, split scan) --------------------
# Checked only against a segment already known to be a git invocation.
dangerous_patterns=(
  'push.*(--force|--force-with-lease)'
  'push.*[[:space:]]-f([[:space:]]|$)'
  'push.*[[:space:]]\+[^[:space:]]'
  'reset.*--hard'
  'clean.*-[A-Za-z]*f'
  'branch.*-D'
  '(checkout|restore)([[:space:]]+--)?[[:space:]]+\.([[:space:]]|$)'
)

while IFS= read -r seg; do
  # Trim leading whitespace.
  seg=$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//')
  # Only inspect segments that actually invoke git (allow sudo/env-style wrappers).
  printf '%s' "$seg" | grep -qE '^((sudo|env|command|nice)[[:space:]]+)*git([[:space:]]|$)' || continue
  # Normalise destructive aliases from git/.gitconfig to their canonical form so
  # the patterns below reach them: co->checkout, discard->checkout --, ps/psu->push.
  # These mirror git/.gitconfig; if you change those aliases, update this mapping.
  seg=$(printf '%s' "$seg" | sed -E \
    -e 's/^((sudo|env|command|nice)[[:space:]]+)*git[[:space:]]+discard([[:space:]]|$)/git checkout -- /' \
    -e 's/^((sudo|env|command|nice)[[:space:]]+)*git[[:space:]]+co([[:space:]]|$)/git checkout /' \
    -e 's/^((sudo|env|command|nice)[[:space:]]+)*git[[:space:]]+psu?([[:space:]]|$)/git push /')
  # `git clean` in dry-run mode (-n / --dry-run) deletes nothing: allow it even with -f.
  if printf '%s' "$seg" | grep -qE '(^|[[:space:]])clean([[:space:]]|$)' \
     && printf '%s' "$seg" | grep -qE '[[:space:]](-[A-Za-z]*n|--dry-run)'; then
    continue
  fi
  for pattern in "${dangerous_patterns[@]}"; do
    if printf '%s' "$seg" | grep -qE "$pattern"; then
      block "\"$seg\" is a destructive git command (matched \"$pattern\")"
    fi
  done
done <<< "$scan"

exit 0

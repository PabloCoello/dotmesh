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
# Warn once per day so a fresh install notices the guardrail is sleeping.
if ! command -v jq >/dev/null 2>&1; then
  _jqw="${TMPDIR:-/tmp}/dotmesh-nojq-$(basename "$0" .sh)-$(date +%Y%m%d)"
  [ -f "$_jqw" ] || { printf 'dotmesh hook: jq no encontrado; guardarraíl desactivado (fail-open). Instala jq.\n' >&2; : > "$_jqw" 2>/dev/null || true; }
  exit 0
fi

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

block() {  # $1 = reason
  printf 'BLOCKED: %s. dotmesh guardrail: not permitted. If you genuinely need it, run it yourself.\n' "$1" >&2
  exit 2
}

# Drop quoted substrings (single then double) so mentions inside strings don't
# trip the scanners, then normalise command separators to newlines so each line
# is one command and patterns can't span two commands.
# tr replaces each separator character with a newline; || and && each produce
# two newlines (an empty segment between) which the loop skips harmlessly.
# This is portable across GNU sed and BSD sed (macOS), unlike \n in sed -E.
scan=$(printf '%s' "$cmd" \
  | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g" \
  | tr ';|&(){}' '\n')

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
# curl/wget piped directly to a shell — remote code execution without review.
# Checked on the raw cmd (before split) because the pipe is the intent signal.
if printf '%s' "$cmd" | grep -qE '(curl|wget)[[:space:]].*\|[[:space:]]*(sudo[[:space:]]+)?(bash|sh|zsh|ash|fish|python[0-9.]?|perl|ruby)([[:space:]]|$)'; then
  block "curl/wget canalizado a un intérprete de shell (ejecución remota de código)"
fi
# rm -rf over sensitive user subtrees that the root-anchored pattern above
# does not cover (those only match /, ~, $HOME as top-level targets).
if printf '%s' "$scan" | grep -qE 'rm[[:space:]].*-[A-Za-z]*([rR][fF]?|[fF][rR]?)[A-Za-z]*[[:space:]]+(~/\.(ssh|gnupg|config|local)|~/Documentos/GitHub|~/Documents/GitHub)([[:space:]]|$)'; then
  block "rm -rf sobre subdirectorio sensible del usuario (~/.ssh, ~/.gnupg, ~/.config, ~/Documentos/GitHub)"
fi

# --- 3) LLM attribution trailers in git commit (on the raw cmd) --------------
# Scanned raw because the trailer lives inside the quoted -m body; gated on the
# command actually being a `git commit` so plain echoes don't trip it.
if printf '%s' "$cmd" | grep -qE '\bgit[[:space:]]+([^[:space:]]+[[:space:]]+)*commit\b' \
   && printf '%s' "$cmd" | grep -qiE 'co-authored-by:[[:space:]]*(claude|codex|openai|chatgpt|copilot|opencode|gpt|gemini|anthropic|llm)|claude-session:|generated[[:space:]]+(with|by)[[:space:]]+(claude|chatgpt|codex|copilot|ai|an?[[:space:]]*llm)|authored[[:space:]]+by[[:space:]]+(ai|an?[[:space:]]*llm)'; then
  block "el mensaje de commit incluye atribución de LLM (política no-LLM de AGENTS.md): quítala y reintenta"
fi

# --- 1a) Alias injection that would persist or inline a dangerous op ----------
# Checked on the RAW cmd (before quote-stripping) because the dangerous value
# lives inside the quoted alias definition. Both -c (session-scoped) and
# config (persistent) forms are covered.
_dangerous_op_re='(push[[:space:]].*(--force|-f([[:space:]]|$)|--mirror)|reset[[:space:]]+--hard|(^|[[:space:]])clean[[:space:]].*-[A-Za-z]*f|branch[[:space:]]+(-D|--delete)|update-ref.*-d|stash[[:space:]]+(drop|clear))'
if printf '%s' "$cmd" | grep -qE 'git[[:space:]].*-c[[:space:]]+alias\.' \
   && printf '%s' "$cmd" | grep -qiE "$_dangerous_op_re"; then
  block "git -c alias.X=<op-peligrosa> evade el guardarraíl"
fi
if printf '%s' "$cmd" | grep -qE 'git[[:space:]]+config[[:space:]].*(--[^[:space:]]+[[:space:]]+)*alias\.' \
   && printf '%s' "$cmd" | grep -qiE "$_dangerous_op_re"; then
  block "git config alias.X=<op-peligrosa> persistiría una evasión del guardarraíl"
fi

# --- 1) Destructive git ops (on the stripped, split scan) --------------------
# Checked only against a segment already known to be a git invocation.
dangerous_patterns=(
  'push.*(--force|--force-with-lease)'
  'push.*[[:space:]]-f([[:space:]]|$)'
  'push.*[[:space:]]\+[^[:space:]]'
  'reset.*--hard'
  # Anchor 'clean' as a standalone subcommand token (space after it) to avoid
  # false positives like "git checkout cleanup-fix" matching 'clean.*-f'.
  '(^|[[:space:]])clean[[:space:]].*-[A-Za-z]*f'
  # branch -D (short) and --delete --force (long form) are equivalent.
  'branch.*(-D|--delete[[:space:]].*--force|--force[[:space:]].*--delete)'
  # stash drop/clear permanently discard stashed work.
  'stash[[:space:]]+(drop|clear)([[:space:]]|$)'
  # update-ref -d deletes a ref directly, bypassing branch protection.
  'update-ref.*[[:space:]]-d([[:space:]]|$)'
  # push --mirror overwrites every ref on the remote (can delete branches).
  'push.*--mirror'
  # push origin :branch deletes the remote branch (empty src refspec).
  'push.*[[:space:]]:[^[:space:]]'
  # checkout/restore generalized: handled below as an explicit check so we can
  # also exclude --staged. Pattern removed from this array.
)

while IFS= read -r seg; do
  # Trim leading whitespace.
  seg=$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//')
  # Only inspect segments that actually invoke git.
  # Handles: plain git, sudo/env/command/nice/timeout/nohup/xargs wrappers,
  # VAR=x environment prefixes, and path-prefixed git (/usr/bin/git, etc.).
  # Note: timeout with a numeric arg (timeout 30 git) is not caught here — the
  # numeric arg sits between the wrapper keyword and git, which the regex below
  # cannot distinguish from a non-git command without false positives.
  printf '%s' "$seg" | grep -qE \
    '^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*((sudo|env|command|nice|timeout|nohup|xargs)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*)*((/[^[:space:]]*/)?git)([[:space:]]|$)' \
    || continue
  # Normalise destructive aliases from git/.gitconfig to their canonical form so
  # the patterns below reach them: co->checkout, discard->checkout --, ps/psu->push.
  # These mirror git/.gitconfig; if you change those aliases, update this mapping.
  # The prefix pattern mirrors the anchor regex above to strip wrappers and paths.
  _GIT_PRE='([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*((sudo|env|command|nice|timeout|nohup|xargs)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*)*(/[^[:space:]]*/)?git[[:space:]]+'
  seg=$(printf '%s' "$seg" | sed -E \
    -e "s#^${_GIT_PRE}discard([[:space:]]|$)#git checkout -- #" \
    -e "s#^${_GIT_PRE}co([[:space:]]|$)#git checkout #" \
    -e "s#^${_GIT_PRE}psu?([[:space:]]|$)#git push #")
  # `git clean` in dry-run mode (-n / --dry-run) deletes nothing: allow it even with -f.
  if printf '%s' "$seg" | grep -qE '(^|[[:space:]])clean([[:space:]]|$)' \
     && printf '%s' "$seg" | grep -qE '[[:space:]](-[A-Za-z]*n|--dry-run)'; then
    continue
  fi
  # git commit is already scanned by family 3 (LLM attribution). Skipping it
  # here avoids false positives when a commit MESSAGE body (e.g. in a heredoc)
  # mentions "git reset --hard" or similar while documenting this very hook.
  if printf '%s' "$seg" | grep -qE '[[:space:]]commit([[:space:]]|$)'; then
    continue
  fi
  # checkout/restore that resets the working tree: block regardless of what ref
  # or flags precede the final path argument, UNLESS --staged is present (which
  # only unstages, it does not touch the working tree).
  if printf '%s' "$seg" | grep -qE '[[:space:]](checkout|restore)([[:space:]]|$)' \
     && printf '%s' "$seg" | grep -qE '[[:space:]]\.([[:space:]]|$)' \
     && ! printf '%s' "$seg" | grep -qE '[[:space:]]--staged([[:space:]]|$)'; then
    block "checkout/restore sobre el árbol de trabajo: \"$seg\""
  fi
  for pattern in "${dangerous_patterns[@]}"; do
    if printf '%s' "$seg" | grep -qE "$pattern"; then
      block "\"$seg\" is a destructive git command (matched \"$pattern\")"
    fi
  done
done <<< "$scan"

exit 0

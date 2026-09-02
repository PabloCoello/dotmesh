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
  # mkdir is the check and the write in one step: it succeeds only for the first
  # caller of the day, and it never follows a symlink in the final component, so
  # a marker pre-seeded in a shared TMPDIR cannot make this hook create or
  # truncate a file elsewhere. Anyone able to pre-seed that path silences the
  # day's warning; the UID check this replaces traded that for re-warning on
  # every single call, which is noisier for no gain. Audited 2026-09-02.
  if mkdir "$_jqw" 2>/dev/null; then
    printf 'dotmesh hook: jq no encontrado; guardarraíl desactivado (fail-open). Instala jq.\n' >&2
  fi
  exit 0
fi

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0
hook_cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
[ -d "$hook_cwd" ] || hook_cwd=$PWD

# A heredoc body is not quoted, so it survives the quote stripping below and
# reaches the scanners: writing a document that describes this guardrail trips
# it. Drop those bodies, but only when no interpreter receives them on the
# opener line. Writing a file is not irreversible; feeding a shell is, and that
# payload has to stay visible.
# Anything that can spawn a process from the text it reads counts: awk has
# system(), lua and php have os.execute()/exec(), R has system(). A body fed
# to one of these is a payload, not a document.
_INTERPRETER_RE='(^|[[:space:];&|(])(sudo[[:space:]]+)?(bash|sh|zsh|ash|ksh|dash|fish|csh|tcsh|python[0-9.]*|perl|ruby|node|deno|bun|eval|g?awk|mawk|tclsh|wish|lua[a-z0-9._-]*|php[0-9.-]*|[Rr]script|pwsh|powershell|xargs|parallel)([[:space:]]|$)'
strip_heredoc_bodies() {
  local line trimmed delim="" keep=0 out=""
  while IFS= read -r line || [ -n "$line" ]; do
    if [ -n "$delim" ]; then
      # Leading whitespace is trimmed unconditionally. That is exact for <<-
      # and lax for <<, where bash requires the delimiter at column zero: the
      # body closes here earlier than bash would, so more of the command gets
      # scanned, never less. Trailing whitespace is NOT trimmed, matching bash:
      # a line "EOF " does not close the heredoc there either.
      trimmed=${line#"${line%%[![:space:]]*}"}
      [ "$trimmed" = "$delim" ] && delim=""
      # Inside a body: keep it only when an interpreter is reading it.
      [ "$keep" = 1 ] && out+="$line"$'\n'
      continue
    fi
    out+="$line"$'\n'
    # `<<<` is a herestring, not a heredoc: exclude it. If the delimiter cannot
    # be read the body simply stays, which is the safe direction.
    printf '%s' "$line" | grep -qE '<<-?[[:space:]]*("[^"]+"|'"'"'[^'"'"']+'"'"'|[A-Za-z_][A-Za-z0-9_]*)' \
      && ! printf '%s' "$line" | grep -qE '<<<' || continue
    delim=$(printf '%s' "$line" \
      | sed -E 's/.*<<-?[[:space:]]*//; s/^"([^"]+)".*/\1/; s/^'"'"'([^'"'"']+)'"'"'.*/\1/; s/^([A-Za-z_][A-Za-z0-9_]*).*/\1/')
    keep=0
    printf '%s' "$line" | grep -qE "$_INTERPRETER_RE" && keep=1
  done
  printf '%s' "$out"
}
payload=$(printf '%s' "$cmd" | strip_heredoc_bodies)

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
scan=$(printf '%s' "$payload" \
  | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g" \
  | tr ';|&(){}' '\n')
# KNOWN LIMIT — shell indirection (sh -c '…', bash -c '…', eval '…'): the
# dangerous payload sits inside a quoted string that the stripping above removes,
# making it invisible to all pattern families. Blocking every sh/bash -c or eval
# call would generate mass false positives (e.g. git commit -m '…' heredocs,
# CI wrappers). These forms are accepted as a deliberate limit and are left to
# explicit user approval or the external approver hook.

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
if printf '%s' "$payload" | grep -qE '(curl|wget)[[:space:]].*\|[[:space:]]*(sudo[[:space:]]+)?(bash|sh|zsh|ash|fish|python[0-9.]?|perl|ruby)([[:space:]]|$)'; then
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
# Checked before quote-stripping because the dangerous value lives inside the
# quoted alias definition, but on the heredoc-stripped payload so that prose
# describing this evasion can be written to a file. Both -c (session-scoped)
# and config (persistent) forms are covered.
_dangerous_op_re='(push[[:space:]].*(--force|-f([[:space:]]|$)|--mirror)|reset[[:space:]]+--hard|(^|[[:space:]])clean[[:space:]].*-[A-Za-z]*f|branch[[:space:]]+(-D|--delete)|update-ref.*-d|stash[[:space:]]+(drop|clear))'
if printf '%s' "$payload" | grep -qE 'git[[:space:]].*-c[[:space:]]+alias\.' \
   && printf '%s' "$payload" | grep -qiE "$_dangerous_op_re"; then
  block "git -c alias.X=<op-peligrosa> evade el guardarraíl"
fi
if printf '%s' "$payload" | grep -qE 'git[[:space:]]+config[[:space:]].*(--[^[:space:]]+[[:space:]]+)*alias\.' \
   && printf '%s' "$payload" | grep -qiE "$_dangerous_op_re"; then
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
  # filter-branch rewrites history destructively and can lose commits permanently.
  '[[:space:]]filter-branch([[:space:]]|$)'
  # worktree remove --force discards an unclean worktree without confirmation.
  'worktree[[:space:]]+remove.*--force'
  # reflog expire/delete destroys recovery points for unreachable commits.
  'reflog[[:space:]]+(expire|delete)'
  # gc --prune=now; combined with reflog expire, permanently destroys unreachable commits.
  'gc[[:space:]].*--prune=now'
  # checkout/restore generalized: handled below as an explicit check so we can
  # also exclude --staged. Pattern removed from this array.
)

while IFS= read -r seg; do
  # Trim leading whitespace.
  seg=$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//')
  # Only inspect segments that actually invoke git.
  # Handles: plain git, sudo/env/command/exec/nice/timeout/nohup/xargs wrappers,
  # VAR=x environment prefixes, and path-prefixed git (/usr/bin/git, etc.).
  # Note: timeout with a numeric arg (timeout 30 git) is not caught here — the
  # numeric arg sits between the wrapper keyword and git, which the regex below
  # cannot distinguish from a non-git command without false positives.
  printf '%s' "$seg" | grep -qE \
    '^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*((sudo|env|command|exec|nice|timeout|nohup|xargs)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*)*((/[^[:space:]]*/)?git)([[:space:]]|$)' \
    || continue
  # Normalise destructive aliases from git/.gitconfig to their canonical form so
  # the patterns below reach them: co->checkout, discard->checkout --, ps/psu->push.
  # These mirror git/.gitconfig; if you change those aliases, update this mapping.
  # The prefix pattern mirrors the anchor regex above to strip wrappers and paths.
  _GIT_PRE='([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*((sudo|env|command|exec|nice|timeout|nohup|xargs)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*)*(/[^[:space:]]*/)?git[[:space:]]+'
  seg=$(printf '%s' "$seg" | sed -E \
    -e "s#^${_GIT_PRE}discard([[:space:]]|$)#git checkout -- #" \
    -e "s#^${_GIT_PRE}co([[:space:]]|$)#git checkout #" \
    -e "s#^${_GIT_PRE}psu?([[:space:]]|$)#git push #")
  # `git clean` in dry-run mode (-n / --dry-run) deletes nothing: allow it even with -f.
  if printf '%s' "$seg" | grep -qE '(^|[[:space:]])clean([[:space:]]|$)' \
     && printf '%s' "$seg" | grep -qE '[[:space:]](-[A-Za-z]*n|--dry-run)'; then
    continue
  fi
  # Skip only when commit IS the git subcommand (git [-flags] commit …).
  # Requires every token between the git invocation and 'commit' to start with
  # '-' (a global flag such as --no-pager or -p). This correctly skips
  # `git commit` while NOT skipping `git push --force origin commit`,
  # `git reset --hard commit`, `git branch -D commit`, `git stash drop commit`
  # or `git checkout . commit` — where 'commit' is an argument, not the
  # subcommand, and the dangerous patterns in this loop must fire.
  # The previous broad skip (`[[:space:]]commit([[:space:]]|$)`) was a regression:
  # it silenced ALL patterns whenever the word 'commit' appeared anywhere in
  # the argument list, regardless of role.
  # Edge case: `git -c key=val commit` — the value token does not start with '-'
  # so this skip does not fire; acceptable, since the quote-stripped message body
  # cannot produce a dangerous-pattern match in practice.
  if printf '%s' "$seg" | grep -qE '(^|[[:space:]])(([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*|sudo|env|command|exec|nice|timeout|nohup|xargs)[[:space:]]+)*((/[^[:space:]]*/)?git)([[:space:]]+-[^[:space:]]+)*[[:space:]]+commit([[:space:]]|$)'; then
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

# --- 1b) Push to the default branch -----------------------------------------
# AGENTS.md and /super-git forbid it by policy and nothing enforced it: the
# patterns above only cover force, mirror and delete.
#
# Parsed in its own pass over a DE-QUOTED copy, not over $scan: the scan deletes
# quoted substrings whole, so `git push origin 'main'` would lose its refspec
# and read as a push of the checked-out branch. De-quoting is safe here because
# this pass only ever looks at the push subcommand and its positional
# arguments, never at free text.
# $'…' is stripped before '…' so that `origin $'main'` does not leave `$main`
# behind, which would read as a different branch than the one bash pushes to.
dequoted=$(printf '%s' "$payload" \
  | sed -E "s/\\$'([^']*)'/\1/g; s/'([^']*)'/\1/g; s/\"([^\"]*)\"/\1/g" \
  | tr ';|&(){}' '\n')

while IFS= read -r seg; do
  seg=$(printf '%s' "$seg" | sed -E 's/^[[:space:]]+//')
  printf '%s' "$seg" | grep -qE \
    '^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*((sudo|env|command|exec|nice|timeout|nohup|xargs)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*)*((/[^[:space:]]*/)?git)([[:space:]]|$)' \
    || continue
  _GIT_PRE='([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*((sudo|env|command|exec|nice|timeout|nohup|xargs)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*)*(/[^[:space:]]*/)?git[[:space:]]+'
  rest=$(printf '%s' "$seg" | sed -E \
    -e "s#^${_GIT_PRE}psu?([[:space:]]|\$)#push #" \
    -e "s#^${_GIT_PRE}##")
  # Backslash escapes are the shell's, not part of the name: bash runs
  # `push origin \main` as `push origin main`, so the parser has to read it the
  # same way or the comparison below looks at a name nobody typed.
  rest=$(printf '%s' "$rest" | sed -E 's/\\(.)/\1/g')

  # Walk git's global flags to find the real subcommand. Doing this by token
  # rather than by pattern is what keeps `git log --grep push origin main` out:
  # there, `push` is an argument, not the subcommand.
  read -ra _toks <<< "$rest"
  _i=0; _sub=""; _dir=""
  while [ "$_i" -lt "${#_toks[@]}" ]; do
    case "${_toks[$_i]}" in
      -C) _dir=${_toks[$((_i+1))]:-}; _i=$((_i+2)) ;;
      -c|--git-dir|--work-tree|--namespace|--exec-path) _i=$((_i+2)) ;;
      -*) _i=$((_i+1)) ;;
      *) _sub=${_toks[$_i]}; break ;;
    esac
  done
  [ "$_sub" = push ] || continue

  # Positional arguments of push, skipping the flags that consume a value.
  _i=$((_i+1)); _pos=()
  while [ "$_i" -lt "${#_toks[@]}" ]; do
    case "${_toks[$_i]}" in
      --dry-run|-n) continue 2 ;;
      -o|--push-option|--repo|--receive-pack|--exec) _i=$((_i+2)) ;;
      -*) _i=$((_i+1)) ;;
      *) _pos+=("${_toks[$_i]}"); _i=$((_i+1)) ;;
    esac
  done

  [ -d "$_dir" ] || _dir=$hook_cwd
  # origin/HEAD is the only local record of which branch the remote defaults to.
  # Without it there is nothing to compare against, so nothing is blocked.
  _def=$(git -C "$_dir" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)
  _def=${_def#*/}
  [ -n "$_def" ] || continue

  # The first positional is the remote; every one after it is a refspec, and
  # git pushes them all. With no refspec at all it pushes the checked-out branch.
  if [ "${#_pos[@]}" -le 1 ]; then
    _targets=("$(git -C "$_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || true)")
  else
    _targets=("${_pos[@]:1}")
  fi
  for _t in "${_targets[@]}"; do
    [ -n "$_t" ] || continue
    _t=${_t##*:}          # +src:dst -> dst
    _t=${_t#+}
    _t=${_t#refs/heads/}
    # HEAD and @ name the checked-out branch; comparing them as strings would
    # miss `git push origin HEAD` from the default branch.
    case "$_t" in
      HEAD|@) _t=$(git -C "$_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || printf '%s' "$_t") ;;
    esac
    if [ "$_t" = "$_def" ]; then
      block "push a la rama por defecto ($_def): AGENTS.md lo prohíbe, abre una rama y un PR"
    fi
  done
done <<< "$dequoted"

exit 0

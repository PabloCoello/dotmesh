# dotmesh Agent Guide

This file is the single source of truth for agent instructions in this repository. Claude Code reads it via an `@AGENTS.md` import inside `CLAUDE.md`. OpenCode and Codex read it directly.

## Project overview

This repository manages personal macOS dotfiles with **GNU Stow**. Editing files here changes the user's local environment once `make stow` (or `make install`) is run. Treat changes as having a real, machine-wide blast radius.

## Stack

- Primary language: Bash / shell scripts
- Configuration formats: Makefile, JSON, TOML, Markdown
- Framework: none
- Build tool: `make`
- Package manager: npm only for ad hoc tooling via `npx` and the VS Code extension manifest under `vscode/package.json`

## Common commands

```bash
make help        # list targets
make health      # verify zsh, stow, git, delta, starship, code, claude, codex, opencode are installed
make backup      # snapshot existing local config to ~/dotfiles-backup/<timestamp>
make install     # backup + stow + link-skills + link-warp (full install on a fresh machine)
make stow        # symlink every package into ~
make unstow      # remove the symlinks
make restow      # unstow + stow (run after adding/removing files in a package)
make link-skills # create ~/.claude/skills -> ~/.agents/skills (idempotent)
make link-warp   # symlink Warp themes into the XDG data dir (Linux only; macOS uses Stow)
make gnome-rice  # dotmesh retint of the GNOME desktop (Linux only)
make clean       # wipe ~/dotfiles-backup/*
```

There is no test, lint, or build step — this repo is configuration, not code. Verification is `make health` and reloading the shell (`exec zsh`).

## Architecture

This repo is a **Stow farm**. Each top-level directory is a Stow "package" whose internal structure mirrors the target path under `$HOME`. `make stow` links `<pkg>/<path>` to `~/<path>`.

| Package | Links into | Owns |
|---|---|---|
| `shell/` | `~/.zshrc`, `~/.config/shell/` | Zsh + Oh-My-Zsh entrypoint and modular `env/path/functions/aliases/ai.zsh` |
| `git/` | `~/.gitconfig`, `~/.gitignore_global`, `~/.gitmessage` | Git config + delta pager |
| `starship/` | `~/.config/starship.toml` | Prompt |
| `warp/` | `~/.warp/themes/{carbon,dotmesh}.yaml` (macOS, vía Stow) · `~/.local/share/warp-terminal/themes/` (Linux, vía `make link-warp`) | Temas del terminal Warp: **Carbon** (reciclado del Carbon de Terax) y **dotmesh** (Ink + sintaxis; ver `docs/DESIGN.md`) |
| `vscode/` | `~/Library/Application Support/Code/User/...` (macOS, vía Stow) · `~/.config/Code/User/` (Linux) · `%APPDATA%\Code\User\` (Windows), estos dos por `scripts/install.sh`/`install.ps1` | VS Code settings, keybindings (`keybindings.json` cmd+ en macOS · `keybindings.linux.json` ctrl+ en Linux/Windows), snippets, extensions list, custom themes (activo: **dotmesh**) |
| `opencode/` | `~/.config/opencode/` | OpenCode `agents/`, `commands/`, `opencode.json` |
| `codex/` | `~/.codex/` | `config.toml`, `AGENTS.md` (Codex global instructions) |
| `claude/` | `~/.claude/` | Claude Code `CLAUDE.md` (stub `@AGENTS.md`) + `AGENTS.md` (global instructions), `settings.json`, `statusline.sh`, `hooks/`, `agents/`, `commands/` |
| `agents/` | `~/.agents/skills/` | Canonical agent skills shared across all three AI agents |
| `gnome/` | `~/.config/gtk-{3,4}.0/gtk.css` (Linux, vía `make gnome-rice`) | Rice del escritorio GNOME: retint sobre Yaru a la paleta dotmesh (gtk.css + capa dconf). Ver `docs/DESIGN.md` |

`Makefile:3` defines `PACKAGES` — keep this list in sync when adding or removing a package directory.

The `vscode/` package contains a `.stow-local-ignore` and `package.json` because the directory doubles as a publishable VS Code theme extension; only the `Library/...` subtree is intended to be stowed.

The `gnome/` package is Linux-only and intentionally **not** in `PACKAGES`: `make stow` skips it, and `make gnome-rice` both links its `gtk.css` (via `stow gnome`) and applies the dconf layer (`gnome/scripts/apply-rice.sh`). Its `.stow-local-ignore` keeps `scripts/` and `README.md` out of `$HOME`.

## Skills as the integration point

`agents/.agents/skills/<skill>/SKILL.md` is the **single source of truth** for skills. After `make stow`, the same files appear under `~/.agents/skills/`, and after `make link-skills`, also under `~/.claude/skills/` (symlink). Each agent then picks them up:

- **OpenCode** consumes them via `/setup` (see `opencode/.config/opencode/README.md`).
- **Claude Code** discovers them automatically from `~/.claude/skills/` (the symlink).
- **Codex** uses `codex/.codex/AGENTS.md` as its entry point.

Do **not** create a parallel skill source (e.g. `.opencode/skills/`, an upstream marketplace plugin) without updating the sync story here and in the README.

The daily core pack lives in `agents/.agents/skills/README.md`. `anti-ai-style` and `castellano-peninsular` are intentional local additions on top of the core pack — keep them. So are the grilling skills (`grilling`, `grill-me`, `grill-with-docs`, `domain-modeling`) and `handoff`, adapted from [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). They complement — they don't replace — the `debate` agent, which is kept for pure divergent exploration. `dotmesh-design` is a further local addition: the personal design system (Paper · Ink · Syntax) packaged as a skill. It carries `disable-model-invocation`, so it applies only when invoked explicitly with `/dotmesh-design`, never automatically. It is a snapshot export that distils the visual language whose source of truth remains `docs/DESIGN.md`.

## Skill flow is the default, not a request

The engineering core pack is **opt-out, not opt-in**. On any non-trivial change, load and follow the matching skill at each phase on your own initiative — the user naming a skill is a shortcut, never a precondition. Don't ask permission to load a core-pack skill and don't make a show of it — but **do actually load it** (invoke the Skill tool) at the phase it owns, so you act on its full `SKILL.md`, not a half-remembered version. "Don't narrate" means skip the play-by-play, not skip the skill: a one-line note is fine, a paragraph of meta-commentary is not.

Default flow for a code change, and the skill that owns each phase:

1. Figuring out what to build → pick one ideation door (see the rule below).
2. New feature or non-trivial change with no spec → `spec-driven-development`, then `planning-and-task-breakdown`.
3. Behaviour that depends on external docs, versions or APIs → `source-driven-development`.
4. **Before writing code** → walk the YAGNI gate in `code-simplification` ("Don't write it in the first place").
5. Implementing → `incremental-implementation` (thin slices) + `test-driven-development` (prove each slice).
6. Tests, build or runtime failing → `debugging-and-error-recovery`.
7. Before merge → `code-review-and-quality`; security-sensitive surface → `security-and-hardening`.
8. Working code heavier than needed → `code-simplification`.
9. Commits, branches, PR → `git-workflow-and-versioning` (full lifecycle via `/super-git`).
10. Durable decision or interface change → `documentation-and-adrs`; new or sharpened domain terminology → `domain-modeling` (maintains `CONTEXT.md`).
11. Switching agents mid-task, or pausing with work in flight → `handoff`.

### Ideation: which door

Three tools share the "what to build" phase. Pick by what you have and what you want — only one fires at a time:

- `idea-refine` — the idea is still **vague or unformed**. Shapes a rough concept into something concrete enough to act on.
- `debate` (agent) — you want **divergent pushback**: competing framings, trade-offs, assumptions challenged, deliberately *not* converging. Read-only sparring partner in its own context.
- `grilling` / `grill-me` — you have a **forming plan** and want to **nail it down**: a convergent, one-question-at-a-time interview that resolves the decision tree and ends ready to build. Use `grill-with-docs` when it also needs a glossary or ADRs.

Rule of thumb: **no shape yet → `idea-refine`; want to be challenged → `debate`; ready to converge → `grilling`.**

Enforcement rules:

- **Match effort to scope.** Trivial single-file, single-function edits skip the flow. The flow is mandatory for anything touching multiple files or introducing behaviour. For a multi-file change with **three or more distinct steps**, write at least a short `.ai/tasks/<slug>/plan.md` before coding, even without phase subagents; reserve subagent orchestration for genuinely multi-phase work.
- **Specificity wins.** When two skills overlap, the more specific phase owns the rule; the conventions in this file override any skill.
- **Spanish output** also loads `castellano-peninsular`, and for prose `anti-ai-style`.

## Long implementations and context

Quality degrades well before the context window fills (around 100k tokens, regardless of a 1M window). Don't fight this by stuffing more into one session — keep the durable truth on disk and the live context lean.

- **The plan lives on disk, not in context.** `planning-and-task-breakdown` writes the plan and a phase checklist to `.ai/tasks/<slug>/plan.md`. That file is the source of truth; the conversation is disposable. Mark phases done there as you go.
- **Commit per slice — automatic, not "on request".** `incremental-implementation` means each completed, green slice is committed **on the working branch** as you go. These per-slice checkpoints do **not** require the user to ask first: the "commit and push only when asked" rule governs **push, PR, and committing on the default branch** — not the incremental commits of an already-approved implementation on a work branch. If you're on the default branch, create a work branch first, then commit each slice. Git history is durable state a fresh session can read to re-orient. `/super-git` is the lifecycle arm of this: per-slice commits happen inside each phase subagent, while sync, push and PR are the orchestrator's single finalization step once the phases land.
- **Watch the counter.** The statusline shows absolute tokens (`~/.claude/statusline.sh`): gold at ~90k means wrap up the current phase; rose at ~160k means stop and hand off.
- **Orchestrate multi-phase work with subagents — don't carry it in one context.** For a plan with several phases, the main session is a thin orchestrator: run each phase in a fresh `build` subagent (isolated context), let it implement, test and commit that phase, and return a short summary plus the commit range. Because Claude Code does **not** nest subagents, a delegated `build` cannot run the `review`/`security` gates itself: it self-checks with the `code-review-and-quality` and `security-and-hardening` skills, and the **orchestrator** runs the blocking `review`/`security` subagents between phases over the commits each phase landed (`docs`/`maths` too when relevant). The orchestrator's context grows by summaries, not by the work — so it drives many phases without degrading. This is the automatic alternative to a manual `/handoff` → `/clear` → resume cycle between phases. (The agent cannot reset its own context mid-session; fresh subagents are how you get the same effect.)
- **Cross real session boundaries with `handoff`.** When you stop for the day, `handoff` writes the curated state to `.ai/tasks/<slug>/handoff.md`. The next session reads it — or runs the `state` agent to orient itself — and continues.

## Three-agent parity

This repo aims for functional parity between OpenCode, Claude Code and Codex so the user can switch between them in the same project without changing their workflow. Codex cannot mirror OpenCode's agent files directly, so it carries the same workflow vocabulary in `codex/.codex/AGENTS.md`.

| Concern | OpenCode | Claude Code | Codex |
|---|---|---|---|
| Memory file | reads `AGENTS.md` directly | reads `CLAUDE.md` (project and global `~/.claude/CLAUDE.md`), each a stub importing `AGENTS.md` via `@AGENTS.md` | reads `~/.codex/AGENTS.md` plus project `AGENTS.md` |
| Skills | `~/.agents/skills/` | `~/.claude/skills/` symlinked to `~/.agents/skills/` | shared skills referenced from `~/.agents/skills/` and surfaced through Codex skill discovery |
| Agents | `~/.config/opencode/agents/` (10 agents) | `~/.claude/agents/` (10 agents, same names and roles) | workflow modes in `codex/.codex/AGENTS.md`, not separate agent files |
| Custom commands | `/setup`, `/super-git`, `/checkpoint`, `/check-last` | `/setup`, `/super-git` (rest deferred) | natural-language command equivalents in `codex/.codex/AGENTS.md` |
| MCP | `~/.config/opencode/opencode.json` | declared in `claude/.claude/mcp/` reference + `~/.claude.json` | `[mcp_servers.*]` in `codex/.codex/config.toml` |
| Per-agent temperature | yes | not exposed — compensated in system prompts | not exposed — use model reasoning effort and workflow instructions |
| Per-agent bash granularity | yes (e.g. `npm audit*`) | only tool whitelist — bash is on/off per agent | sandbox, trust levels and approval prompts; no OpenCode permission frontmatter |
| Destructive-git guardrail | per-agent bash permission frontmatter | `PreToolUse` hook → `~/.claude/hooks/block-dangerous-git.sh` (blocks `reset --hard`, `clean -f`, `branch -D`, `checkout/restore .`, force-push; allows normal push) | sandbox + approval prompts gate destructive commands |
| Context counter | built-in context indicator in the TUI | custom `statusLine` → `~/.claude/statusline.sh` (modelo · barra de contexto · rama · coste, paleta dotmesh) | built-in token/context indicator in the TUI |

## Conventions to respect

- **Defensive, idempotent shell scripts.** `scripts/backup-current-config.sh` is the model: `set -e`, `mkdir -p`, gated `[ -e ]` checks, no destructive defaults.
- **No secrets in the repo.** Tokens and credentials are loaded out-of-band; see `docs/SECRETS.md`. MCP servers receive secrets via environment variables, not via committed config.
- **No LLM authorship in Git metadata.** Branch names, commit messages and
  trailers must describe the human intent and repository change, not the AI tool
  that helped. Do not add `Co-authored-by`, `Author`, `Signed-off-by`,
  `Generated-by`, branch slugs, or similar attribution for Codex, Claude,
  OpenCode, Copilot, ChatGPT or any other LLM/agent unless the user explicitly
  asks for that exact attribution.
- **Autonomous Git flow.** `/super-git` means the agent should manage the
  non-destructive Git lifecycle end to end: fetch, fast-forward when safe,
  branch naming, incremental semantic commits, verification, push and PR
  creation. Prefer branch-first, slice-by-slice work over after-the-fact sorting
  of a large dirty worktree. If the pending diff is already tangled, split it
  only where the boundaries are clear and ask before staging ambiguous hunks. It
  does not permit force-push, destructive resets/cleans, discarding work, staging
  secrets, pushing to the default branch, or changing Git identity without
  explicit user confirmation.
- **Don't run destructive Stow/Git operations without being asked.** `unstow`, `restow`, `clean`, `git reset --hard`, etc. all touch live user state.
- **README and most docs are in Spanish (peninsular).** Match the existing language when editing user-facing prose.
- **Theme colours start from `docs/DESIGN.md`.** The dotmesh visual language (palette, type, syntax map) is the single source of truth for the VS Code theme, Warp theme, Starship palette, delta/Git colours and the GNOME desktop retint. Change colours there first, then propagate; keep the five surfaces in sync.

## AI workspace artifacts policy

Enforced by this file and `.gitignore`. **dotmesh deliberately ignores its entire `.ai/` tree** — it versions none of these artifacts; the per-project policy below is what `/setup` seeds into *other* repos, not a description of dotmesh itself:

- Do **not** create `SPEC.md`, `PLAN.md`, `TODO.md`, `NOTES.md`, `CHECKPOINT.md` at the repo root unless the user explicitly asks.
- Default behavior: work in conversation. Only persist artifacts when the user asks, the task is long, or context loss is a real risk.
- Persistent planning goes in `.ai/tasks/YYYY-MM-DD-slug/{spec.md,plan.md}`.
- Throwaway scratch goes in `.ai/tmp/`.
- Policy for repos initialized by `/setup`: ignore `.ai/tmp/` by default; `.ai/tasks/` is not globally ignored — each project decides whether to version it. (dotmesh itself opts out and ignores all of `.ai/`, per the note above.)

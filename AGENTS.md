# dotmesh Agent Guide

## Project overview

This repository manages personal dotfiles with GNU Stow. The current scope is a terminal-agent-oriented setup for shell, Git, Starship, VS Code, OpenCode, Codex, Claude, and shared agent skills.

## Stack

- Primary language: Bash / shell scripts
- Configuration formats: Makefile, JSON, TOML, Markdown
- Framework: none
- Build tool: `make`
- Package manager: npm only for ad hoc tooling via `npx` and the VS Code extension manifest under `vscode/package.json`

## Common commands

- `make help` — show available targets
- `make health` — check required local tools
- `make backup` — back up existing local configuration
- `make stow` — apply dotfile symlinks with GNU Stow
- `make unstow` — remove dotfile symlinks
- `make restow` — refresh dotfile symlinks

## Working conventions

- Treat this as a dotfiles repository: changes can affect the user's local environment.
- Keep scripts defensive, portable where practical, and idempotent.
- Do not commit secrets, tokens, API keys, local machine credentials, or private hostnames.
- Prefer small, focused changes and verify with `make health` or targeted script checks when relevant.
- Do not run destructive shell, Git, or Stow operations unless explicitly requested.

## Skills

Personal agent skills live under `agents/.agents/skills/` in this repository and are linked to `~/.agents/skills/` with GNU Stow. Treat this path as the source of truth for shared skills across agents.

The daily core pack is documented in `agents/.agents/skills/README.md`. Keep `anti-ai-style` and `castellano-peninsular` as local additional skills.

Do not add a second skill source such as `.opencode/skills/` unless the sync story is explicitly updated in the documentation.

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

Stack-specific skills are installed under `.opencode/skills/` for OpenCode-compatible agents. Autoskills also created `.agents/skills/` and `skills-lock.json`; keep the skill copies in sync if autoskills continues to target `.agents` on this machine.

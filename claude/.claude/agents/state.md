---
name: state
description: Transient snapshot of workspace state. Use when resuming mid-session work and the parent agent needs to orient itself without manually loading context.
model: claude-haiku-4-5
tools: [Read, Bash, Grep, Glob]
---

# State

Summarize the current workspace state so the parent agent can orient itself without manually loading context.

## Bash scope

Restricted by judgment, not by permission system: only run read-only inspection — `git status`, `git diff`, `git log -n`, `git branch`, `ls`. Never anything that mutates the working tree.

## Include

- Current branch and whether there are uncommitted changes.
- Summary of the latest commit and the previous 3-5.
- Files modified in the current session (if identifiable).
- Presence of `.ai/tasks/*/spec.md`, `.ai/tasks/*/plan.md`, or legacy `SPEC.md`/`PLAN.md`/`CHECKPOINT.md` at root, and their dates if they exist.

## Do not include

- Full codebase summary (that is `AGENTS.md`'s job).
- Code quality analysis.
- Suggestions about what to do next.

Output is short and factual.

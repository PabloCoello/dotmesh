---
name: handoff
description: Compact the current conversation into a handoff document so another agent can pick up the work. Use when switching between OpenCode, Claude Code and Codex mid-task, or when ending a session with work still in flight.
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it to the OS temporary directory (or `.ai/tmp/` if the project uses it) — never the workspace root.

Include:

- **Goal** — what we're trying to achieve.
- **State** — what's done, what's in flight, what's blocked.
- **Decisions** — choices made and why. Reference ADRs, PRDs, plans, issues, commits and diffs by path or URL; don't duplicate them.
- **Next steps** — the concrete next actions.
- **Suggested skills** — which skills the next agent should load (e.g. `grilling`, `incremental-implementation`).

Redact secrets, tokens, and personal data. If the user described what the next session is for, tailor the document to that.

---
Adapted from `handoff` in [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). Fits the three-agent parity goal: hand off between OpenCode, Claude Code and Codex mid-task.

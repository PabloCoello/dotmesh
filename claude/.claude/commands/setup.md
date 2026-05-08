---
description: Initialize this workspace for the dotmesh agent system. Like /init but also wires shared skills and the AGENTS.md ↔ CLAUDE.md import.
---

Initialize this workspace for the dotmesh agent system. This is the dotmesh-specific complement to the native `/init` — they coexist; `/init` writes a generic CLAUDE.md, `/setup` wires this workspace into the shared agent setup.

Steps:

1. **Memory file**.
   - If `AGENTS.md` does not exist: ask the user whether to (a) run native `/init` first to generate a draft and then convert, (b) generate `AGENTS.md` directly here, or (c) skip. Default to (a) if the project already has substantial code.
   - Ensure `CLAUDE.md` is a one-line stub containing exactly `@AGENTS.md` so Claude Code reads the shared file via import.
   - If `CLAUDE.md` already exists with other content, propose merging that content into `AGENTS.md` and replacing `CLAUDE.md` with the stub. Wait for user confirmation before writing.

2. **Detect project stack**: language, framework, build tool, package manager. Reflect this in `AGENTS.md` under a "Stack" or "Common commands" section if missing.

3. **Confirm `AGENTS.md` covers**: project overview, common commands (build, test, lint, dev), boundaries (Always do / Ask first / Never do), and a pointer noting that shared skills live at `~/.claude/skills/` (symlinked to `~/.agents/skills/`).

4. **Skills source**.
   - Verify `~/.claude/skills` exists and is a symlink to `~/.agents/skills`. If not, instruct the user to run `make link-skills` from the dotmesh repo and stop.
   - Do **not** create `.claude/skills/` inside the project unless the user explicitly asks for project-specific skills and the sync story is documented.

5. **Workspace artifacts policy**.
   - Recommend adding `.ai/tmp/` to `.gitignore` if not already present.
   - Do **not** add `.ai/tasks/` to `.gitignore` automatically — each project decides whether to version task artifacts.
   - Do **not** create `.ai/tasks/` or any persistent planning files unless the user explicitly requests them.

6. **Final structure check**. The workspace should end up with:

   - `AGENTS.md` at root (canonical instructions).
   - `CLAUDE.md` at root containing only `@AGENTS.md`.
   - `.ai/tmp/` in `.gitignore`.
   - Shared skills referenced from `~/.claude/skills/` (no local duplicate).

7. **Report**: list what was done, what was skipped, and any remaining manual step.

Do not commit. Do not push. Do not modify code outside the files listed above.

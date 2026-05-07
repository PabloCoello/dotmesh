---
description: Inicializa el proyecto para el sistema de agentes.
agent: build
---

Initialize this workspace for the agent system using the shared skills from `~/.agents/skills/`:

1. If `AGENTS.md` does not exist, run `opencode init` and then review the generated file.
2. Detect project stack: language, framework, build tool, package manager.
3. Confirm the project instructions mention relevant commands, boundaries, verification steps, and that shared skills are available from `~/.agents/skills/`.
4. Do not create `.opencode/skills/` or another local skill source unless the user explicitly asks for project-specific skills and the sync story is documented.
5. Confirm the structure ends up as:
   - `AGENTS.md` (root)
   - shared skills referenced from `~/.agents/skills/`
6. Report what was done and any remaining manual step.

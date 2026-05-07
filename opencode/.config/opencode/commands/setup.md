---
description: Inicializa el proyecto para el sistema de agentes.
agent: build
---

Initialize this workspace for the agent system using the shared skills from `~/.agents/skills/`:

1. If `AGENTS.md` does not exist, run `opencode init` and then review the generated file.
2. Detect project stack: language, framework, build tool, package manager.
3. Confirm the project instructions mention relevant commands, boundaries, verification steps, and that shared skills are available from `~/.agents/skills/`.
4. Do not create `.opencode/skills/` or another local skill source unless the user explicitly asks for project-specific skills and the sync story is documented.
5. Recommend adding `.ai/tmp/` to `.gitignore` if not already present. Do not add `.ai/tasks/` to `.gitignore`—each project decides whether to version task artifacts.
6. Do not create `.ai/tasks/` or any persistent planning files unless the user explicitly requests them.
7. Confirm the structure ends up as:
   - `AGENTS.md` (root)
   - `.ai/tmp/` in `.gitignore`
   - shared skills referenced from `~/.agents/skills/`
8. Report what was done and any remaining manual step.

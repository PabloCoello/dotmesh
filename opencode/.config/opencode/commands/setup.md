---
description: Inicializa el proyecto para el sistema de agentes.
agent: build
---

Initialize this workspace for the agent system:

1. If `AGENTS.md` does not exist, run `opencode init` and then review the generated file.
2. Detect project stack: language, framework, build tool, package manager.
3. Run `npx autoskills` to install stack-specific skills under `.opencode/skills/`.
4. Confirm the structure ends up as:
   - `AGENTS.md` (root)
   - `.opencode/skills/` (with installed skills)
5. Report what was done and any remaining manual step.

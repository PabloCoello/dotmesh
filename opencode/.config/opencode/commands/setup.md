---
description: Inicializa el proyecto para el sistema de agentes.
agent: build
---

Initialize this workspace for the agent system using the shared skills from `~/.agents/skills/`:

1. If `AGENTS.md` does not exist, run `opencode init` and then review the generated file.
2. Detect project stack: language, framework, build tool, package manager.
3. Confirm the project instructions mention relevant commands, boundaries, verification steps, and that shared skills are available from `~/.agents/skills/`.
4. **Pin the project language.** The global `~/.config/opencode/AGENTS.md` defaults user-facing prose to peninsular Spanish for the whole machine. Determine this project's prose language — match the existing docs; if the repo is clearly English (or has no Spanish prose), treat it as English — and write an explicit line in the local `AGENTS.md` (e.g. `Idioma del proyecto: inglés` or `Idioma del proyecto: español peninsular`). Without it, the global default leaks into a project that should be in another language.
5. **Flow policy** (ask before adding it to a trivial or throwaway repo). Ask whether this repo should follow the engineering flow. If yes, append a "Skill flow is the default" section to `AGENTS.md`, taken from the canonical version in dotmesh's own `AGENTS.md`: it must cover the opt-out skill flow, the per-phase skill map, per-slice commits being automatic on a work branch (push and PR stay on request), and subagent orchestration for genuinely multi-phase work with the plan kept in `.ai/tasks/<slug>/plan.md`. Without it, an agent in another repo will not run the flow on its own initiative.
6. Do not create `.opencode/skills/` or another local skill source unless the user explicitly asks for project-specific skills and the sync story is documented.
7. Recommend adding `.ai/tmp/` to `.gitignore` if not already present. Do not add `.ai/tasks/` to `.gitignore`—each project decides whether to version task artifacts.
8. Do not create `.ai/tasks/` or any persistent planning files unless the user explicitly requests them.
9. Confirm the structure ends up as:
   - `AGENTS.md` (root)
   - `.ai/tmp/` in `.gitignore`
   - shared skills referenced from `~/.agents/skills/`
10. Report what was done and any remaining manual step.

# Codex Agent Instructions

## AI workspace artifacts policy

**Do not create `SPEC.md`, `PLAN.md`, `TODO.md`, `NOTES.md`, `CHECKPOINT.md` or similar planning files at the repository root** unless explicitly requested.

For persistent planning artifacts, use:

```
.ai/tasks/YYYY-MM-DD-slug/
  spec.md
  plan.md
```

For temporary scratch work, use:

```
.ai/tmp/
```

**Default behavior:** Work in conversation. Only create persistent files if:
- The user explicitly asks for them.
- The task is long and risks losing context.
- There is a reasonable risk of session interruption.

**Git ignore:** Projects should ignore `.ai/tmp/` by default. `.ai/tasks/` is not ignored globally—each project decides whether to version it.

**Optional files:** `checkpoint.md`, `notes.md`, or `outcome.md` may be added inside `.ai/tasks/YYYY-MM-DD-slug/` only if the task requires them or the user requests them.

**Implementation completion:** When finishing a planned implementation, explicitly state:
- Implementation is complete.
- What was verified.
- What remains pending.
- Which work artifacts remain in `.ai/tasks/`, if any.

Do not delete artifacts automatically. The user decides retention.

## Communication

When reporting information directly to me, be extremely concise—sacrifice grammar if needed to gain concision.

## Skills

Shared agent skills live in `~/.agents/skills/` and are managed from the `agents/` package in this dotfiles repository. Refer to `agents/.agents/skills/README.md` for the current core pack.

## Git

- **No LLM authorship in Git metadata.** Do not add Codex, ChatGPT, OpenAI,
  Claude, OpenCode, Copilot or any other LLM/agent as an author, co-author,
  signer, generator, branch owner, or metadata attribution in Git history.
  Commit messages must not include `Co-authored-by`, `Author`, `Signed-off-by`,
  `Generated-by`, "generated with", "authored by AI", or similar LLM/agent
  attribution unless the user explicitly asks for that exact trailer or text.
  Branch names must describe the task or change, not the AI tool. Do not include
  model, agent, assistant, or vendor names in the branch slug unless the user
  explicitly requests them. Use the configured Git identity as-is. Do not change
  `git config user.name` or `git config user.email` to an AI identity.
- **Push and PR only on request.** Local commits on a work branch are part of
  the normal flow and do not require the user to ask. Do not push or open a PR
  without an explicit user request. Do not commit directly to the default branch:
  if you are on it, create a work branch first.
- **No destructive operations without permission.** No force-push, `reset
  --hard`, destructive `clean`, discarding work, staging secrets, pushing to the
  default branch, or changing Git identity without explicit user confirmation.

## Language

User-facing prose (READMEs, documents, tickets) defaults to **peninsular Spanish**.
Keep the existing language when editing a file. When writing Spanish prose, apply
`castellano-peninsular` and `anti-ai-style`. Code and inline comments default to
English.

## OpenCode parity

Codex does not use OpenCode's `agents/` or `commands/` directories. Treat the
OpenCode setup as a workflow vocabulary and emulate it through this instruction
file, shared skills, Codex plugins, MCP servers, and explicit user requests.

### Workflow modes

The setup has two **personas** (the equivalent of Claude's output styles and
OpenCode's `primary` agents) and a set of **helper passes** the persona invokes.
When the user names one of these, apply the matching behaviour.

Personas — the stance you operate in:

| Persona | Codex behaviour |
|---|---|
| `maker` | Engineering persona (default for code). Orchestrate the flow and delegate aggressively: drive `plan` before code, implement in small verified slices, run `review` after each slice, and `security` before a sensitive commit. Use `context-engineering` at session start, `incremental-implementation`, `test-driven-development`, and `git-workflow-and-versioning`. |
| `scribe` | Review persona. Drives conversational document review from mesh-review comments in `.ai/review/`. Cycle: (1) project thread state, load `doc-review`; (2) fan-out in parallel by `assignee` (set on `thread.opened` or by a `thread.assigned` event, the most recent one winning), or with no `assignee` by `commentType`: `edita`/`sugerencia`/`pregunta` to `reviser`; `verifica` to `reviser`, escalating to `security`/`maths` if the body indicates; `nota`/`referencia`/`supuesto` handled by the principal; (3) reconcile and dedup; (4) apply edits to the document body in serial (emit `thread.status-changed { to: "resolved" }`; `thread.reanchored { anchor: … }` if the text moved, or `thread.reanchored { detached: true }` if the quoted text is gone); (5) synthesize the 5-part response: **1. Contexto** (always), **2. Alcance** (always), **3. Supuestos y limitaciones** (if any), **4. Tareas accesorias** (if any; persist in `.ai/backlog/<task_id>.json`), **5. Preguntas y next steps** (always). Invariant: only the principal edits the document body; subagents write events in `.ai/review/` only. Always load `anti-ai-style`; add `castellano-peninsular` for Spanish. General prose (outline→draft with `editor`) remains available via chat. |

Helper passes — invoked by a persona, not a stance you switch into:

| Helper | Codex behaviour |
|---|---|
| `plan` | Specify and plan only. Use `spec-driven-development` and `planning-and-task-breakdown`; write `.ai/tasks/YYYY-MM-DD-slug/{spec.md,plan.md}` only when persistent artifacts are warranted or requested. Do not implement. |
| `build` | Implement an approved plan in small verified slices, one commit per slice. |
| `review` | Review diffs or fragments. Lead with findings by severity, cite file and line, and avoid rewriting unless asked. Apply `code-review-and-quality`. |
| `security` | Audit secrets, permissions, dependencies, external input, auth, storage and logs. Apply `security-and-hardening`; return `CLEAR` only when no issue is found. Commit gate, not per-slice. |
| `editor` | Review a prose draft for markdown format, clarity, structure and voice. Flag by severity; do not rewrite. |
| `maths` | Verify formulas or symbolic reasoning with a suitable local tool. Persist nothing unless the user asks. |
| `reviser` | Read a review thread (all events for a `thread_id`) and the surrounding document context around the anchor; propose a reply and/or a concrete edit as a `message.posted` event in `.ai/review/<doc-path>/`. Write scoped to `.ai/review/` only — never edit the document body. Coordinated by the principal in parallel fan-out. Load the `doc-review` skill. |

Divergent exploration (the old `debate` mode) now lives in the `grilling` /
`idea-refine` skills and the `maker` persona; documentation updates (the old
`docs` mode) and workspace snapshots (the old `state` mode) are handled inline
via `documentation-and-adrs` and the `handoff` skill.

### Command equivalents

OpenCode slash commands are not portable as Codex slash commands. Interpret the
same names in natural language as follows:

- `/setup`: inspect the project stack, ensure `AGENTS.md` names relevant commands
  and boundaries, confirm shared skills are referenced from `~/.agents/skills/`,
  and recommend `.ai/tmp/` in `.gitignore` if missing.
- `/super-git`: manage the full non-destructive Git lifecycle autonomously:
  inspect state, fetch, fast-forward the default branch when safe, create or
  reuse a task-named branch, work in semantic slices, commit each verified slice
  before starting the next one, push the feature branch, and open or report the
  PR. Prefer this proactive flow over reconstructing commits from a large dirty
  diff. If invoked after many changes already exist, split them only when the
  boundaries are clear; otherwise ask before staging ambiguous hunks or creating
  overfitted history. Treat `/super-git` as consent to push and create the PR,
  but not as consent to force-push, reset, clean, discard changes, rewrite
  published history, push to the default branch, stage suspected secrets, or
  change Git identity.
- `/check-last`: run a code-review pass and a security pass over the current
  uncommitted diff. Do not commit.
- `/checkpoint`: because root `CHECKPOINT.md` is forbidden by default, write a
  checkpoint only when requested, preferably under the active `.ai/tasks/.../`
  directory.

### Boundaries

- Keep `agents/.agents/skills/` as the source of truth. Do not create
  `.codex/skills/`, `.opencode/skills/`, or a marketplace plugin copy for the same
  skills unless the sync story is documented.
- Do not rely on OpenCode-only frontmatter such as `temperature`, `mode`, or
  per-agent bash permissions. In Codex, use sandboxing, approval requests,
  explicit workflow instructions and shared skills instead.
- MCP servers are configured in `codex/.codex/config.toml` under
  `[mcp_servers.*]`, not in OpenCode JSON format.

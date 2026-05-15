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

## Skills

Shared agent skills live in `~/.agents/skills/` and are managed from the `agents/` package in this dotfiles repository. Refer to `agents/.agents/skills/README.md` for the current core pack.

## Git attribution

Do not add Codex, ChatGPT, OpenAI, Claude, OpenCode, Copilot or any other
LLM/agent as an author, co-author, signer, generator, branch owner, or metadata
attribution in Git history.

- Commit messages must not include `Co-authored-by`, `Author`, `Signed-off-by`,
  `Generated-by`, "generated with", "authored by AI", or similar LLM/agent
  attribution unless the user explicitly asks for that exact trailer or text.
- Branch names must describe the task or change, not the AI tool. Do not include
  model, agent, assistant, or vendor names in the branch slug unless the user
  explicitly requests them.
- Use the configured Git identity as-is. Do not change `git config user.name` or
  `git config user.email` to an AI identity.

## OpenCode parity

Codex does not use OpenCode's `agents/` or `commands/` directories. Treat the
OpenCode setup as a workflow vocabulary and emulate it through this instruction
file, shared skills, Codex plugins, MCP servers, and explicit user requests.

### Workflow modes

When the user names one of these modes, apply the matching behaviour:

| Mode | Codex behaviour |
|---|---|
| `debate` | Read-only discussion. Sharpen the idea, surface assumptions and trade-offs, and avoid editing files. Load `idea-refine` for vague concepts. |
| `design` | Specify and plan only. Use `spec-driven-development` and `planning-and-task-breakdown`; write `.ai/tasks/YYYY-MM-DD-slug/{spec.md,plan.md}` only when persistent artifacts are warranted or requested. Do not implement. |
| `build` | Implement in small verified slices. Use `context-engineering` at session start, `incremental-implementation` for multi-file changes, `test-driven-development` for behaviour changes, and `git-workflow-and-versioning` for branches and commits. |
| `write` | Draft or revise prose only. Use `anti-ai-style`; also use `castellano-peninsular` for Spanish. Do not edit code unless the user explicitly changes scope. |
| `review` | Review diffs or fragments. Lead with findings by severity, cite file and line, and avoid rewriting unless asked. Apply `code-review-and-quality`. |
| `security` | Audit secrets, permissions, dependencies, external input, auth, storage and logs. Apply `security-and-hardening`; return `CLEAR` only when no issue is found. |
| `docs` | Update durable documentation after a change. Apply `documentation-and-adrs`; match the language of the file being edited. |
| `state` | Produce a short factual snapshot: branch, dirty files, latest commits, active `.ai/tasks/*` artifacts, and likely next step. Do not analyse quality. |
| `maths` | Verify formulas or symbolic reasoning with a suitable local tool. Persist nothing unless the user asks. |

### Command equivalents

OpenCode slash commands are not portable as Codex slash commands. Interpret the
same names in natural language as follows:

- `/setup`: inspect the project stack, ensure `AGENTS.md` names relevant commands
  and boundaries, confirm shared skills are referenced from `~/.agents/skills/`,
  and recommend `.ai/tmp/` in `.gitignore` if missing.
- `/super-git`: manage the full non-destructive Git lifecycle autonomously:
  inspect state, fetch, fast-forward the default branch when safe, create or
  reuse a task-named branch, split changes into atomic Conventional Commits, run
  verification and secret checks, push the feature branch, and open or report the
  PR. Treat `/super-git` as consent to push and create the PR, but not as consent
  to force-push, reset, clean, discard changes, rewrite published history, push
  to the default branch, stage suspected secrets, or change Git identity.
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

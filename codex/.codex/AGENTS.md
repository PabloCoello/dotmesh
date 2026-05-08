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

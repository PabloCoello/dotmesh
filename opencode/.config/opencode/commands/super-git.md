---
description: Group working tree changes into semantic, reviewable commits.
agent: build
---

Group the current working tree into coherent atomic commits, using Conventional Commits messages and asking the user to confirm each commit before it is created.

## Steps

1. Inspect all pending changes:
   - `git status --short`
   - `git diff`
   - `git diff --staged`
   - `git ls-files --others --exclude-standard`
2. If there are no staged, unstaged, or untracked changes, stop and report that there is nothing to commit.
3. Apply the `git-workflow-and-versioning` skill to analyze the full working tree.
4. Build a commit plan that groups changes by coherent intent. Include staged, unstaged, and untracked files.
5. Propose only the next commit to the user. Show:
   - files or hunks to include,
   - files or hunks to leave out,
   - commit intent,
   - Conventional Commits type and scope,
   - generated commit message.
6. Ask the user to confirm before preparing that commit. Do not create a commit without explicit confirmation.
7. Prepare only the confirmed group:
   - use `git add -- <path>` when the whole file belongs to the group,
   - use `git add -p -- <path>` when only selected hunks belong to the group,
   - for untracked files, prefer staging the whole file only when it belongs entirely to the group,
   - if an untracked file needs hunk-level review, ask the user before using `git add -N -- <path>` followed by `git add -p -- <path>`, then verify with `git diff --cached -- <path>`.
8. If existing staged changes are not part of the confirmed group, ask before unstaging them. Use `git restore --staged -- <path>` only after confirmation. Preserve the worktree content.
9. Run `git diff --check --cached`. If it fails, stop, show the error, and do not commit.
10. Run `git diff --cached` and verify that the prepared diff contains only the confirmed group.
11. Run `git commit -m "<generated message>"`. Do not open an editor.
12. After the commit, run `git status --short`. If changes remain, repeat from step 4. Stop when the working tree is clean or when the user chooses to stop.
13. Do not push.

## Grouping rules

Create the smallest useful commit that leaves the repository in a coherent state.

Prefer separate commits when changes differ by:

- intent: feature, fix, refactor, docs, tests, build, data, or analysis,
- scope: different tools, packages, commands, agents, skills, or docs areas,
- dependency: one change can be reviewed or reverted without the other,
- risk: secret-prone or local-environment files should not be mixed with general config,
- file role: implementation, tests, documentation, generated files, or lockfiles.

Keep changes together when splitting would leave either commit misleading or broken. If changes are ambiguous or inseparable, propose a broader commit with a body explaining why the group cannot be split cleanly.

Before each commit, state what remains uncommitted. If any untracked file looks like it could contain secrets, credentials, local hostnames, caches, or machine-specific state, do not stage it unless the user explicitly confirms.

Do not use destructive commands such as `git reset --hard`, `git clean -fd`, or `git checkout -- <path>` unless the user explicitly requests them. Do not change Git config.

## Commit Message Convention

All commit messages MUST follow Conventional Commits format. Apply the convention independently to each proposed group.

### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Required Types

- `feat`: new feature (increments MINOR version)
- `fix`: bug fix (increments PATCH version)
- `docs`: documentation changes only
- `refactor`: code refactoring without functionality change
- `test`: add or modify tests
- `chore`: build, CI/CD, dependencies
- `experiment`: experimental design or protocol changes
- `analysis`: statistical analysis or analytical workflow changes
- `data`: data management, cleaning, anonymization, or dataset changes

### Rules

1. Use imperative mood: "add" not "added".
2. No capitalization of description.
3. No period at end.
4. Max 72 characters for first line.
5. Always include scope when possible: `feat(api):`, `fix(docker):`, `docs(readme):`.
6. Do not add LLM/agent attribution. Never include `Co-authored-by`, `Author`,
   `Signed-off-by`, `Generated-by`, "generated with", "authored by AI", or
   similar trailers/text for Codex, Claude, OpenCode, Copilot, ChatGPT, OpenAI
   or any other model/vendor unless the user explicitly asks for that exact
   attribution.
7. Do not change Git identity to an AI identity. Use the configured `user.name`
   and `user.email` as-is.

### Examples

```
feat(api): add authentication endpoint with JWT tokens
fix(docker): correct port mapping in docker-compose.yml
docs(setup): update Python version requirements to 3.11
test(integration): add tests for API error handling
chore(deps): upgrade pytest to 8.0.0
experiment(protocol): update participant randomization algorithm
```

### Breaking Changes

Add `!` after scope or include a `BREAKING CHANGE:` footer:

```
feat(api)!: redesign authentication to use OAuth2

BREAKING CHANGE: JWT token format changed. All clients must update.
Migration: Use new /auth/oauth2/token endpoint instead of /auth/token
```

## Selection of type

Choose the type by inspecting the diff:
- New behavior or new public surface → `feat`.
- Defect correction with no behavior change beyond the fix → `fix`.
- Only files under `docs/`, `README*`, or comment-only changes → `docs`.
- Internal restructuring with identical external behavior → `refactor`.
- Only test files → `test`.
- Only `package.json`, `requirements.txt`, lockfiles, CI configs, build scripts → `chore`.
- Files under experiment/protocol directories → `experiment`.
- Files under analysis/stats directories → `analysis`.
- Files under data/ directories or anonymization scripts → `data`.

When a commit group spans multiple types, pick the dominant one and mention secondary changes in the body. If the span is too broad to explain clearly, split the group before committing.

## Confirmation format

Before staging each group, ask for confirmation with a concise plan:

```text
Proposed commit 1/N
Message: <type>(<scope>): <description>

Include:
- <path or hunk summary>

Leave out:
- <path or hunk summary>

Verification before commit:
- git diff --check --cached

Proceed with this commit?
```

If the user declines, ask whether to revise the group, skip it, or stop.

---
description: Autonomously manage the Git lifecycle from sync and branch setup through atomic commits, push, and PR.
---

Manage the current worktree through the full Git lifecycle: synchronize with the remote, create or reuse a correctly named branch, split changes into semantic commits, push, and open a pull request with a useful description.

`/super-git` is explicit consent to perform non-destructive Git operations and remote publication for the current repository. Still stop for destructive operations, ambiguous staging, secrets, conflicts, divergent history, or force-push needs.

## Lifecycle

1. Inspect repository state:
   - `git status --branch --short`
   - `git remote -v`
   - `git branch --show-current`
   - `git log --oneline --decorate -5`
   - `git diff`
   - `git diff --staged`
   - `git ls-files --others --exclude-standard`
2. Determine the default base branch from `origin/HEAD`; use `main` only when that cannot be resolved and `origin/main` exists.
3. Run `git fetch --prune origin`.
4. If on the default branch and clean, update with `git merge --ff-only origin/<base>`.
5. If on the default branch with local changes, create a feature branch before committing. Do not stash unless needed to protect work, and immediately apply the stash after switching.
6. If on a feature branch, keep it unless its name violates the branch naming rules. If the branch is unpushed and badly named, rename it.
7. Inspect all pending changes and group them into atomic commits.
8. Stage and commit each group autonomously when the grouping is clear.
9. Run verification before each commit and before PR creation.
10. Push the branch with upstream tracking: `git push -u origin <branch>`.
11. Open a PR with `gh pr create --base <base> --head <branch> --title ... --body ...`.
12. Report the branch, commits, PR URL, verification, and anything left uncommitted.

## Branch naming

Use this format:

```text
<type>/<short-slug>
```

Allowed types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `experiment`, `analysis`, `data`.

Rules:

- Derive `<type>` from the dominant change or the requested task.
- Use a lowercase ASCII slug with hyphens, 3-6 meaningful words when possible.
- Include issue keys only when they already exist in the user request or branch context.
- Do not include model, vendor, assistant, or agent names such as `codex`, `claude`, `opencode`, `copilot`, `openai`, `chatgpt`, or `llm`.
- Keep existing human-created branch names when they are descriptive and not tied to an AI tool.

Examples:

```text
docs/git-autonomous-pr-flow
fix/github-token-env
chore/update-agent-prompts
feat/choice-session-protocol
```

## Commit grouping

Create the smallest useful commit that leaves the repository coherent.

Prefer separate commits when changes differ by:

- intent: feature, fix, refactor, docs, tests, build, data, or analysis;
- scope: different tools, packages, commands, agents, skills, docs areas, or products;
- dependency: one change can be reviewed or reverted without the other;
- risk: secret-prone or local-environment files should not be mixed with general config;
- file role: implementation, tests, documentation, generated files, or lockfiles.

Keep changes together when splitting would leave either commit misleading or broken.

Stop and ask before staging when:

- a file or hunk could belong to more than one commit;
- an untracked file may contain secrets, credentials, local paths, caches, or machine state;
- existing staged changes do not match the proposed group;
- staging requires interactive hunk choices that cannot be made confidently.

## Commit message convention

All commit messages must follow Conventional Commits:

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Required types:

- `feat`: new feature.
- `fix`: bug fix.
- `docs`: documentation only.
- `refactor`: internal restructuring without behaviour change.
- `test`: add or modify tests.
- `chore`: tooling, dependencies, config, or maintenance.
- `experiment`: experimental design or protocol changes.
- `analysis`: statistical or analytical workflow changes.
- `data`: data management, cleaning, anonymization, or dataset changes.

Rules:

1. Use imperative mood: "add" not "added".
2. No capitalization of description.
3. No period at end.
4. Max 72 characters for first line.
5. Include scope when useful: `feat(api):`, `fix(docker):`, `docs(readme):`.
6. Explain why in the body when the first line is not enough.
7. Do not add LLM/agent attribution. Never include `Co-authored-by`, `Author`,
   `Signed-off-by`, `Generated-by`, "generated with", "authored by AI", or
   similar trailers/text for Codex, Claude, OpenCode, Copilot, ChatGPT, OpenAI
   or any other model/vendor unless the user explicitly asks for that exact
   attribution.
8. Do not change Git identity to an AI identity. Use the configured `user.name`
   and `user.email` as-is.

## Verification

Always run:

```bash
git diff --check --cached
```

Also run the repo's documented verification commands when available. For this dotfiles repository, run:

```bash
make health
```

Before committing, inspect the staged diff and scan it for secrets:

```bash
git diff --cached
git diff --cached | rg -i "password|secret|api[_-]?key|token|github_pat|ghp_"
```

If the secret scan matches only placeholder names, environment variable names, or documentation examples, continue and mention that in the final report. If it looks like a real secret, stop.

## Push and PR

Push only the current feature branch. Never push directly to the default branch.

Do not use `--force`, `--force-with-lease`, `git reset --hard`, `git clean`, or destructive checkout/restore operations unless the user explicitly asks.

Before opening a PR:

1. Confirm the branch is pushed and tracks `origin/<branch>`.
2. Check whether a PR already exists for the branch.
3. If no PR exists, create one.
4. If a PR exists, report its URL instead of creating a duplicate.

PR title:

- Use a concise human-facing title.
- Prefer the dominant commit intent, but do not mechanically copy a low-level commit title if the PR spans several commits.
- Do not include LLM/agent attribution.

PR body:

```markdown
## Summary
- ...

## Verification
- ...

## Notes
- ...
```

Omit `## Notes` if there is nothing useful to say. Include risk, migration, pending work, or manual steps there when relevant.

## Final report

End with:

- branch name;
- PR URL, if opened or already present;
- commits created;
- verification run;
- remaining uncommitted changes, if any;
- any operation that was intentionally skipped and why.

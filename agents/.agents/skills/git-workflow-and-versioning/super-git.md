# Autonomous Git lifecycle (`/super-git`)

The ten steps of the full non-destructive lifecycle, what an explicit request
does and does not authorize, and the list of things to stop and ask about. Open
this file when the user asks for `/super-git`, "ship this" or an equivalent.

---

## Autonomous Git Lifecycle

When the user asks for autonomous Git handling, `/super-git`, "ship this",
"open a PR", or equivalent, manage the full non-destructive lifecycle:

1. Inspect local state: branch, remotes, staged/unstaged/untracked changes,
   recent commits.
2. Fetch remote refs with pruning.
3. Fast-forward the default branch when you are on it and the worktree is clean.
4. Create or reuse a branch whose name describes the task, not the AI tool.
5. Prefer incremental work: define one semantic slice, edit only that slice,
   verify it, commit it, then start the next slice.
6. If invoked after changes already exist, split the dirty worktree into atomic
   Conventional Commits only when the grouping is clear.
7. Run verification and secret checks before each commit.
8. Push the feature branch with upstream tracking.
9. Open a pull request, or report the existing PR for the branch.
10. Report branch, commits, PR URL, verification and any remaining changes.

`/super-git` or an equivalent explicit request is consent to push the current
feature branch and create a PR. It is not consent to force-push, reset, clean,
discard changes, rewrite published history, push to the default branch, or stage
suspected secrets.

The preferred mode is proactive, not retrospective. Use Git commits as
checkpoints while implementing. Large after-the-fact diffs are a recovery path:
make coarse but honest commits when the intent is clear, and ask before
inventing fine-grained history from tangled edits.

Stop and ask before:

- destructive commands (`git reset --hard`, `git clean`, destructive checkout/restore);
- force-push or history rewrite;
- resolving merge/rebase conflicts;
- staging ambiguous hunks or suspicious untracked files;
- splitting a large dirty worktree whose semantic boundaries are unclear;
- continuing after a non-fast-forward push rejection;
- changing Git identity or credential configuration.

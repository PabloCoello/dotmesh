---
name: git-workflow-and-versioning
description: Structures git workflow practices. Use when making any code change. Use when committing, branching, resolving conflicts, or when you need to organize work across multiple parallel streams.
---

# Git Workflow and Versioning

## Overview

Git is your safety net. Treat commits as save points, branches as sandboxes, and history as documentation. With AI agents generating code at high speed, disciplined version control is the mechanism that keeps changes manageable, reviewable, and reversible.

## When to Use

Always. Every code change flows through git.

## Rules that hold in every change

These apply whichever file you open next. The files below carry the detail and the examples.

1. **No AI authorship in Git metadata.** No `Co-authored-by`, `Author`, `Signed-off-by`, `Generated-by` or "generated with" for any model or agent, no model name in the branch slug, and never change `user.name`/`user.email` — unless the user explicitly asks for that exact attribution.
2. **Commit each verified increment.** Implement a slice, test it, commit it. Large uncommitted changes are lost work waiting to happen.
3. **One logical thing per commit.** Do not mix formatting with behaviour, or a refactor with a feature.
4. **The message explains the why**, in `<type>: <short description>` form, with the body for intent rather than a retelling of the diff.
5. **Work on a short-lived branch** taken from the default branch, merged within days, never committed to directly.
6. **Push and PR only when the user asks.** An explicit request covers push and PR, nothing else.
7. **Stop and ask** before anything destructive or ambiguous: `reset --hard`, `clean`, destructive checkout/restore, force-push or history rewrite, merge and rebase conflicts, staging ambiguous hunks or suspicious untracked files, a non-fast-forward rejection, or changing Git identity.
8. **No secrets in the diff.** Check the staged diff before every commit.

## Files

| File | When to open it |
|---|---|
| [`commit-discipline.md`](commit-discipline.md) | Committing or splitting what you have: trunk-based development, commit frequency, atomicity, message format with the list of commit types, the AI-attribution ban in full, separated concerns, change size |
| [`branches-and-worktrees.md`](branches-and-worktrees.md) | Creating a branch or a second tree: branching strategy, naming scheme with its allowed prefixes, worktrees for parallel work |
| [`super-git.md`](super-git.md) | The user asked for `/super-git`, "ship this" or an equivalent, or you hit something the index says to stop at: the ten steps of the lifecycle, what it authorizes, and the stop-and-ask list in full — merge and rebase conflicts included |
| [`working-with-history.md`](working-with-history.md) | While implementing or reporting: commits as save points, the change summary with its "didn't touch" section, bisect, blame and log for finding a regression |
| [`pre-commit-hygiene.md`](pre-commit-hygiene.md) | Right before staging: the pre-commit checks, automating them with hooks, which generated files belong in the repository |
| [`rationalizations-and-checks.md`](rationalizations-and-checks.md) | Closing the work: common rationalizations, red flags, and the per-commit verification list |

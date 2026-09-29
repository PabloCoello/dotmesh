# Branches and worktrees

Where the work lives: branching strategy, the naming scheme and its allowed
prefixes, and worktrees for parallel branches. Open this file before creating a
branch or setting up a second tree.

---

## Branching Strategy

### Feature Branches

```
main (always deployable)
  │
  ├── feat/task-creation       ← One feature per branch
  ├── feat/user-settings       ← Parallel work
  └── fix/duplicate-tasks      ← Bug fixes
```

- Branch from `main` (or the team's default branch)
- Keep branches short-lived (merge within 1-3 days) — long-lived branches are hidden costs
- Delete branches after merge
- Prefer feature flags over long-lived branches for incomplete features

### Branch Naming

```
feat/<short-description>       → feat/task-creation
fix/<short-description>        → fix/duplicate-tasks
docs/<short-description>       → docs/api-contract
chore/<short-description>      → chore/update-deps
refactor/<short-description>   → refactor/auth-module
```

Allowed branch prefixes mirror commit types: `feat`, `fix`, `docs`, `refactor`,
`test`, `chore`, `experiment`, `analysis`, and `data`.

## Working with Worktrees

For parallel AI agent work, use git worktrees to run multiple branches simultaneously:

```bash
# Create a worktree for a feature branch
git worktree add ../project-feature-a feat/task-creation
git worktree add ../project-feature-b feat/user-settings

# Each worktree is a separate directory with its own branch
# Agents can work in parallel without interfering
ls ../
  project/              ← main branch
  project-feature-a/    ← task-creation branch
  project-feature-b/    ← user-settings branch

# When done, merge and clean up
git worktree remove ../project-feature-a
```

Benefits:
- Multiple agents can work on different features simultaneously
- No branch switching needed (each directory has its own branch)
- If one experiment fails, delete the worktree — nothing is lost
- Changes are isolated until explicitly merged

---
description: Lanza review y security en paralelo sobre el último diff.
agent: build
---

Over the output of `git diff` (uncommitted changes):

1. Invoke the `review` subagent in parallel with the `security` subagent.
2. If both return OK/CLEAR, say "Ready to commit".
3. If there are blocking issues, list them grouped by subagent and wait for the user's decision.
4. Do not commit. That is `/super-git`.

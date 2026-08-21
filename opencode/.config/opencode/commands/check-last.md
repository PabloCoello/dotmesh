---
description: Lanza review y security en paralelo sobre el último diff.
agent: maker
---

Over the output of `git diff` (uncommitted changes):

1. Invoke the `review` subagent in parallel with the `security` subagent.
2. If both return OK/CLEAR, say "Ready to commit".
3. If there are blocking issues that need a human decision, list them grouped by subagent, load `wait-for-user`, and ask one closed native `question` because this command runs with `maker`. If `question` is unavailable, emit `WAIT_FOR_USER: choose whether to fix the blocking review/security issues now or stop before committing` and stop.
4. Do not commit. That is `/super-git`.
5. Do not loop, rerun the gates, or call more tools after asking until the user answers.

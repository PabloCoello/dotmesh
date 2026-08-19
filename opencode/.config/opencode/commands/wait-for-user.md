---
description: Stop the current task and ask for one human decision before using more tools.
agent: maker
---

Load the `wait-for-user` skill and stop for a human decision.

Use the native OpenCode `question` tool when it is available. Ask one closed question, put the recommended option first, and do not request or reveal secrets. After calling `question`, do not call any other tool until the user answers.

If the native tool is not available, emit exactly one line in this form and stop:

```text
WAIT_FOR_USER: <concrete decision>
```

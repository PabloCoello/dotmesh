---
name: wait-for-user
description: Stop agent work until a human gives a closed decision. Use when a task is blocked on human choice, approval, credentials, destructive action, ambiguous scope, or review/security findings. In OpenCode, prefer the native question tool; elsewhere emit WAIT_FOR_USER: <concrete decision> and stop.
---

# wait-for-user

Stop work when the next safe action depends on a human decision. Do not keep using tools while waiting.

## Contract

Use this exact line when a native blocking question is not available:

```text
WAIT_FOR_USER: <concrete decision>
```

The decision must be closed and actionable, for example:

```text
WAIT_FOR_USER: choose whether to keep the broader commit or split the ambiguous staging manually
```

## When to use

- Scope or requirements are ambiguous enough that implementation would be guessing.
- A destructive or high-blast-radius action needs explicit approval.
- A review, security, maths, or editor pass returns a blocking issue and the next step is a human choice.
- A needed secret, credential, private URL, or local account setup is missing.
- A subagent, herdr pane, Claude, Codex, or another tool cannot ask a native blocking question.

## OpenCode path

If you are the active OpenCode agent and have the `question` tool available:

1. Ask one closed question with the `question` tool.
2. Make the recommended option first and label it `(Recommended)`.
3. Keep options short and specific.
4. Do not request or display secrets. Ask the user to configure secrets out of band, then answer when done.
5. After calling `question`, wait for the tool result. Do not call any other tool until the user answers.

## Text-only path

If a native blocking question is not available, or you are inside a subagent or external orchestrator:

1. Emit exactly one `WAIT_FOR_USER: <concrete decision>` line.
2. Immediately stop your turn.
3. Do not call more tools, spawn agents, poll, sleep, watch files, or continue with assumptions.
4. Resume only after the human answers in the conversation or the orchestrator passes the answer back.

## Question shape

A valid wait request:

- asks for one decision, not a list of open-ended questions;
- includes enough context to answer without reading logs;
- offers closed choices when the UI supports them;
- states what will happen after each choice;
- contains no secrets, tokens, private credentials, cookies, or key material.

Bad:

```text
WAIT_FOR_USER: what should I do?
```

Good:

```text
WAIT_FOR_USER: choose whether to proceed with the safe read-only audit or stop until production credentials are configured outside this chat
```

## Verification

- [ ] The wait asks for exactly one concrete decision.
- [ ] OpenCode used `question` when available.
- [ ] Non-OpenCode or subagent flows emitted `WAIT_FOR_USER: ...` and stopped.
- [ ] No tool calls happen after the wait request until the human answers.
- [ ] No secrets are requested, printed, committed, or logged.

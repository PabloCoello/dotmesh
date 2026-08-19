---
name: tool-error-recovery
description: Handles failed tool calls safely. Use when a tool, command, MCP call, filesystem operation, network request, or agent action fails and you are considering a retry or recovery step.
---

# Tool error recovery

## Rule

Retry only when the failed operation is a clearly idempotent read and the failure looks transient. Make at most one retry.

Never retry writes, destructive Git or Stow operations, authenticated network calls, or mutable MCP calls. Stop after a repeated failure.

## Retry matrix

| Operation | Retry budget | Examples |
|---|---:|---|
| Clearly idempotent local reads | 1 | Read, Glob, Grep, `git status`, `git diff`, `git log`, directory listing |
| Public unauthenticated read-only network fetches | 1 | Public docs fetch that timed out before returning data |
| Writes or edits | 0 | Edit, Write, ApplyPatch, file moves, generated output |
| Git or Stow operations that can change state | 0 | commit, checkout, merge, rebase, push, reset, clean, stow, unstow, restow |
| Authenticated network calls | 0 | GitHub, Notion, private APIs, token-backed HTTP |
| Mutable MCP calls | 0 | create, update, delete, move, comment, issue, PR, database mutation |
| Ambiguous operations | 0 | Any operation where idempotence or side effects are unclear |

## Required recovery record

When reporting or handing off a failed tool call, preserve enough evidence to debug without leaking secrets:

- tool or command name;
- attempt count;
- exit code, status, or exception class;
- a short stderr/error summary, redacted if it may contain secrets or personal data;
- the decision taken: retry once, stop, or ask the user.

Summarise stderr. Keep the first relevant line and the final cause when useful. Do not paste huge logs, tokens, cookies, request headers, or full private paths unless needed for diagnosis.

## Procedure

1. Classify the failed operation with the matrix above.
2. If it is eligible, retry once with the same scope or a narrower read-only scope.
3. If the retry also fails, stop. Keep the error summary and ask the user or choose a different non-destructive diagnostic path.
4. If it is not eligible, do not retry. Report the preserved error context and stop before changing state.
5. Do not use `wait-for-user`, `reflect`, or another synthetic tool as a recovery crutch. If user input is needed, ask directly.

## YAGNI boundary

Use the agent's native permissions, sandboxing, approval prompts, and existing guardrails first. Do not add a plugin, hook, wrapper, daemon, or retry framework unless a real missed case proves the instruction-level policy is insufficient.

## Verification

- [ ] No operation received more than one retry.
- [ ] Only clearly idempotent reads were retried.
- [ ] State-changing, authenticated, destructive, and ambiguous operations were not retried.
- [ ] Exit/status and stderr/error summaries were preserved and redacted.
- [ ] The agent stopped after a repeated failure.

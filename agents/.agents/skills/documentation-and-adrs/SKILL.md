---
name: documentation-and-adrs
description: Documents durable decisions and context. Use when making architecture or tooling decisions, changing interfaces, adding conventions, or recording knowledge future humans or agents will need.
---

# Documentation and ADRs

## Overview

Document the why, not the obvious what. Good documentation preserves decisions, constraints, trade-offs, commands and gotchas that code alone does not explain.

## When to Use

- Choosing between technical approaches.
- Changing public interfaces, commands, config formats or workflows.
- Adding conventions that agents should follow later.
- Repeating the same explanation in multiple sessions.
- Discovering a non-obvious gotcha while implementing or debugging.

## What to Document

- Decision and date.
- Context and constraints.
- Alternatives considered.
- Chosen approach and rationale.
- Consequences, trade-offs and follow-up work.
- Verification or operational commands.

## ADR-lite template

Use this for decisions that are worth remembering but do not need a heavy process:

```markdown
# ADR-000: [decision]

## Status
Accepted

## Context
[What problem or constraint forced a decision?]

## Decision
[What did we choose?]

## Alternatives considered
- [Alternative] — [why not]

## Consequences
- [Positive or negative consequence]
- [Follow-up or maintenance note]
```

## Inline documentation

Comment surprising intent, constraints or risks. Do not comment code that already explains itself.

Good comments answer:

- why this ordering matters;
- what invariant must be preserved;
- why a boring-looking workaround exists;
- where to find the broader decision.

## Agent-facing documentation

Rules files such as `AGENTS.md`, command docs and skill indexes are part of the operating system for agents. Update them when a convention changes.

## Red Flags

- A decision that will matter later exists only in chat history.
- Documentation restates code but omits rationale.
- Commands in docs are incomplete or not executable.
- TODO comments hide work that should be tracked or done now.
- Agent instructions contradict the repository structure.

## Verification

- [ ] The decision or rule is documented in the right place.
- [ ] The document explains why, not just what.
- [ ] Alternatives or trade-offs are recorded when relevant.
- [ ] Commands and paths are accurate.
- [ ] Agent-facing rules match the current setup.

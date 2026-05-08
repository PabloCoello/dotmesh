---
name: idea-refine
description: Refines vague ideas before planning or implementation. Use when the user has a rough concept, competing options, an unclear problem, or asks to ideate, stress-test, or choose a direction.
---

# Idea Refine

## Overview

Turn a rough idea into a concrete direction. Separate exploration from planning: first clarify the problem, then compare options, then choose a next step.

## When to Use

- The user brings an idea but not clear requirements.
- There are several possible directions and no decision criteria.
- The user asks to brainstorm, ideate or stress-test.
- A feature request sounds like a solution without a defined problem.
- Implementation would be premature.

## Process

### 1. Restate the problem

Convert the idea into a crisp problem statement:

```text
How might we [achieve outcome] for [user/context] under [constraint]?
```

If the user, outcome or constraint is unknown, ask before continuing.

### 2. Ask only the questions that matter

Ask up to five focused questions. Prioritise:

- who this is for;
- what success looks like;
- what constraints matter;
- what has already been tried;
- what must not change.

### 3. Generate distinct options

Offer 3-5 meaningfully different directions. For each, include:

- what it is;
- why it may work;
- main downside;
- when to choose it.

Do not produce a long list of shallow ideas.

### 4. Stress-test

For the strongest options, surface:

- assumptions that must be true;
- what could make the option fail;
- cost or complexity;
- simplest validation step.

Be useful, not agreeable. Push back when an idea is unclear, too broad or not tied to a real problem.

### 5. Converge

End with one of:

- recommended direction;
- shortlist with decision criteria;
- questions that must be answered before spec;
- a one-page brief if the user wants an artefact.

## One-page brief template

```markdown
# [Idea]

## Problem
[Who has what problem?]

## Recommended direction
[What to do and why.]

## Assumptions to validate
- [ ] [Assumption] — [how to test]

## Smallest useful version
[What is included.]

## Not doing
- [Thing] — [reason]

## Next step
[Spec, prototype, research, decision, or stop.]
```

Only save a brief to disk after user confirmation.

## Red Flags

- Jumping straight to implementation.
- Asking many generic questions instead of the few that change the decision.
- Generating options that are just wording variants.
- Avoiding pushback on weak assumptions.
- Producing a plan without naming what is not being done.

## Verification

- [ ] The problem, user and success criteria are clear or explicitly unknown.
- [ ] Multiple distinct directions were considered.
- [ ] Assumptions and failure modes were named.
- [ ] A recommended next step or decision point exists.
- [ ] No implementation started during ideation.

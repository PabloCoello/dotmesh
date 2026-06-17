---
name: code-simplification
description: Simplifies working code without changing behaviour. Use after code works but is harder to read, test, review, or maintain than necessary, or when reviewing avoidable complexity.
---

# Code Simplification

## Overview

Simplify expression, not behaviour. The goal is easier understanding, smaller blast radius and lower maintenance cost, not fewer lines at any price.

The cheapest code to maintain is the code that never exists. This skill mostly simplifies code that already works, but the same instinct applies one step earlier — before writing. When you are about to add code, walk the gate below first.

## Don't write it in the first place

Before adding code, walk this decision hierarchy and stop at the first step that resolves the need:

1. **Does it need to exist?** Confirm a real, current requirement — not a speculative one. If nothing breaks without it, do not write it.
2. **Does the standard library cover it?** Prefer stdlib over a hand-rolled implementation.
3. **Does the platform or runtime already do it?** Native features beat reimplementations.
4. **Does an existing dependency already cover it?** Reuse before adding a new dependency.
5. **Only then, write the minimum viable solution** — no wrappers, options, or abstractions without a present caller.

Apply this as a lightweight gate when reviewing your own or another agent's new code, not as a reason to rewrite working code that predates it.

<!-- Decision hierarchy adapted from the ponytail YAGNI ruleset (DietrichGebert/ponytail, MIT). -->

## When to Use

- A feature works but the implementation feels heavy.
- Review flags nested logic, unclear names, duplication or premature abstraction.
- Refactoring is explicitly requested.
- A script, config or module is hard to modify safely.

## When Not to Use

- You do not understand the current behaviour.
- The code is outside the task scope.
- Tests or verification are missing and behaviour is risky to infer.
- The simplification would mix with a feature or bug fix that should stay separate.

## Principles

1. The best simplification is code never written — walk the gate above before adding.
2. Preserve behaviour exactly.
3. Understand before changing.
4. Prefer clarity over cleverness.
5. Keep changes scoped and reviewable.
6. Verify after each meaningful simplification.

## Process

### 1. Understand the fence

Before removing or changing something, identify why it may exist:

- callers and side effects;
- edge cases and error paths;
- tests and documented behaviour;
- platform or compatibility constraints;
- historical context if available.

### 2. Pick one simplification type

Use one category at a time:

- replace deep nesting with guard clauses;
- rename unclear identifiers;
- remove duplicated logic;
- delete confirmed dead code;
- inline wrappers that add no meaning;
- split long functions by responsibility;
- replace speculative abstraction with direct code.

### 3. Keep the diff small

Do not combine broad formatting, unrelated cleanup and behavioural changes. If a simplification touches many files, propose a separate plan.

### 4. Verify unchanged behaviour

Run existing tests or a targeted command. If no tests exist, state the manual check used and the remaining risk.

## Red Flags

- Updating tests only because the simplified code changed behaviour.
- Removing error handling to make code shorter.
- Renaming or restyling unrelated files.
- Introducing a new abstraction for a single use.
- Adding a dependency for what stdlib, the platform or an existing dependency already covers.
- Claiming simplification without a verification step.

## Verification

- [ ] Behaviour, inputs, outputs and side effects are unchanged.
- [ ] The diff is scoped to the simplification.
- [ ] Existing tests or targeted checks pass.
- [ ] The result follows project conventions.
- [ ] No error handling or security checks were weakened.

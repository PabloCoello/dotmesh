---
name: code-simplification
description: Simplifies working code without changing behaviour. Use after code works but is harder to read, test, review, or maintain than necessary, or when reviewing avoidable complexity.
---

# Code Simplification

## Overview

Simplify expression, not behaviour. The goal is easier understanding, smaller blast radius and lower maintenance cost, not fewer lines at any price.

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

1. Preserve behaviour exactly.
2. Understand before changing.
3. Prefer clarity over cleverness.
4. Keep changes scoped and reviewable.
5. Verify after each meaningful simplification.

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
- Claiming simplification without a verification step.

## Verification

- [ ] Behaviour, inputs, outputs and side effects are unchanged.
- [ ] The diff is scoped to the simplification.
- [ ] Existing tests or targeted checks pass.
- [ ] The result follows project conventions.
- [ ] No error handling or security checks were weakened.

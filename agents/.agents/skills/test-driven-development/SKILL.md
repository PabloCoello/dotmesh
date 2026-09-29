---
name: test-driven-development
description: Drives development with tests. Use when implementing any logic, fixing any bug, or changing any behavior. Use when you need to prove that code works, when a bug report arrives, or when you're about to modify existing functionality.
---

# Test-Driven Development

## Overview

Write a failing test before writing the code that makes it pass. For bug fixes, reproduce the bug with a test before attempting a fix. Tests are proof — "seems right" is not done. A codebase with good tests is an AI agent's superpower; a codebase without tests is a liability.

## When to Use

- Implementing any new logic or behavior
- Fixing any bug (the Prove-It Pattern)
- Modifying existing functionality
- Adding edge case handling
- Any change that could break existing behavior

**When NOT to use:** Pure configuration changes, documentation updates, or static content changes that have no behavioral impact.

## The TDD Cycle

```
    RED                GREEN              REFACTOR
 Write a test    Write minimal code    Clean up the
 that fails  ──→  to make it pass  ──→  implementation  ──→  (repeat)
      │                  │                    │
      ▼                  ▼                    ▼
   Test FAILS        Test PASSES         Tests still PASS
```

## Rules that hold in every change

These apply whichever file you open next. The files below carry the detail and the examples.

1. **The test comes first and it has to fail.** A test that passes on its first run proves nothing — it is not testing what you think.
2. **A bug fix starts with a reproduction test.** Do not attempt the fix until a test demonstrates the bug.
3. **Minimum code to go green**, then refactor with the suite green and re-run after every step.
4. **Assert on state, not on interactions.** A test that checks which methods were called breaks on a refactor that changed no behaviour.
5. **Prefer the real implementation** over a fake, a fake over a stub, a stub over a mock. Over-mocking gives a green suite and a broken production.
6. **Never skip, disable or delete a test to make the suite pass.** That is the failure talking.
7. **Run the suite before claiming it works.** "All tests pass" without a run is a red flag, not a result.

## Files

| File | When to open it |
|---|---|
| [`cycle.md`](cycle.md) | Writing the first test of a change: RED/GREEN/REFACTOR worked through, the Prove-It pattern for bugs, delegating the reproduction test to a subagent |
| [`test-pyramid.md`](test-pyramid.md) | Deciding whether a change needs a test at all and of what kind: the Beyonce Rule, pyramid proportions, test sizes by resource, the decision guide |
| [`writing-good-tests.md`](writing-good-tests.md) | Writing the tests: state over interactions, DAMP over DRY, real implementations, arrange-act-assert, one concept per test, naming, anti-patterns |
| [`browser-testing.md`](browser-testing.md) | The change is visible in a browser: DevTools workflow, what to check, and the untrusted-data boundary around anything the page returns |
| [`red-flags-and-checks.md`](red-flags-and-checks.md) | Closing the work: common rationalizations, red flags, and the verification list |

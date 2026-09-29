---
name: code-review-and-quality
description: Conducts multi-axis code review. Use before merging any change. Use when reviewing code written by yourself, another agent, or a human. Use when you need to assess code quality across multiple dimensions before it enters the main branch.
---

# Code Review and Quality

## Overview

Multi-dimensional code review with quality gates. Every change gets reviewed before merge — no exceptions. Review covers five axes: correctness, readability, architecture, security, and performance.

**The approval standard:** Approve a change when it definitely improves overall code health, even if it isn't perfect. Perfect code doesn't exist — the goal is continuous improvement. Don't block a change because it isn't exactly how you would have written it. If it improves the codebase and follows the project's conventions, approve it.

## When to Use

- Before merging any PR or change
- After completing a feature implementation
- When another agent or model produced code you need to evaluate
- When refactoring existing code
- After any bug fix (review both the fix and the regression test)

## Rules that hold in every review

These apply whichever file you open next. The files below carry the detail and the examples.

1. **No change merges unreviewed**, and the review covers the five axes — correctness, readability, architecture, security, performance — not just whether the tests pass.
2. **Understand the intent before reading the code, and review the tests first.** They state what the change claims to do.
3. **Label every comment with its severity:** `**Critical:**` blocks the merge, *no prefix* is a required change, `**Nit:**` is minor, `**Optional:** / **Consider:**` is a suggestion, `**FYI**` needs no action. Unlabelled feedback reads as mandatory, and the author spends time on suggestions you meant as optional.
4. **Don't rubber-stamp and don't soften.** "LGTM" with no evidence of a review helps no one, and a bug described as a minor concern is dishonest. Quantify the problem, and comment on the code rather than the person.
5. **A change beyond ~1000 lines gets split, not reviewed in one block**, and a refactor bundled with a feature is two changes.
6. **List the dead code the change orphaned, and ask before deleting it.** Leaving it in place is not the alternative.
7. **Every dependency is a liability.** Before accepting a new one: what the existing stack already covers, its size, its maintenance, its vulnerabilities, its licence.
8. **Don't accept "I'll clean it up later."** Require the cleanup before merge, or a filed bug with an owner.

## Files

| File | When to open it |
|---|---|
| [`five-axis.md`](five-axis.md) | Walking through the code: correctness, readability and simplicity, architecture, security and performance, with the questions each axis asks |
| [`review-process.md`](review-process.md) | Starting a pass: the five steps from intent to verification story, the severity labels, the multi-model pattern, the expected cadence |
| [`change-sizing.md`](change-sizing.md) | The diff looks large, or you are writing the description: target sizes, the four splitting strategies, what the message has to carry |
| [`dead-code-and-dependencies.md`](dead-code-and-dependencies.md) | After a refactor, or when the diff adds a dependency: orphaned-code hygiene and the five questions before taking one on |
| [`disagreements-and-honesty.md`](disagreements-and-honesty.md) | The author pushes back, or you are tempted to soften a finding: the resolution hierarchy and the standard a comment has to meet |
| [`checklist-and-closing.md`](checklist-and-closing.md) | Closing the pass: the checklist template, the common rationalizations, the red flags, and what has to hold before the review is done |

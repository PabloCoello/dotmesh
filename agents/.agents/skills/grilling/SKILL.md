---
name: grilling
description: Interview the user relentlessly about a plan or design until you reach a shared, documented understanding. Use when the user wants to stress-test a plan or requirements before building, or uses any 'grill' / 'grill me' trigger phrase. Also records glossary terms and ADRs when the plan sharpens domain terminology or makes hard-to-reverse decisions.
---

# Grilling

Interview the user relentlessly about every aspect of this plan or design until you reach a shared understanding. Walk down each branch of the decision tree, resolving dependencies between decisions one by one.

## The loop

- **One question at a time.** Ask a single focused question, then wait for the answer before continuing. Asking several at once is bewildering.
- **Always recommend an answer.** For each question, give your own recommended answer and the reason, grounded in what you already know about the codebase and the conversation. The user corrects you; they don't start from a blank page.
- **Prefer the codebase over the user.** If a question can be answered by reading the code, read the code instead of asking.
- **Follow the tree.** Resolve dependencies in order — a decision that constrains later ones comes first. Surface edge cases and hidden assumptions as you go.
- **Hold more than one framing.** Before converging on a part of the design, put at least two distinct approaches on the table and say why you'd pick one. Don't collapse to the first plausible answer.
- **Don't close prematurely.** If the plan is not ripe, say so and keep going. Stop only when every branch is resolved and you can restate the plan back without gaps.

## End state

When the tree is resolved, restate the agreed plan in full and name the next step — typically `spec-driven-development`, `planning-and-task-breakdown`, or starting to build with `incremental-implementation`.

## Output

Conversation only — by default this skill writes no files.

The exception is a plan that introduces or sharpens domain terminology, or makes hard-to-reverse decisions. Then load `domain-modeling` and, as you grill:

- When a term is fuzzy or overloaded, sharpen it and capture it in `CONTEXT.md`.
- When a decision is hard to reverse, surprising without context, and the result of a real trade-off, offer an ADR via `documentation-and-adrs`.

Don't batch — capture terms and decisions the moment they crystallise, not at the end.

## Language

Interview in the language the user writes in. When that is Spanish, load `castellano-peninsular`, and `anti-ai-style` for any prose you produce.

---
Adapted from `grilling` and `grill-with-docs` in [mattpocock/skills](https://github.com/mattpocock/skills) (MIT); the second was a separate skill until 2026-10-04, retired with zero invocations (counted with mirador's `skill_obs.py` over `~/.claude/projects`, 826 transcripts). The "hold more than one framing / don't close prematurely" stance is carried over from the former local `debate` agent, now folded into this skill, `idea-refine`, and the `maker` persona for divergent exploration.

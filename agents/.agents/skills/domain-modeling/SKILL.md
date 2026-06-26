---
name: domain-modeling
description: Build and sharpen a project's domain model (its ubiquitous language). Use when pinning down domain terminology, when another skill needs to maintain CONTEXT.md, or when a fuzzy or overloaded term needs a canonical definition.
---

# Domain Modeling

Actively build and sharpen the project's domain model as you design — the *active* discipline of challenging terms, stress-testing them with edge-case scenarios, and writing the glossary down the moment it crystallises. Merely reading `CONTEXT.md` for vocabulary is a one-line habit any skill can do; this skill is for when you are *changing* the model.

## File structure

**Single context (most repos):** one `CONTEXT.md` at the repo root. ADRs live under `docs/adr/` — see `documentation-and-adrs` for their format.

**Multiple contexts:** a `CONTEXT-MAP.md` at the root points to a per-context `CONTEXT.md` (e.g. `src/ordering/CONTEXT.md`) and describes how the contexts relate. Infer which context the current topic belongs to; if unclear, ask.

Create files lazily — only when you have something to write. If no `CONTEXT.md` exists, create one when the first term is resolved.

## During the session

- **Challenge against the glossary.** When a term conflicts with the existing language in `CONTEXT.md`, call it out: "Your glossary defines X as A, but you seem to mean B — which is it?"
- **Sharpen fuzzy language.** Replace vague or overloaded terms with a precise canonical one. "You say 'account' — Customer or User? Those are different things."
- **Discuss concrete scenarios.** Stress-test relationships with specific edge-case scenarios that force the user to be precise about boundaries between concepts.
- **Cross-reference with code.** If the user's stated model contradicts the code, surface the contradiction.
- **Update CONTEXT.md inline.** Capture each resolved term immediately using `CONTEXT-FORMAT.md`. `CONTEXT.md` is a glossary and nothing else — no implementation details, no spec, no scratch pad.
- **Offer ADRs sparingly.** Only when the decision is (1) hard to reverse, (2) surprising without context, and (3) the result of a real trade-off. If any of the three is missing, skip the ADR. Record it via `documentation-and-adrs`.

## Language

Write `CONTEXT.md` and ADRs in the project's documentation language. For this repository that is peninsular Spanish — load `castellano-peninsular` and `anti-ai-style`.

---
Adapted from `domain-modeling` in [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). ADR format is delegated to the local `documentation-and-adrs` skill instead of duplicating it.

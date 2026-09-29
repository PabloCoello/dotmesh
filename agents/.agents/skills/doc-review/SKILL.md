---
name: doc-review
description: Reads mesh-review V2 event-sourced review threads and acts on a document's open comments. Use when the user wants an AI agent to process review comments anchored to a document, when you find events under `.ai/review/`, or when asked to resolve, address, or work through review comments on a document.
---

# doc-review

Review comments for a document are stored as an **append-only event log** produced by the mesh-review V2 workflow. This skill teaches you to locate the event directory, project the current thread state, act on the document, and close each thread by writing new events. The normative schema for every event is `schema.json` in the same directory as this skill.

The `mesh-review` CLI used throughout this skill ships with it at `bin/mesh-review.mjs`, next to this SKILL.md (after stow: `~/.claude/skills/doc-review/bin/mesh-review.mjs`). It is not on PATH — invoke it as `node <skill-dir>/bin/mesh-review.mjs <subcommand> …`.

---

## Rules that hold in every pass

These apply whichever file you open next. The files below carry the detail.

1. **The log is append-only.** Never edit or delete an event file. A correction is a new event: `message.revised`, `message.retracted`, `thread.reanchored`.
2. **Only the principal edits the document body and commits.** The `reviser` subagent proposes with a `message.posted` carrying `commit: null`; applying the proposal and creating the commit is always the principal's step.
3. **The agent does not resolve threads during a pass.** Accionables are resolved by the human. Anotaciones are durable and are archived to `detached` only when their anchored text disappears.
4. **Never work on the default branch.** Check the branch before touching a file and create a `review/<slug>-<YYYYMMDD>` branch if you are on it.
5. **Edit bottom-to-top.** Process actionable threads in descending `char_offset`, so an edit does not displace the anchors still to be processed.
6. **Never invent an anchor position.** If the quoted text is gone and the location cannot be identified with confidence, emit `thread.reanchored` with `detached: true` and report it.
7. **A thread that changes the document gets its own commit**, made with an explicit pathspec and no LLM attribution in the message.

---

## Files

| File | When to open it |
|---|---|
| [`event-store.md`](event-store.md) | Locating the event directory from a document path, the out-of-repo fallback, legacy V1 detection and migration |
| [`projection.md`](projection.md) | Reading events, sort order, the projection fold and its shape, resolving an anchor against the current text |
| [`pass-flow.md`](pass-flow.md) | Running a pass: comment types, preconditions, branch, order of edits, conflicts, iteration detection, routing to subagents |
| [`closing-a-pass.md`](closing-a-pass.md) | The 5-part response and per-thread log lines, re-anchoring ownership, the predicates a fix event must satisfy |
| [`cli-reference.md`](cli-reference.md) | Running a command: tool requirements and the `open`, `reply`, `resolve`, `retract` and `emit` subcommands with their flags |

The section numbers (§1–§13) are unchanged and live on inside these files, so an
existing reference such as §6.2 still points at the same text.

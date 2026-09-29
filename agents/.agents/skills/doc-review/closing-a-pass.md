# Closing a pass

What the session reports, who updates the anchors afterwards, and the predicates
a fix event has to satisfy to survive projection. Open this file when the edits
are done and the pass has to be written up and closed.

---

## 9. Response contract

Every review session produces a structured response with five parts:

| # | Section | Required | Content |
|---|---|---|---|
| 1 | **Contexto** | always | Document path, number of open threads, current branch, git commit range if available. |
| 2 | **Alcance** | always | Which threads are addressed in this session (IDs and types). |
| 3 | **Supuestos y limitaciones** | conditional | `supuesto`-type threads with their `confidence` and `rationale`. Omit if none. |
| 4 | **Tareas accesorias** | conditional | Work items identified that fall outside the review scope (e.g. TODOs, follow-up spikes). Each is persisted to `<git-root>/.ai/backlog/<id>.json` with fields `{ id, doc, session, author, commit, body }`. Omit if none. |
| 5 | **Preguntas** | always | Open questions for the human that are blocking or significantly affect the review. May be an empty list. |

Sections 1, 2, and 5 are always present. Sections 3 and 4 appear only when they have content.

**Compact response (1–2 threads processed).** Deliver the per-thread log line defined in this section plus one closing sentence. The 5-part structure applies when 3 or more threads are processed, or on explicit request.

After processing each thread, emit a one-line log entry:

> `[<thread_id prefix>]` \<type\> — \<what was done\>. Commit: `<sha>` | No commit.

Use `Commit: <sha>` when the thread produced a commit (including the "already done" case pointing to a previous SHA). Use `No commit` for annotations, conflicts, and unapplied suggestions.

---

## 10. Re-anchoring ownership

Two actors update thread anchors independently; their events compose without conflict:

- **Agent (end of pass):** Run `mesh-review reanchor <doc>` after closing the pass. The CLI re-resolves all open-thread anchors against the current document text and emits `thread.reanchored` events for any that have shifted or disappeared.
- **Extension (human save):** When the human saves the document after editing, the VS Code extension re-resolves open anchors against the saved text and persists any changes as `thread.reanchored` events.

Duplicate `thread.reanchored` events for the same thread are innocuous: the projection fold processes events in `created_at` order, so the last event wins.

---

## 11. Fix event checklist

`readEvents` silently discards any event that fails one of these predicates. Emit events that pass all of them or they will not appear in the projection:

| Discard condition | Effect |
|---|---|
| `version !== 2` | File predates V2 or was written incorrectly; the entire file is skipped. |
| `id` or `thread_id` is not a UUID v4 | Field missing, not a string, or wrong format; the event is ignored. |
| `body` is present but not a string | Type mismatch (`null`, number, or object); the event is ignored. |
| `author` is missing, not an object, or `author.kind` is not `"human"` or `"ai"` | Required field absent or invalid; the event is ignored. A single aggregated `console.warn` is emitted per `readEvents` call listing the count of discarded events. |
| `author.kind === "ai"` and `author.model` is missing or not a string | AI events without a model identifier are discarded; the model field is required for AI authorship. Folded into the aggregated `console.warn`. |
| `anchor` is present and any of: `anchor.line_hint` or `anchor.char_offset` is not a number, or `anchor.quote` is not a string | Malformed anchor; the event is ignored. Folded into the aggregated `console.warn`. |
| File size exceeds 1 MiB | The file is skipped without reading. Folded into the same aggregated `console.warn`. A legitimate event is a few hundred bytes; any file larger than 1 MiB is assumed malformed or malicious. |

**Default `author.model` for `fix` and `reanchor`.** When these subcommands are invoked without an explicit `--model` flag, they write `author.model: "mesh-review-cli"` on AI-authored events. This value passes the discard predicate above and appears in the author pill of the VS Code extension.

For the badge and diff to work correctly in the VS Code extension, a fix `message.posted` must also satisfy:

- `author.kind: "ai"` — marks the message as an AI fix (drives the badge label and author pill).
- `commit` is a hex SHA of 7–40 characters resolvable by `git rev-parse` — the extension calls `git rev-parse` to validate; an unresolvable SHA silently disables the diff button.
- The message is not retracted — a retracted fix (a `message.retracted` event referencing its `id`) is excluded from `fixCommit` computation, hiding the badge and diff.

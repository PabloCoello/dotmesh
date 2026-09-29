# Reading and projection

How to turn the event files into current thread state, and how to place a thread
on the document. Open this file before reading events by hand, when you need the
exact fold rules or the projection shape, or when an anchor no longer matches the
text.

---

## 2. Reading and projection

The event log has two views: the immutable **event log** and the net **projection** (current state per thread).

### Reading events

Read all `*.json` files from the event directory that have `"version": 2`. Skip unparseable files silently. If the directory does not exist, return an empty list.

### Sort order

Sort events before folding. The ordering has three levels (mirrors `compareEvents`):

1. `created_at` ascending — parsed as a real timestamp, not lexicographically (ISO strings with and without milliseconds must sort by actual time: `Date.parse` or equivalent; do **not** compare as plain strings).
2. At equal instant: `thread.opened` sorts before any other event type (it must seed the map before its own mutations arrive).
3. Final tiebreak: `id` in Unicode codepoint order (not locale-dependent).

### Projection fold

After sorting, fold events into a `Map<thread_id, ThreadProjection>` in order:

| Event type | Fold action |
|---|---|
| `thread.opened` | Seeds a new `ThreadProjection`: `status: "open"`, `openedCommit: ev.commit ?? null`, `messages: [{ id, body, author, created_at, retracted: false, commit: ev.commit ?? null }]`. Optionally sets `assignee`, `confidence`, `rationale`, `refs` if present on the event. |
| `message.posted` | Appends `{ id, body, author, created_at, retracted: false, commit: ev.commit ?? null }` to `messages`. If the event carries `confidence`, propagates it to the message projection. |
| `message.revised` | Finds the message whose `id` equals `target_message_id`; replaces its `body`. |
| `message.retracted` | Finds the message whose `id` equals `target_message_id`; sets `retracted: true`. |
| `thread.status-changed` | Sets `status` to `to` (`"open"` or `"resolved"`). |
| `thread.reanchored` (has `anchor`) | Replaces `anchor` with the new value. If `status` was `"detached"`, resets it to `"open"`. The new `anchor.quote` may differ from the original (the extension updates the quote when the human edits the cited text — the quote reflects the text as it was at save time). |
| `thread.reanchored` (has `detached: true`) | Sets `anchor: { detached: true }`; sets `status: "detached"`. |
| `thread.assigned` | Sets `assignee` to `agent`. |

Events whose `thread_id` has no prior `thread.opened` are silently ignored (defensive).

**`ThreadProjection` has no `body` field of its own.** The opening comment text lives in `messages[0].body`.

### Projection shape

```
ThreadProjection {
  thread_id      : UUID
  commentType    : CommentType
  anchor         : { quote, line_hint, char_offset } | { detached: true }
  status         : "open" | "resolved" | "detached"
  assignee?      : string
  assignedAt?    : ISO timestamp          // created_at of the most recent thread.assigned event; drives the --pending predicate
  confidence?    : "alta" | "media" | "baja"
  rationale?     : string                 // copied from thread.opened; justification for supuesto/verifica threads
  refs?          : Array<{ title, url?, note? }>
  messages       : MessageProjection[]   // [0] = opening text
  openedAt       : ISO timestamp
  openedBy       : Author
  openedCommit   : string | null         // commit from thread.opened; base for range diff
}

MessageProjection {
  id          : UUID
  body        : string
  author      : Author
  created_at  : ISO timestamp
  retracted   : boolean
  commit      : string | null             // SHA of the fix associated with this message; null if none
  confidence? : "alta" | "media" | "baja" // optional; emitted by the reviser subagent; shown in the review panel next to the author label
}
```

**Reserved envelope fields (not projected):** `dirty` is a metadata flag written by every command (`dirty: false`) to indicate the event was emitted against a clean worktree; it is preserved in raw events for forensic use but is never surfaced in `ThreadProjection`. `parent_id` appears in the `message.posted` schema as a reserved slot for future nested-threading support; it has no current effect and is silently ignored during projection — do not use it in new events.

Derived fields used by the card UI:

- **`fixCommit`** (not stored in the projection itself; computed at view time): the `commit` value of the last non-retracted `message.posted` with `author.kind === "ai"` and `commit !== null`.
- **`openCommit`**: `ThreadProjection.openedCommit`.

### Anchor resolution

A thread's `anchor` was captured when the thread opened; the document may have changed since. If a `thread.reanchored` event is present for a thread, its `anchor` supersedes the original — the extension updates the anchor (including `quote`) whenever the human saves after editing the document. When the human edits text directly inside the quoted range, `thread.reanchored` carries a new `quote` reflecting the text as saved. Always use the most recent `anchor` from the projection.

Before applying an `edita`/`sugerencia` or answering a `pregunta`, resolve the anchor against the **current** document text:

1. Search for an exact substring match of `anchor.quote`.
2. **One match** → that is the position. Proceed.
3. **Multiple matches** → choose the one whose start offset is closest to `anchor.char_offset`.
4. **No match (the quoted text is gone)** → do not invent a position. If the section can be identified with confidence from `messages[0].body`, note the discrepancy and, when you move the thread, **append** a `thread.reanchored` event carrying the new `anchor`. If it cannot be located with confidence, **append** a `thread.reanchored` event with `detached: true` (which transitions the thread to `detached`) and report it — never fabricate a location.

Threads already projected with `anchor: { detached: true }` have no current position: surface them for the human to re-anchor rather than guessing.

---
name: doc-review
description: Reads mesh-review V2 event-sourced review threads and acts on a document's open comments. Use when the user wants an AI agent to process review comments anchored to a document, when you find events under `.ai/review/`, or when asked to resolve, address, or work through review comments on a document.
---

# doc-review

Review comments for a document are stored as an **append-only event log** produced by the mesh-review V2 workflow. This skill teaches you to locate the event directory, project the current thread state, act on the document, and close each thread by writing new events. The normative schema for every event is `schema.json` in the same directory as this skill.

---

## 1. Event-directory location

### Primary path (document inside a git repository)

```
<git-root>/.ai/review/<relative-doc-path>/
```

The directory path **mirrors** the document's relative path from the git root — **no `.json` suffix** on the directory name. Each event is stored as a separate file inside it:

```
<git-root>/.ai/review/<relative-doc-path>/<event_id>.json
```

where `<event_id>` is the UUID v4 from the event's `id` field.

Every event file carries `"version": 2`. The log is append-only: existing files are never edited or deleted.

Examples:

| Document (relative to git root) | V2 event directory |
|---|---|
| `docs/informe.md` | `.ai/review/docs/informe.md/` |
| `README.md` | `.ai/review/README.md/` |
| `notes/chapter-2.md` | `.ai/review/notes/chapter-2.md/` |

Discover the git root from any path in the repository:

```bash
git -C "$(dirname /absolute/path/to/document)" rev-parse --show-toplevel
```

### Fallback path (document outside any git repository)

```
~/.local/state/mesh-review/<sha256-of-absolute-path>/
```

The SHA-256 is computed over the absolute path string (UTF-8, no trailing newline):

```bash
printf '%s' '/absolute/path/to/document' | sha256sum | awk '{print $1}'
```

Each event file inside the fallback directory follows the same `<event_id>.json` naming.

The out-of-repo location may also hold a **legacy V1 flat file** at `~/.local/state/mesh-review/<sha256-of-absolute-path>.json` (a `.json` file rather than a directory). Detect and migrate it exactly as in the in-repo case: legacy iff that flat file exists and the V2 directory does not.

### Legacy V1 detection

A flat file at `<git-root>/.ai/review/<relative-doc-path>.json` (with a `.json` suffix directly on the path) is a **legacy V1 sidecar**. Detection rule (mirrors `detectLegacy` in `sidecar.ts`):

> **Legacy iff** `<git-root>/.ai/review/<relative-doc-path>.json` exists **and** the V2 directory `<git-root>/.ai/review/<relative-doc-path>/` does **not** exist.

V1 is not a current format — treat it only as input to migration.

### V1 → V2 migration

The migration function `migrateV1` converts a V1 flat comment array into V2 events. Never treat V1 as the current format; migrate lazily on first access:

1. Read the V1 flat file (a JSON object with `version: 1`, `file`, and `comments` array).
2. For each V1 comment, emit a `thread.opened` event:
   - `id` and `thread_id` both take the comment's original UUID.
   - `author: { kind: "human" }`, `commit: null`, `dirty: false`.
   - `anchor`, `commentType` (= `type`), `body` copied from the comment.
   - If the comment had an `agent` field, copy it to `assignee`.
   - `created_at` = comment's `created_at`.
3. If the comment's `status` was `"resolved"`, also emit a synthetic `thread.status-changed` event with `to: "resolved"` and `created_at` = comment's `updated_at`.
4. Write all events into the V2 directory.

Note: V1 supported only 5 `commentType` values (`edita`, `sugerencia`, `pregunta`, `verifica`, `nota`). V2 adds `referencia` and `supuesto`.

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
| `thread.opened` | Seeds a new `ThreadProjection`: `status: "open"`, `messages: [{ id, body, author, created_at, retracted: false }]`. Optionally sets `assignee`, `confidence`, `refs` if present on the event. |
| `message.posted` | Appends `{ id, body, author, created_at, retracted: false }` to `messages`. |
| `message.revised` | Finds the message whose `id` equals `target_message_id`; replaces its `body`. |
| `message.retracted` | Finds the message whose `id` equals `target_message_id`; sets `retracted: true`. |
| `thread.status-changed` | Sets `status` to `to` (`"open"` or `"resolved"`). |
| `thread.reanchored` (has `anchor`) | Replaces `anchor` with the new value. If `status` was `"detached"`, resets it to `"open"`. |
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
  confidence?    : "alta" | "media" | "baja"
  refs?          : Array<{ title, url?, note? }>
  messages       : MessageProjection[]   // [0] = opening text
  openedAt       : ISO timestamp
  openedBy       : Author
}

MessageProjection {
  id         : UUID
  body       : string
  author     : Author
  created_at : ISO timestamp
  retracted  : boolean
}
```

### Anchor resolution

A thread's `anchor` was captured when the thread opened; the document may have changed since. Before applying an `edita`/`sugerencia` or answering a `pregunta`, resolve the anchor against the **current** document text:

1. Search for an exact substring match of `anchor.quote`.
2. **One match** → that is the position. Proceed.
3. **Multiple matches** → choose the one whose start offset is closest to `anchor.char_offset`; break ties by proximity to `anchor.line_hint`.
4. **No match (the quoted text is gone)** → do not invent a position. If the section can be identified with confidence from `messages[0].body`, note the discrepancy and, when you move the thread, **append** a `thread.reanchored` event carrying the new `anchor`. If it cannot be located with confidence, **append** a `thread.reanchored` event with `detached: true` (which transitions the thread to `detached`) and report it — never fabricate a location.

Threads already projected with `anchor: { detached: true }` have no current position: surface them for the human to re-anchor rather than guessing.

---

## 3. Comment types

Seven comment types in two classes:

| type | class | special fields | agent action |
|---|---|---|---|
| `edita` | accionable | — | Apply the described edit at the anchor location. |
| `sugerencia` | accionable | — | Evaluate and apply if appropriate; explain in the report if not applied. |
| `pregunta` | accionable | — | Answer in the report; add minimal clarification to the document only if the answer reveals a gap in the text. |
| `verifica` | accionable | `confidence`: `alta`/`media`/`baja` | Check the claim against source; correct the document only if it is factually wrong. Confidence signals how certain the opener was. |
| `nota` | anotación | — | Read and acknowledge; note as informational in the report. |
| `referencia` | anotación | `refs[]`: `{ title, url?, note? }` | Record the reference; link from the relevant document section if appropriate. |
| `supuesto` | anotación | `confidence`: `alta`/`media`/`baja` | Acknowledge the assumption; flag in the report if it materially affects document claims. |

**Accionables** follow an open → resolved lifecycle. **Anotaciones** are durable while their anchor exists; they are archived by transitioning to `"detached"` when the anchored text disappears, not by resolving them.

---

## 4. Propose-then-apply cycle

```
project → fan-out workers → reconcile → apply → synthesize
```

1. **Project.** Read and project the event directory to get the current `ThreadProjection[]`. Filter to threads with `status: "open"`.
2. **Fan-out workers.** Delegate open threads to subagents based on routing (§6). Each worker reads the event directory, evaluates its assigned threads, and writes **new event files only** — proposing status changes, new messages, or re-anchors.
3. **Reconcile.** The principal reviews all worker proposals, collapses near-duplicates (§5), and decides the final set of document edits.
4. **Apply.** The principal applies edits to the **document body** serially. Workers never touch the document body directly.
5. **Synthesize.** Emit the 5-part response (§7).

**CRITICAL INVARIANT:** Workers only write event files into `.ai/review/<doc-path>/`. Edits to the document body are applied exclusively by the principal, serially. New responses, status changes, and anchor moves are written by **appending a new `<event_id>.json` file** — never by editing or deleting existing event files. The log is append-only.

---

## 5. Deduplication

Before applying document edits, the principal reconciles worker proposals:

- Two proposals targeting the same anchor with substantially the same change are collapsed into one.
- Conflicting proposals on the same anchor are resolved by the principal (prefer the more specific or higher-confidence proposal; surface the conflict in the report if ambiguous).
- Proposals from different threads on different anchors are applied independently in document order (`char_offset` ascending, `line_hint` as tiebreaker).

---

## 6. Routing

Route open threads to subagents based on `assignee` from `thread.assigned` events (most recent wins), or fall back to the `commentType` and content of `messages[0]`:

| Signal | Subagent |
|---|---|
| `assignee: "security"` or `verifica` on a security claim | `security` |
| `assignee: "maths"` or `verifica` on a quantitative/mathematical claim | `maths` |
| `edita` or `sugerencia` (prose change) | `reviser` |
| `pregunta` requiring factual research | `editor` |
| `nota`, `referencia`, `supuesto` (annotations) | principal |
| No assignee, no clear signal | principal |

The dotmesh subagent roster: `build`, `plan`, `review`, `security`, `editor`, `maths`, `reviser`.

---

## 7. Response contract

Every review session produces a structured response with five parts:

| # | Section | Required | Content |
|---|---|---|---|
| 1 | **Contexto** | always | Document path, number of open threads, git commit if available. |
| 2 | **Alcance** | always | Which threads are addressed in this session (IDs and types). |
| 3 | **Supuestos** | conditional | Non-obvious assumptions made during the review. Omit if none. |
| 4 | **Tareas accesorias** | conditional | Work items identified that fall outside the review scope (e.g. TODOs, follow-up spikes). Each is persisted to `<git-root>/.ai/backlog/<id>.json` with fields `{ id, doc, session, author, commit, body }`. Omit if none. |
| 5 | **Preguntas** | always | Open questions for the human that are blocking or significantly affect the review. May be an empty list. |

Sections 1, 2, and 5 are always present. Sections 3 and 4 appear only when they have content.

After processing each thread, also emit a one-line log entry:

> `[<thread_id prefix>]` \<type\> — \<what was done\>. Resolved / Left open.

---

## 8. Tool requirements

This skill uses only standard file and shell operations:

| Operation | Tool |
|---|---|
| Discover git root | `git -C <dir> rev-parse --show-toplevel` |
| Read/write event files | file read/write (JSON, 2-space indent, trailing newline) |
| List event directory | directory listing filtered to `*.json` |
| SHA-256 of path string | `printf '%s' '<path>' \| sha256sum \| awk '{print $1}'` |
| UTC timestamp (with ms) | `date -u +"%Y-%m-%dT%H:%M:%S.000Z"` or language runtime equivalent |
| Write backlog task | file write to `<git-root>/.ai/backlog/<id>.json` |

No VS Code extension API, no agent-specific API, and no network access are required. The skill works identically in Claude Code, OpenCode, Codex, or any other agent with file access.

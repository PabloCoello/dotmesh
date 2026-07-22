---
name: doc-review
description: Reads mesh-review V2 event-sourced review threads and acts on a document's open comments. Use when the user wants an AI agent to process review comments anchored to a document, when you find events under `.ai/review/`, or when asked to resolve, address, or work through review comments on a document.
---

# doc-review

Review comments for a document are stored as an **append-only event log** produced by the mesh-review V2 workflow. This skill teaches you to locate the event directory, project the current thread state, act on the document, and close each thread by writing new events. The normative schema for every event is `schema.json` in the same directory as this skill.

The `mesh-review` CLI used throughout this skill ships with it at `bin/mesh-review.mjs`, next to this SKILL.md (after stow: `~/.claude/skills/doc-review/bin/mesh-review.mjs`). It is not on PATH — invoke it as `node <skill-dir>/bin/mesh-review.mjs <subcommand> …`.

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
| `thread.opened` | Seeds a new `ThreadProjection`: `status: "open"`, `openedCommit: ev.commit ?? null`, `messages: [{ id, body, author, created_at, retracted: false, commit: ev.commit ?? null }]`. Optionally sets `assignee`, `confidence`, `refs` if present on the event. |
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
  confidence?    : "alta" | "media" | "baja"
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

Derived fields used by the card UI:

- **`fixCommit`** (not stored in the projection itself; computed at view time): the `commit` value of the last non-retracted `message.posted` with `author.kind === "ai"` and `commit !== null`.
- **`openCommit`**: `ThreadProjection.openedCommit`.

### Anchor resolution

A thread's `anchor` was captured when the thread opened; the document may have changed since. If a `thread.reanchored` event is present for a thread, its `anchor` supersedes the original — the extension updates the anchor (including `quote`) whenever the human saves after editing the document. When the human edits text directly inside the quoted range, `thread.reanchored` carries a new `quote` reflecting the text as saved. Always use the most recent `anchor` from the projection.

Before applying an `edita`/`sugerencia` or answering a `pregunta`, resolve the anchor against the **current** document text:

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

**Accionables** follow an open → resolved lifecycle (resolved by the human, not by the agent during a review pass). **Anotaciones** are durable while their anchor exists; they are archived by transitioning to `"detached"` when the anchored text disappears, not by resolving them.

---

## 4. Preconditions

Check these before touching any file or running any git command:

1. **Worktree clean for files under review.** Run `git diff --name-only HEAD` and verify the document under review does not appear in the output. If other files are modified but the document is clean, you may continue.
2. **Document must be inside a git repository.** Run `git rev-parse --show-toplevel` from the document's directory. If git fails, stop and inform the user.
3. **Must not be on the default branch.** Run `git branch --show-current`. Compare with `git symbolic-ref --short refs/remotes/origin/HEAD` (falls back to `git config init.defaultBranch`). If on the default branch, go to §5 before touching any file.

Run all three checks once per session at the start of the pass. In watchful-mode iterations, re-run only check 1 (worktree cleanliness for the document under review) before each commit. Checks 2 and 3 do not change between iterations.

---

## 5. Branch management

If the current branch is the default branch, create a work branch before touching any file:

- Derive the name from the document(s) in the pass: one document → its path slug; multiple documents → a short theme that describes them.
- Prefix with `review/` and append the date: `review/<slug>-<YYYYMMDD>`. Examples: `review/informe-20260714`, `review/auditoria-docs-20260714`.
- No LLM attribution in the branch name (dotmesh rule).
- **If the user has explicitly asked to process comments** (e.g. "procesa los comentarios de `<doc>`", "run a review pass"), run `git checkout -b <name>` directly, without waiting for confirmation.
- **If the first step of the session was `project` without an order to process** (the user inspected thread state only), state the proposed name and wait for confirmation before running `git checkout -b <name>`.

---

## 6. Pass flow

### 6.1 Determine pass type

Project the event log. Identify the pass type using the iteration detection criteria in §7:

- **Initial pass:** open threads with no prior AI fix (no `message.posted` with `author.kind === "ai"` and `commit !== null`).
- **Iteration pass:** open threads where the last non-retracted message is from a human, posted after the last AI fix message.

The two types are not mutually exclusive per-thread, but a full iteration pass occurs when all open threads meet the iteration criteria. In practice, a mixed set (some initial, some iteration) is processed the same way — each thread follows §6.2.

### 6.2 Actionable threads with a code change

Process threads with `commentType` in `{edita, sugerencia, pregunta, verifica}` that require a document edit, **serially in descending `char_offset` order (bottom-to-top)**. Start from the thread with the highest `char_offset` and work upward toward the beginning of the document. This prevents earlier edits from displacing the anchors of threads still to be processed.

1. Resolve the anchor against the current buffer (§2 — anchor resolution). If the anchor is unresolvable, skip to §6.4 (conflict).
2. Apply the edit to the document body.
3. Run `node <skill-dir>/bin/mesh-review.mjs fix <doc> <thread_id> -m "<type>(<short-anchor>): <description>" --body "<reply>"`. The command commits the document with an explicit pathspec, captures the short SHA, and writes the `message.posted` event. No LLM attribution in the commit message.
4. Re-anchor any threads displaced by this edit (§6.6).

### 6.3 Annotations

For threads with `commentType` in `{nota, referencia, supuesto}`, write a `message.posted` with `commit = null`. Do not resolve. Annotations are durable and archived to `detached` only when their anchor text disappears, never during a review pass.

### 6.4 Conflict handling

If an anchor cannot be resolved after preceding edits:

- Write a `message.posted` describing the conflict: what text was expected, what the buffer currently contains at that location.
- `commit = null`. Do not resolve the thread. Do not skip silently.

### 6.5 "Already done" case

If a thread requests a change already applied by an earlier thread in this pass:

- Write a `message.posted` identifying the earlier commit: e.g. "resuelto junto con `<sha>`".
- Set `commit = <sha>` of that earlier commit (not a new commit). The card UI uses this SHA to show the relevant diff.
- Do not create a new commit. Do not resolve the thread.

Run `node <skill-dir>/bin/mesh-review.mjs fix <doc> <thread_id> --already-done <sha> --body "resolved alongside <sha>"` to emit the event pointing to the earlier commit without creating a new one.

### 6.6 Re-anchoring between edits

After each commit, update the in-memory positions of all remaining threads before processing the next one:

- Threads whose anchor text has shifted: write `thread.reanchored` with the updated `anchor`.
- Threads whose anchor text has disappeared: write `thread.reanchored` with `detached: true`.
- Always resolve anchors against the current buffer, not the original document.

> **Note:** With descending order (§6.2), in-pass re-anchoring almost never fires: edits at lower offsets do not shift anchors at higher offsets that have already been processed. Run `mesh-review reanchor <doc>` at the close of the pass as a final sweep (see §10).

### 6.7 Propose-then-apply invariant

The `reviser` subagent proposes changes by writing `message.posted` events with `commit: null`. The principal:

1. Reads the proposal from the event log.
2. Applies the edit to the document body.
3. Creates the commit.
4. Writes the confirmation `message.posted` with `commit = SHA`.

The `reviser` never touches the document body and never runs git commands. The commit is always the principal's step, executed after applying the proposal.

When the pass operates in fast-path mode (1 or 2 actionable threads, no fan-out — see §8), propose-then-apply collapses into a single apply-and-report step: the principal applies the edit directly, then calls `mesh-review fix`, without a prior reviser delegation. The invariant that only the principal edits the document body still holds; there is no subagent involved.

---

## 7. Iteration detection

A thread is in iteration state when all three conditions hold:

- `status === "open"`
- At least one `message.posted` with `author.kind === "ai"` and `commit !== null` exists in its messages (there has been at least one fix).
- The last non-retracted message has `author.kind === "human"` and a `created_at` value strictly later than the `created_at` of the last AI `message.posted` with `commit !== null`.

When all open threads meet this criterion, the pass is an iteration pass. The principal applies one new commit per thread on the same work branch, following the same §6 flow.

---

## 8. Routing

**Fast-path condition.** If the number of actionable threads (commentType in {edita, sugerencia, pregunta, verifica}) is ≤ 2, the principal resolves them directly without delegating to subagents. With 3 or more actionable threads, use fan-out per the table below.

Route open threads to subagents based on `assignee` from `thread.assigned` events (most recent wins), or fall back to the `commentType` and content of `messages[0]`:

| Signal | Subagent |
|---|---|
| `assignee: "security"` or `verifica` on a security claim | `security` |
| `assignee: "maths"` or `verifica` on a quantitative/mathematical claim | `maths` |
| `assignee: "reviser"` | `reviser` |
| `assignee: "editor"` | `editor` |
| `edita` or `sugerencia` (prose change, no assignee) | `reviser` |
| `pregunta` requiring factual research (no assignee) | `editor` |
| `nota`, `referencia`, `supuesto` (annotations) | principal |
| No assignee, no clear signal | principal |

**Inline context for fan-out.** When delegating a thread to a subagent, the principal extracts ±20 lines of the document surrounding `anchor.char_offset` and includes them verbatim in the delegation prompt. The subagent uses this extract as its primary source for understanding the anchored text; it re-reads the full document or event directory only if the inline extract is insufficient or absent.

The dotmesh subagent roster: `build`, `plan`, `review`, `security`, `editor`, `maths`, `reviser`.

> The human can assign a thread directly from the mesh-review VS Code extension (button "Asignar" on open thread cards). The extension writes a `thread.assigned` event with `agent` set to one of the four assignable values: `security`, `maths`, `reviser`, `editor`.

---

## 9. Response contract

Every review session produces a structured response with five parts:

| # | Section | Required | Content |
|---|---|---|---|
| 1 | **Contexto** | always | Document path, number of open threads, current branch, git commit range if available. |
| 2 | **Alcance** | always | Which threads are addressed in this session (IDs and types). |
| 3 | **Supuestos** | conditional | Non-obvious assumptions made during the review. Omit if none. |
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

`readEvents` silently discards any event that fails one of these predicates. Emit events that pass all three or they will not appear in the projection:

| Discard condition | Effect |
|---|---|
| `version !== 2` | File predates V2 or was written incorrectly; the entire file is skipped. |
| `id` or `thread_id` is not a UUID v4 | Field missing, not a string, or wrong format; the event is ignored. |
| `body` is present but not a string | Type mismatch (`null`, number, or object); the event is ignored. |

For the badge and diff to work correctly in the VS Code extension, a fix `message.posted` must also satisfy:

- `author.kind: "ai"` — marks the message as an AI fix (drives the badge label and author pill).
- `commit` is a hex SHA of 7–40 characters resolvable by `git rev-parse` — the extension calls `git rev-parse` to validate; an unresolvable SHA silently disables the diff button.
- The message is not retracted — a retracted fix (a `message.retracted` event referencing its `id`) is excluded from `fixCommit` computation, hiding the badge and diff.

---

## 12. Tool requirements

This skill uses only standard file and shell operations:

| Operation | Tool |
|---|---|
| Discover git root | `git -C <dir> rev-parse --show-toplevel` |
| Check worktree cleanliness | `git status --porcelain` |
| Check current branch | `git branch --show-current` |
| Check default branch | `git symbolic-ref --short refs/remotes/origin/HEAD` |
| Create work branch | `git checkout -b <name>` (after user confirmation) |
| Commit a single file | `git commit -m "<message>" -- <file>` |
| Capture short SHA | `git rev-parse --short HEAD` |
| Read/write event files | file read/write (JSON, 2-space indent, trailing newline) |
| List event directory | directory listing filtered to `*.json` |
| SHA-256 of path string | `printf '%s' '<path>' \| sha256sum \| awk '{print $1}'` |
| UTC timestamp (with ms) | `date -u +"%Y-%m-%dT%H:%M:%S.000Z"` or language runtime equivalent |
| Write backlog task | file write to `<git-root>/.ai/backlog/<id>.json` |
| Commit a single reviewed file and emit fix event | `mesh-review fix <doc> <thread_id> -m <msg> --body <reply> [--reanchor] [--already-done <sha>] [--model <id>] [--confidence ...]` |

No VS Code extension API, no agent-specific API, and no network access are required. The skill works identically in Claude Code, OpenCode, Codex, or any other agent with file access.

# Event store

Where the review data lives on disk and how to reach it from a document path.
Open this file when you need to locate the event directory, when the document
sits outside a git repository, or when you find a legacy V1 sidecar.

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

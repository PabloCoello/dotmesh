# CLI reference

The tools the skill needs and every `mesh-review` write subcommand, with flags,
validation rules and worked examples. Open this file when you are about to run a
command.

---

## 12. Tool requirements

This skill uses only standard file and shell operations:

| Operation | Tool |
|---|---|
| Discover git root | `git -C <dir> rev-parse --show-toplevel` |
| Check worktree cleanliness | `git status --porcelain` |
| Check current branch | `git branch --show-current` |
| Check default branch | `git symbolic-ref --short refs/remotes/origin/HEAD` |
| Create work branch | `git checkout -b <name>` (directly or after confirmation, per `pass-flow.md` §5) |
| Commit a single file | `git commit -m "<message>" -- <file>` |
| Capture short SHA | `git rev-parse --short HEAD` |
| Read/write event files | file read/write (JSON, 2-space indent, trailing newline) |
| List event directory | directory listing filtered to `*.json` |
| SHA-256 of path string | `printf '%s' '<path>' \| sha256sum \| awk '{print $1}'` |
| UTC timestamp (with ms) | `date -u +"%Y-%m-%dT%H:%M:%S.000Z"` or language runtime equivalent |
| Write backlog task | file write to `<git-root>/.ai/backlog/<id>.json` |
| Commit a single reviewed file and emit fix event | `mesh-review fix <doc> <thread_id> -m <msg> --body <reply> [--reanchor] [--already-done <sha>] [--model <id>] [--confidence ...]` |

**`fix --body` validation:** `--body` is required, must not exceed 10,000 characters, and must not contain C0 control characters, DEL (`\x7F`), or C1 characters (`\x80`–`\x9F`); tab, LF and CR are allowed. These are the same rules as `open` and `reply`.

No VS Code extension API, no agent-specific API, and no network access are required. The skill works identically in Claude Code, OpenCode, Codex, or any other agent with file access.

---

## 13. Write subcommands

The four subcommands below let any editor or agent create and close review threads without the VS Code extension. They all use atomic event writes (tmp+rename) and require the document to be inside a git repository.

**Shared behaviour across `open`, `reply`, `resolve`, `retract`:**

- The document must be inside a git repository. If `git rev-parse --show-toplevel` fails, the command exits 1.
- Unknown `--flag` arguments are rejected immediately with exit 1. Both `--flag value` and `--flag=value` forms are accepted; the `=` form is parsed correctly for all flags.
- `--author human` (default): reads `git config user.name` for the `name` field; omits `name` if not configured.
- `--author ai`: requires `--model <id>`; optionally accepts `--effort <str>` and `--subagent <str>`. Passing `--model`, `--effort`, or `--subagent` when `--author` is `human` (or omitted) is an error: the command exits 1 with a message on stderr.
- `reply`, `resolve`, and `retract` verify that the target thread exists before writing the event. `retract` additionally verifies that the `message_id` exists within that thread. A non-existent target exits 1 with a message on stderr; no event is written.
- On any validation error the command writes a message to stderr and exits 1.

### 13.1 `open`

Creates a `thread.opened` event with a properly typed anchor. Calls `createAnchor(text, offset, endOffset)` — the same function used by the VS Code extension's `addCommentImpl` — so both clients produce identical anchor shapes.

```
mesh-review open <doc>
    --offset <n>
    --end-offset <n>
    --type <commentType>
    --body <text>
    [--author human|ai]             # default: human
    [--model <modelId>]             # required when --author ai
    [--effort <str>]                # optional; only meaningful with --author ai
    [--subagent <str>]              # optional; only meaningful with --author ai
    [--confidence alta|media|baja]  # required when --type is verifica or supuesto
    [--assignee <name>]             # optional
```

**Offset units — critical:** `--offset` and `--end-offset` are **UTF-16 code-unit indices** (JavaScript `str.length` / `str[n]` indices), **not byte offsets and not line/column numbers**. This is the single most common source of mistakes for callers that work in bytes. For pure ASCII text the index equals the byte offset, so typical English prose is unaffected. A file containing a single 4-byte emoji `😀` has `text.length === 2` in JavaScript; the full emoji is addressed by `--offset 0 --end-offset 2`. Any text to the right of a multi-code-unit character has a higher JavaScript index than its byte offset. Always compute offsets from the raw JS string, not from a byte-counted position.

**Validation rules:**
- Both offsets must be non-negative integers; `end-offset` must be strictly greater than `offset`; `end-offset` must be ≤ `text.length`.
- `--type` must be one of: `edita | sugerencia | pregunta | verifica | nota | referencia | supuesto`.
- `--body` must not be empty, must not exceed 10,000 characters, and must not contain C0 control characters (NUL, U+0001–U+0008, U+000B–U+000C, U+000E–U+001F), DEL (U+007F), or C1 characters (U+0080–U+009F); tab, LF and CR are allowed.
- `--type verifica` or `--type supuesto` requires `--confidence`.
- `--author ai` requires `--model`.

**stdout:** UUID of the new thread (`thread_id`), followed by a newline. This UUID is also the `id` of the `thread.opened` event.

**Example:**

```bash
# Open a "nota" thread on the first five characters of a document.
THREAD=$(node ~/.claude/skills/doc-review/bin/mesh-review.mjs open docs/SPEC.md \
  --offset 0 --end-offset 5 \
  --type nota \
  --body "Este párrafo necesita más contexto")
echo "Created thread: $THREAD"

# Verify:
node ~/.claude/skills/doc-review/bin/mesh-review.mjs project docs/SPEC.md
# → thread appears with status: open
```

### 13.2 `reply`

Posts a `message.posted` event on an existing thread. **Does not make a git commit.** The event's `commit` field is set to the current HEAD short SHA (or `null` if the repository has no commits yet).

Use `reply` when the response does not accompany a document change. Use `fix` (§12) when the reply is paired with an edit and a commit.

```
mesh-review reply <doc> <thread_id>
    --body <text>
    [--author human|ai]
    [--model <modelId>]
    [--effort <str>]
    [--subagent <str>]
    [--confidence alta|media|baja]
```

**Validation:** `thread_id` must be a UUID v4. `--body` must not be empty, must not exceed 10,000 characters, and must not contain C0 control characters, DEL, or C1 characters (same rules as `open`). `--author ai` requires `--model`.

**stdout:** UUID of the new `message.posted` event, followed by a newline.

**`reply` vs `fix`:** `reply` records a message without touching the document or the git log — the diff button in the extension will not activate for this message. `fix` commits the document first and sets `commit` to the resulting SHA, which activates the diff button. Use `reply` for pure discussion, AI answers, or human acknowledgements; use `fix` for code-change confirmations.

**Example:**

```bash
THREAD_ID="<uuid from open>"
MSG=$(node ~/.claude/skills/doc-review/bin/mesh-review.mjs reply docs/SPEC.md "$THREAD_ID" \
  --author ai \
  --model "claude-sonnet-4-5" \
  --body "He verificado la afirmación; es correcta según la fuente citada.")
echo "Posted message: $MSG"

# HEAD commit is unchanged:
git log --oneline -1
```

### 13.3 `resolve`

Emits `thread.status-changed { to: "resolved" }`. Calling it a second time on an already-resolved thread is harmless — the second event is written but the projected status stays `"resolved"`.

```
mesh-review resolve <doc> <thread_id>
    [--author human|ai]
    [--model <modelId>]
    [--effort <str>]
    [--subagent <str>]
```

**Validation:** `thread_id` must be a UUID v4. `--author ai` requires `--model`.

**stdout:** UUID of the new `thread.status-changed` event, followed by a newline.

**Example:**

```bash
node ~/.claude/skills/doc-review/bin/mesh-review.mjs resolve docs/SPEC.md "$THREAD_ID"

# Verify:
node ~/.claude/skills/doc-review/bin/mesh-review.mjs project docs/SPEC.md
# → thread shows status: resolved (excluded from default project output, still visible in the full log)
```

### 13.4 `retract`

Emits `message.retracted { target_message_id }` to mark a specific message as retracted. The event log is append-only; the original message event is not deleted. The projection fold sets `retracted: true` on that message. The `--reason` field is optional.

```
mesh-review retract <doc> <thread_id> <message_id>
    [--reason <text>]
    [--author human|ai]
    [--model <modelId>]
    [--effort <str>]
    [--subagent <str>]
```

**Validation:** both `thread_id` and `message_id` must be UUID v4s. If `--reason` is supplied it must not exceed 10,000 characters and must not contain C0 control characters, DEL, or C1 characters (same rules as `--body` in `open`). `--author ai` requires `--model`.

**stdout:** UUID of the new `message.retracted` event, followed by a newline.

**Example:**

```bash
# Retract an AI reply that contained an error, then post a corrected one.
node ~/.claude/skills/doc-review/bin/mesh-review.mjs retract docs/SPEC.md \
  "$THREAD_ID" "$MSG_ID" \
  --reason "La respuesta anterior contenía un error factual"

node ~/.claude/skills/doc-review/bin/mesh-review.mjs reply docs/SPEC.md "$THREAD_ID" \
  --author ai --model "claude-sonnet-4-5" \
  --body "Corrección: la afirmación es incorrecta según [fuente]."
```

### 13.5 `emit` (vía de bajo nivel)

Writes a raw V2 event to the event directory without the argument ergonomics of the typed subcommands. Intended for **harness scripts, integration tests, and external tooling** that construct events programmatically. Prefer `open`, `reply`, `resolve`, or `retract` whenever possible — they validate types, enforce anchor shapes, and guard invariants. Use `emit` only when you need to write an event type that none of the typed subcommands cover (e.g. `thread.assigned` before `assign` ships, or testing unusual event sequences).

> **Advertencia:** `emit` es una vía de bajo nivel que puede escribir valores **fuera de las allowlists** de los subcomandos de alto nivel. Por ejemplo, el campo `agent` de `thread.assigned` está restringido por `assign` a `security | maths | reviser | editor`, pero `emit` acepta cualquier cadena que supere las guardas de `body`. Úsalo solo cuando lo que necesites no cabe en un subcomando tipado.

```
mesh-review emit <doc> <event-type> [key=value ...]
```

Key-value pairs are merged into the event after the fixed fields (`id`, `version`, `type`, `created_at`, `dirty: false`). Dot-notation builds nested objects: `author.kind=ai author.model=my-model`. The two numeric anchor fields (`anchor.line_hint`, `anchor.char_offset`) are coerced to non-negative integers; all other values remain strings unless the literal is `null`, `true`, or `false`.

**Validation:** `id` and `thread_id` (if present) must be UUID v4. If `body` is present it must be a non-empty string (≥ 1 character) and must not contain C0 control characters (U+0001–U+0008, U+000B–U+000C, U+000E–U+001F), DEL (U+007F), or C1 characters (U+0080–U+009F); tab, LF and CR are allowed.

**stdout:** UUID of the written event, followed by a newline.

**Example:**

```bash
# Emit a thread.assigned event (until assign ships as a typed subcommand)
node ~/.claude/skills/doc-review/bin/mesh-review.mjs emit docs/SPEC.md thread.assigned \
  thread_id="$THREAD_ID" \
  agent=reviser \
  author.kind=human \
  commit=null
```

---
name: doc-review
description: Reads mesh-review sidecar files and acts on a document's open review comments. Use when the user wants an AI agent to process review comments anchored to a markdown document, when you find a sidecar at `.ai/review/`, or when asked to resolve, address, or work through review comments on a document.
---

# doc-review

Review comments for a document are stored in a JSON sidecar file produced by the mesh-review workflow. This skill teaches you to locate the sidecar, resolve each comment's anchor to its current position in the document, act on the document, and close the review.

The normative schema for the sidecar is `schema.json` in the same directory as this skill.

---

## Sidecar location

### Primary path (document inside a git repository)

```
<git-root>/.ai/review/<relative-doc-path>.json
```

The sidecar path **mirrors** the document's relative path from the git root. A `.json` suffix is appended to the full relative path — not just the basename — so collisions between files with the same name in different directories are impossible.

Examples:

| Document (relative to git root) | Sidecar |
|---|---|
| `docs/informe.md` | `.ai/review/docs/informe.md.json` |
| `README.md` | `.ai/review/README.md.json` |
| `notes/chapter-2.md` | `.ai/review/notes/chapter-2.md.json` |
| `.ai/tmp/scratch.md` | `.ai/review/.ai/tmp/scratch.md.json` |

The mirroring is literal: hidden directories and unusual paths nest as-is under `.ai/review/`.

To find the git root from any path:

```bash
git -C "$(dirname /absolute/path/to/document)" rev-parse --show-toplevel
```

### Fallback path (document outside any git repository)

```
~/.local/state/mesh-review/<sha256-of-absolute-path>.json
```

The SHA-256 is computed over the absolute path string (UTF-8, no trailing newline).

---

## Schema

Each sidecar is a JSON object with these top-level fields:

| Field | Type | Description |
|---|---|---|
| `version` | `integer` (must be `1`) | Schema version for future migrations |
| `file` | `string` | Relative path from git root to the reviewed document |
| `comments` | `array` | Ordered list of comment objects |

Each comment object:

| Field | Type | Values / format |
|---|---|---|
| `id` | UUID v4 string | Unique identifier |
| `anchor.quote` | `string` | Exact text fragment selected when the comment was created |
| `anchor.line_hint` | `integer ≥ 0` | Approximate line number at creation time (informational) |
| `anchor.char_offset` | `integer ≥ 0` | Approximate char offset from file start at creation time (informational) |
| `type` | `string` | `"edita"` · `"sugerencia"` · `"pregunta"` · `"verifica"` · `"nota"` |
| `agent` | `string` (optional) | Routing hint: name of the agent or subagent that should handle the comment in an orchestrated run. Standalone agents treat it as informational context. |
| `body` | `string` | Full text of the comment |
| `status` | `string` | `"open"` · `"resolved"` |
| `created_at` | ISO 8601 UTC string | Creation timestamp |
| `updated_at` | ISO 8601 UTC string | Last-modified timestamp |

---

## Anchor resolution

An anchor ties a comment to a text fragment in the document. The document may have been edited since the comment was created, so anchors must be resolved against the **current** document content.

**Algorithm:**

1. Read the current document text into memory.
2. Search for an exact substring match of `anchor.quote`.
3. **One match** — that is the anchor position. Proceed.
4. **Multiple matches** — choose the match whose start offset is closest to `anchor.char_offset`. If two matches are equidistant, prefer the one on or nearest to `anchor.line_hint`.
5. **No match (broken anchor)** — do **not** invent a position. Instead:
   a. Re-read the `body` text for enough context to locate the correct section.
   b. If the section can be identified with confidence, note the discrepancy ("anchor quote not found; located by body context at line N") and proceed.
   c. If the section cannot be identified with confidence, mark the comment as **unresolvable** in your report and skip it. Do not fabricate a location.

---

## Work plan

Before acting on any comment, scan the full `comments` array and build a work plan:

1. Filter to comments where `status == "open"`.
2. Sort by position in the document: `anchor.char_offset` ascending (use `anchor.line_hint` as tie-breaker when offsets are equal).
3. If a comment has an `agent` field, treat it as a routing hint in an orchestrated multi-agent run (e.g. delegate a `verifica` comment with `agent: "security"` to the security subagent). Standalone agents treat it as informational context.
4. Present the plan briefly before starting (e.g. "3 open comments").

---

## Resolution cycle

Process each comment in work-plan order:

### 1. Resolve the anchor

Apply the algorithm above to find the current location in the document.

### 2. Act on the document

Apply changes to the **original document file** (not a copy) based on `type`:

| Type | Action |
|---|---|
| `edita` | Apply the edit described in `body` at or around the anchor position. |
| `sugerencia` | Evaluate the suggestion. Apply it if appropriate; if not, explain your reasoning in the report without modifying the document for that comment. |
| `pregunta` | Answer the question in your report. If the question reveals an ambiguity or gap in the text itself, add the minimal clarification to the document; if the answer needs no document change, answer only in the report. |
| `verifica` | Check the claim, figure, or assertion in `body` against the source. Provide evidence in the report. Correct the document only if the text is factually wrong; otherwise leave it unchanged. |
| `nota` | Read and acknowledge. Apply any clearly implied document change; otherwise note it as informational. |

Make the minimum change that satisfies the comment. Do not refactor unrelated text.

### 3. Update the sidecar

After acting on a comment:

1. Read the sidecar JSON.
2. Find the comment by `id`.
3. Set `status` to `"resolved"`.
4. Set `updated_at` to the current UTC timestamp. Obtain it with `date -u +"%Y-%m-%dT%H:%M:%SZ"` — never estimate or invent the time.
5. Write the updated JSON back to the same sidecar path. Preserve all other fields exactly.

```bash
# Example: inspect before editing
cat .ai/review/docs/informe.md.json
```

### 4. Report

After processing each comment, emit one short sentence describing what you did. Example:

> `[f47ac10b]` edita — Added transition sentence before the proof. Resolved.
> `[6ba7b810]` pregunta — Answered: the definition applies to real series; added a note to the document. Resolved.

---

## Completion

The review is **closed** when every comment in the sidecar has `status == "resolved"` (or was explicitly reported as unresolvable).

At the end, summarize:
- Total comments processed.
- How many were resolved vs. unresolvable.
- Any document changes made (one bullet per change is enough).

---

## Tool requirements

This skill uses only standard file and shell operations:

- Read and write files (sidecar JSON and the document).
- Run `git rev-parse --show-toplevel` to find the git root.
- Compute a SHA-256 hash of a path string for the fallback location (e.g. `printf '%s' '/abs/path' | sha256sum`).
- Run `date -u` for timestamps.

No VS Code extension, no agent-specific API, and no network access are required. The skill works identically in OpenCode, Claude Code, Codex, or any other agent with file access.

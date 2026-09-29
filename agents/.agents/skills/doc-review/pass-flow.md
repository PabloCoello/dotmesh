# Pass flow

What a review pass does, from the checks that run before touching a file to the
order the threads are processed in and who handles each one. Open this file when
you are about to act on a document's open threads.

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

**Watchful-mode loop rules (check 1 outcome):**
- **Document dirty** — skip this iteration without committing and without doubling the loop interval. Pending work exists; resume when the document is clean.
- **Pending threads found and processed** — reset the loop interval to its base value after the pass completes.

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

1. Resolve the anchor against the current buffer (anchor resolution, `projection.md` §2). If the anchor is unresolvable, skip to §6.4 (conflict).
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

> **Note:** With descending order (§6.2), in-pass re-anchoring almost never fires: edits at lower offsets do not shift anchors at higher offsets that have already been processed. Run `mesh-review reanchor <doc>` at the close of the pass as a final sweep (see `closing-a-pass.md` §10).

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
| `assignee: "security"` | `security` |
| `assignee: "maths"` | `maths` |
| `assignee: "reviser"` | `reviser` |
| `assignee: "editor"` | `editor` |
| `edita`, `sugerencia`, or `pregunta` (no assignee) | `reviser` |
| `verifica` (no assignee) | `reviser`; escalate to `security` or `maths` if the body indicates |
| `nota`, `referencia`, `supuesto` (annotations) | principal |
| No assignee, no clear signal | principal |

**Batching before fan-out.** Group actionable threads whose `line_hint` values are within 50 lines of each other into batches (max 5 threads per batch). Delegate each batch to the reviser in a single call.

**Inline context for fan-out.** When delegating a thread to a subagent, the principal extracts ±20 lines of the document surrounding `anchor.char_offset` and includes them verbatim in the delegation prompt. The subagent uses this extract as its primary source for understanding the anchored text; it re-reads the full document or event directory only if the inline extract is insufficient or absent.

The dotmesh subagent roster: `build`, `plan`, `review`, `security`, `editor`, `maths`, `reviser`.

> The human can assign a thread directly from the mesh-review VS Code extension (button "Asignar" on open thread cards). The extension writes a `thread.assigned` event with `agent` set to one of the four assignable values: `security`, `maths`, `reviser`, `editor`.

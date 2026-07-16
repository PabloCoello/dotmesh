#!/usr/bin/env node

// src/sidecar.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, appendFile, chmod, readdir, stat } from "node:fs/promises";
import * as path from "node:path";
var execFileAsync = promisify(execFile);
var VALID_COMMENT_TYPES = /* @__PURE__ */ new Set([
  "edita",
  "sugerencia",
  "pregunta",
  "verifica",
  "nota",
  "referencia",
  "supuesto"
]);
function anchorChanged(a, b) {
  const aDetached = "detached" in a;
  const bDetached = "detached" in b;
  if (aDetached !== bDetached) return true;
  if (aDetached && bDetached) return false;
  const aa = a;
  const bb = b;
  return aa.quote !== bb.quote || aa.line_hint !== bb.line_hint || aa.char_offset !== bb.char_offset;
}
function utcTimestampMs() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
function compareEvents(a, b) {
  const ta = Date.parse(a.created_at);
  const tb = Date.parse(b.created_at);
  if (ta !== tb) return ta - tb;
  const ra = a.type === "thread.opened" ? 0 : 1;
  const rb = b.type === "thread.opened" ? 0 : 1;
  if (ra !== rb) return ra - rb;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
function project(events) {
  const sorted = [...events].sort(compareEvents);
  const map = /* @__PURE__ */ new Map();
  const order = [];
  for (const ev of sorted) {
    const tid = ev.thread_id;
    if (ev.type === "thread.opened") {
      if (!VALID_COMMENT_TYPES.has(ev.commentType)) {
        console.error(`mesh-review: commentType desconocido "${ev.commentType}" en hilo ${tid}`);
      }
      const proj2 = {
        thread_id: tid,
        commentType: ev.commentType,
        anchor: ev.anchor,
        status: "open",
        openedCommit: ev.commit ?? null,
        messages: [{
          id: ev.id,
          body: ev.body,
          author: ev.author,
          created_at: ev.created_at,
          retracted: false,
          commit: ev.commit ?? null
        }],
        openedAt: ev.created_at,
        openedBy: ev.author
      };
      if (ev.assignee !== void 0) proj2.assignee = ev.assignee;
      if (ev.confidence !== void 0) proj2.confidence = ev.confidence;
      if (ev.refs !== void 0) proj2.refs = ev.refs;
      map.set(tid, proj2);
      order.push(tid);
      continue;
    }
    const proj = map.get(tid);
    if (!proj) continue;
    switch (ev.type) {
      case "message.posted": {
        const msg = {
          id: ev.id,
          body: ev.body,
          author: ev.author,
          created_at: ev.created_at,
          retracted: false,
          commit: ev.commit ?? null
        };
        if (ev.confidence !== void 0) msg.confidence = ev.confidence;
        proj.messages.push(msg);
        break;
      }
      case "message.revised": {
        const msg = proj.messages.find((m) => m.id === ev.target_message_id);
        if (msg) msg.body = ev.body;
        break;
      }
      case "message.retracted": {
        const msg = proj.messages.find((m) => m.id === ev.target_message_id);
        if (msg) msg.retracted = true;
        break;
      }
      case "thread.status-changed":
        proj.status = ev.to;
        break;
      case "thread.reanchored":
        if (ev.anchor !== void 0) {
          proj.anchor = ev.anchor;
          if (proj.status === "detached") proj.status = "open";
        } else if (ev.detached === true) {
          proj.anchor = { detached: true };
          proj.status = "detached";
        }
        break;
      case "thread.assigned":
        proj.assignee = ev.agent;
        proj.assignedAt = ev.created_at;
        break;
    }
  }
  return order.map((id) => map.get(id));
}
async function getGitRoot(fromDir) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd: fromDir }
    );
    return stdout.trim();
  } catch {
    return null;
  }
}
async function readEvents(dir, onError) {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const results = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const filePath = path.join(dir, name);
    try {
      const content = await readFile(filePath, "utf8");
      const parsed = JSON.parse(content);
      if (parsed?.version !== 2) continue;
      if (typeof parsed.id !== "string" || !isUuid(parsed.id)) continue;
      if (typeof parsed.thread_id !== "string" || !isUuid(parsed.thread_id)) continue;
      if ("body" in parsed && typeof parsed.body !== "string") continue;
      results.push(parsed);
    } catch (err) {
      const code = err.code;
      if (code !== "ENOENT") {
        if (onError) {
          onError(filePath, err);
        } else {
          console.error(`mesh-review: error leyendo evento ${filePath}:`, err);
        }
      }
    }
  }
  results.sort(compareEvents);
  return results;
}

// src/cli/commands/project.ts
import * as path2 from "node:path";
async function runProject(argv) {
  const pendingIdx = argv.indexOf("--pending");
  const pending = pendingIdx !== -1;
  const args = argv.filter((_, i) => i !== pendingIdx);
  const [docArg] = args;
  if (!docArg) {
    process.stderr.write("Uso: mesh-review project [--pending] <doc>\n");
    process.exit(1);
  }
  const docAbs = path2.resolve(docArg);
  const gitRoot = await getGitRoot(path2.dirname(docAbs));
  if (!gitRoot) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro de un repositorio git\n");
    process.exit(1);
  }
  const docRelPath = path2.relative(gitRoot, docAbs);
  if (docRelPath.startsWith("..")) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro del git root\n");
    process.exit(1);
  }
  const eventDir = path2.join(gitRoot, ".ai", "review", docRelPath);
  const events = await readEvents(eventDir);
  let threads = project(events);
  if (pending) {
    threads = threads.filter(isPending);
  }
  process.stdout.write(JSON.stringify(threads) + "\n");
}
function isPending(thread) {
  if (thread.status !== "open") return false;
  const lastMsg = thread.messages.filter((m) => !m.retracted).at(-1);
  if (!lastMsg) return false;
  if (lastMsg.author.kind !== "ai") return true;
  return thread.assignedAt !== void 0 && Date.parse(thread.assignedAt) > Date.parse(lastMsg.created_at);
}

// src/cli/commands/emit.ts
import * as path3 from "node:path";
import { mkdir as mkdir2, writeFile as writeFile2, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
async function runEmit(argv) {
  const [docArg, typeArg, ...pairs] = argv;
  if (!docArg || !typeArg) {
    process.stderr.write("Uso: mesh-review emit <doc> <tipo> [clave=valor...]\n");
    process.exit(1);
  }
  const docAbs = path3.resolve(docArg);
  const gitRoot = await getGitRoot(path3.dirname(docAbs));
  if (!gitRoot) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro de un repositorio git\n");
    process.exit(1);
  }
  const docRelPath = path3.relative(gitRoot, docAbs);
  if (docRelPath.startsWith("..")) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro del git root\n");
    process.exit(1);
  }
  const eventDir = path3.join(gitRoot, ".ai", "review", docRelPath);
  const id = randomUUID();
  const created_at = utcTimestampMs();
  const kvData = parseKvPairs(pairs);
  const event = {
    dirty: false,
    ...kvData,
    id,
    version: 2,
    type: typeArg,
    created_at
  };
  if (!isUuid(event.id)) {
    process.stderr.write(`mesh-review emit: id no es UUID v\xE1lido: ${event.id}
`);
    process.exit(1);
  }
  if ("thread_id" in event) {
    if (typeof event.thread_id !== "string" || !isUuid(event.thread_id)) {
      process.stderr.write(`mesh-review emit: thread_id no es UUID v\xE1lido: ${event.thread_id}
`);
      process.exit(1);
    }
  }
  if ("body" in event && typeof event.body !== "string") {
    process.stderr.write(`mesh-review emit: body debe ser una cadena de texto
`);
    process.exit(1);
  }
  await emitEvent(eventDir, event);
  process.stdout.write(`${id}
`);
}
async function emitEvent(eventDir, event) {
  if (!isUuid(event.id)) {
    throw new Error(`mesh-review: id de evento inv\xE1lido (no es UUID): ${event.id}`);
  }
  await mkdir2(eventDir, { recursive: true });
  const final = path3.join(eventDir, `${event.id}.json`);
  const tmp = `${final}.tmp`;
  await writeFile2(tmp, JSON.stringify(event, null, 2) + "\n", "utf8");
  await rename(tmp, final);
}
function parseKvPairs(pairs) {
  const result = {};
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx);
    const rawValue = pair.slice(idx + 1);
    let value;
    if (rawValue === "null") value = null;
    else if (rawValue === "true") value = true;
    else if (rawValue === "false") value = false;
    else value = rawValue;
    const parts = key.split(".");
    let obj = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof obj[part] !== "object" || obj[part] === null) {
        obj[part] = {};
      }
      obj = obj[part];
    }
    obj[parts[parts.length - 1]] = value;
  }
  return result;
}

// src/cli/commands/reanchor.ts
import { readFile as readFile2 } from "node:fs/promises";
import { randomUUID as randomUUID2 } from "node:crypto";
import * as path4 from "node:path";

// src/anchor.ts
var ANCHOR_UNCERTAINTY_THRESHOLD = 200;
function createAnchor(text, startOffset, endOffset) {
  const quote = text.slice(startOffset, endOffset);
  const textBefore = text.slice(0, startOffset);
  const line_hint = textBefore.split("\n").length - 1;
  return { quote, line_hint, char_offset: startOffset };
}
function resolveAnchor(text, anchor) {
  const { quote, char_offset } = anchor;
  if (!quote) return null;
  const occurrences = [];
  let searchFrom = 0;
  while (searchFrom <= text.length) {
    const idx = text.indexOf(quote, searchFrom);
    if (idx === -1) break;
    occurrences.push(idx);
    searchFrom = idx + quote.length;
  }
  if (occurrences.length === 0) return null;
  let best = occurrences[0];
  let bestDist = Math.abs(occurrences[0] - char_offset);
  for (let i = 1; i < occurrences.length; i++) {
    const dist = Math.abs(occurrences[i] - char_offset);
    if (dist < bestDist) {
      bestDist = dist;
      best = occurrences[i];
    }
  }
  const result = {
    startOffset: best,
    endOffset: best + quote.length
  };
  if (bestDist > ANCHOR_UNCERTAINTY_THRESHOLD) {
    result.uncertain = true;
  }
  return result;
}

// src/cli/commands/reanchor.ts
async function runReanchor(argv) {
  if (argv.includes("--help") || argv.length === 0) {
    printUsage();
    return;
  }
  const [docArg] = argv;
  const docAbs = path4.resolve(docArg);
  const gitRoot = await getGitRoot(path4.dirname(docAbs));
  if (!gitRoot) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro de un repositorio git\n");
    process.exit(1);
  }
  const docRelPath = path4.relative(gitRoot, docAbs);
  if (docRelPath.startsWith("..")) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro del git root\n");
    process.exit(1);
  }
  const eventDir = path4.join(gitRoot, ".ai", "review", docRelPath);
  let text;
  try {
    text = await readFile2(docAbs, "utf8");
  } catch {
    process.stderr.write(`mesh-review: no se puede leer el documento: ${docAbs}
`);
    process.exit(1);
  }
  const events = await readEvents(eventDir);
  const threads = project(events);
  const count = await reanchorThreads(text, threads, eventDir);
  process.stderr.write(`mesh-review reanchor: ${count} evento(s) emitido(s)
`);
}
async function reanchorThreads(text, threads, eventDir) {
  let count = 0;
  for (const thread of threads) {
    if (thread.status === "resolved" || thread.status === "detached") continue;
    if ("detached" in thread.anchor) continue;
    const stored = thread.anchor;
    const resolved = resolveAnchor(text, stored);
    let ev;
    if (resolved === null) {
      ev = {
        id: randomUUID2(),
        version: 2,
        type: "thread.reanchored",
        thread_id: thread.thread_id,
        author: { kind: "ai", model: "mesh-review-cli" },
        created_at: utcTimestampMs(),
        commit: null,
        dirty: false,
        detached: true
      };
    } else {
      const newAnchor = createAnchor(text, resolved.startOffset, resolved.endOffset);
      if (!anchorChanged(stored, newAnchor)) continue;
      ev = {
        id: randomUUID2(),
        version: 2,
        type: "thread.reanchored",
        thread_id: thread.thread_id,
        author: { kind: "ai", model: "mesh-review-cli" },
        created_at: utcTimestampMs(),
        commit: null,
        dirty: false,
        anchor: newAnchor
      };
    }
    await emitEvent(eventDir, ev);
    count++;
  }
  return count;
}
function printUsage() {
  process.stderr.write(
    [
      "Uso: mesh-review reanchor <doc>",
      "",
      "Re-resuelve las anclas de los hilos abiertos del documento contra su",
      "texto actual y emite thread.reanchored para los que han cambiado.",
      "",
      "Opciones:",
      "  --help   Muestra este mensaje",
      "",
      "Ejemplo:",
      "  mesh-review reanchor docs/SPEC.md"
    ].join("\n") + "\n"
  );
}

// src/cli/main.ts
async function main(argv = process.argv.slice(2)) {
  const [subcommand, ...rest] = argv;
  switch (subcommand) {
    case "project":
      await runProject(rest);
      break;
    case "emit":
      await runEmit(rest);
      break;
    case "reanchor":
      await runReanchor(rest);
      break;
    default:
      printUsage2();
      if (subcommand !== void 0) process.exit(1);
      break;
  }
}
function printUsage2() {
  process.stderr.write(
    [
      "Uso: mesh-review <subcomando> [argumentos]",
      "",
      "Subcomandos:",
      "  project [--pending] <doc>         Proyecta los hilos abiertos del documento",
      "  emit <doc> <tipo> [clave=valor\u2026]  Emite un evento de revisi\xF3n para el documento",
      "  reanchor <doc>                    Re-resuelve anclas y emite thread.reanchored",
      "",
      "Ejemplos:",
      "  mesh-review project --pending docs/SPEC.md",
      '  mesh-review emit docs/SPEC.md message.posted thread_id=<uuid> body="correcci\xF3n" commit=null',
      "  mesh-review reanchor docs/SPEC.md"
    ].join("\n") + "\n"
  );
}
main().catch((err) => {
  process.stderr.write(
    `mesh-review: ${err instanceof Error ? err.message : String(err)}
`
  );
  process.exit(1);
});
export {
  main
};

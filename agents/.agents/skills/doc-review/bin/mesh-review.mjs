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
  const nonRetracted = thread.messages.filter((m) => !m.retracted);
  const lastMsg = nonRetracted.at(-1);
  const lastIsAi = lastMsg?.author.kind === "ai";
  const hasAiFix = thread.messages.some(
    (m) => !m.retracted && m.author.kind === "ai" && m.commit !== null
  );
  if (!hasAiFix) return true;
  const lastAiFix = [...thread.messages].reverse().find((m) => !m.retracted && m.author.kind === "ai" && m.commit !== null);
  if (lastMsg && !lastIsAi && lastAiFix && Date.parse(lastMsg.created_at) > Date.parse(lastAiFix.created_at)) {
    return true;
  }
  if (thread.assignee && lastIsAi) {
    return true;
  }
  return false;
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
    default:
      printUsage();
      if (subcommand !== void 0) process.exit(1);
      break;
  }
}
function printUsage() {
  process.stderr.write(
    [
      "Uso: mesh-review <subcomando> [argumentos]",
      "",
      "Subcomandos:",
      "  project [--pending] <doc>         Proyecta los hilos abiertos del documento",
      "  emit <doc> <tipo> [clave=valor\u2026]  Emite un evento de revisi\xF3n para el documento",
      "",
      "Ejemplos:",
      "  mesh-review project --pending docs/SPEC.md",
      '  mesh-review emit docs/SPEC.md message.posted thread_id=<uuid> body="correcci\xF3n" commit=null'
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

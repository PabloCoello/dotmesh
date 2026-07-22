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
      if ("anchor" in parsed && parsed.anchor !== null && typeof parsed.anchor === "object") {
        const anchorRec = parsed.anchor;
        if ("line_hint" in anchorRec && typeof anchorRec.line_hint !== "number") continue;
        if ("char_offset" in anchorRec && typeof anchorRec.char_offset !== "number") continue;
        if ("quote" in anchorRec && typeof anchorRec.quote !== "string") continue;
      }
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

// src/cli/commands/fix.ts
import { readFile as readFile3 } from "node:fs/promises";
import { execFile as execFile2 } from "node:child_process";
import { promisify as promisify2 } from "node:util";
import { randomUUID as randomUUID3 } from "node:crypto";
import * as path5 from "node:path";
var execFileAsync2 = promisify2(execFile2);
function parseArgs(argv) {
  const positional = [];
  let commitMsg;
  let body;
  let reanchor = false;
  let alreadyDone;
  let model;
  let confidence;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-m") {
      commitMsg = argv[++i];
    } else if (arg === "--body") {
      body = argv[++i];
    } else if (arg === "--reanchor") {
      reanchor = true;
    } else if (arg === "--already-done") {
      alreadyDone = argv[++i];
    } else if (arg === "--model") {
      model = argv[++i];
    } else if (arg === "--confidence") {
      confidence = argv[++i];
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }
  return {
    doc: positional[0],
    threadId: positional[1],
    commitMsg,
    body,
    reanchor,
    alreadyDone,
    model,
    confidence
  };
}
async function runFix(argv) {
  if (argv.includes("--help") || argv.length === 0) {
    printUsage2();
    return;
  }
  const { doc, threadId, commitMsg, body, reanchor, alreadyDone, model, confidence } = parseArgs(argv);
  if (!doc || !threadId) {
    process.stderr.write("mesh-review fix: se requieren <doc> y <thread_id>\n");
    process.exit(1);
  }
  if (!commitMsg && alreadyDone === void 0) {
    process.stderr.write("mesh-review fix: se requiere -m <commit-msg>\n");
    process.exit(1);
  }
  if (body === void 0) {
    process.stderr.write("mesh-review fix: se requiere --body <respuesta>\n");
    process.exit(1);
  }
  if (!isUuid(threadId)) {
    process.stderr.write(`mesh-review fix: thread_id no es un UUID v\xE1lido: ${threadId}
`);
    process.exit(1);
  }
  const docAbs = path5.resolve(doc);
  const gitRoot = await getGitRoot(path5.dirname(docAbs));
  if (!gitRoot) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro de un repositorio git\n");
    process.exit(1);
  }
  const docRelPath = path5.relative(gitRoot, docAbs);
  if (docRelPath.startsWith("..")) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro del git root\n");
    process.exit(1);
  }
  const eventDir = path5.join(gitRoot, ".ai", "review", docRelPath);
  const sha = await resolveCommit({ gitRoot, docAbs, commitMsg, alreadyDone });
  const ev = {
    id: randomUUID3(),
    version: 2,
    type: "message.posted",
    thread_id: threadId,
    author: { kind: "ai", model: model ?? "mesh-review-cli" },
    created_at: utcTimestampMs(),
    commit: sha,
    dirty: false,
    body
  };
  if (confidence !== void 0) {
    ev.confidence = confidence;
  }
  await emitEvent(eventDir, ev);
  if (reanchor) {
    let text;
    try {
      text = await readFile3(docAbs, "utf8");
    } catch {
      process.stderr.write(`mesh-review fix: no se puede leer el documento para reanchor: ${docAbs}
`);
      process.exit(1);
    }
    const events = await readEvents(eventDir);
    const threads = project(events);
    await reanchorThreads(text, threads, eventDir);
  }
  process.stdout.write(`${ev.id}
`);
  process.stderr.write(`${sha}
`);
}
async function resolveCommit({
  gitRoot,
  docAbs,
  commitMsg,
  alreadyDone
}) {
  if (alreadyDone !== void 0) {
    return alreadyDone;
  }
  let statusOut;
  try {
    const result = await execFileAsync2(
      "git",
      ["status", "--porcelain", "--", docAbs],
      { cwd: gitRoot }
    );
    statusOut = result.stdout;
  } catch (err) {
    process.stderr.write(
      `mesh-review fix: error al verificar el estado git: ${err instanceof Error ? err.message : String(err)}
`
    );
    process.exit(1);
  }
  if (!statusOut.trim()) {
    process.stderr.write(
      `mesh-review fix: el documento no tiene cambios pendientes en el worktree: ${path5.relative(gitRoot, docAbs)}
`
    );
    process.exit(1);
  }
  try {
    await execFileAsync2(
      "git",
      ["commit", "-m", commitMsg, "--", docAbs],
      { cwd: gitRoot }
    );
  } catch (err) {
    process.stderr.write(
      `mesh-review fix: error en git commit: ${err instanceof Error ? err.message : String(err)}
`
    );
    process.exit(1);
  }
  let shaOut;
  try {
    const result = await execFileAsync2("git", ["rev-parse", "--short", "HEAD"], { cwd: gitRoot });
    shaOut = result.stdout;
  } catch (err) {
    process.stderr.write(
      `mesh-review fix: error al capturar el SHA: ${err instanceof Error ? err.message : String(err)}
`
    );
    process.exit(1);
  }
  return shaOut.trim();
}
function printUsage2() {
  process.stderr.write(
    [
      "Uso: mesh-review fix <doc> <thread_id> -m <commit-msg> --body <respuesta>",
      "                    [--reanchor] [--already-done <sha>]",
      "                    [--model <id>] [--confidence alta|media|baja]",
      "",
      "Crea un commit del documento con pathspec expl\xEDcito, captura el SHA corto",
      'y emite un evento message.posted con author.kind="ai" y ese commit.',
      "",
      "Opciones:",
      "  -m <msg>             Mensaje del commit (obligatorio sin --already-done)",
      "  --body <texto>       Cuerpo del mensaje IA en el hilo (obligatorio)",
      "  --reanchor           Re-resuelve anclas tras el commit",
      "  --already-done <sha> Usa este SHA en lugar de crear un commit nuevo",
      "  --model <id>         Identificador del modelo (por defecto: mesh-review-cli)",
      "  --confidence <nivel> Nivel de confianza: alta, media o baja",
      "  --help               Muestra este mensaje",
      "",
      "Salida:",
      "  stdout: UUID del evento message.posted escrito",
      "  stderr: SHA corto del commit (nuevo o --already-done)",
      "",
      "Ejemplo:",
      '  mesh-review fix docs/SPEC.md <uuid> -m "fix(spec): corrige p\xE1rrafo" --body "Correcci\xF3n aplicada"'
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
    case "fix":
      await runFix(rest);
      break;
    default:
      printUsage3();
      if (subcommand !== void 0) process.exit(1);
      break;
  }
}
function printUsage3() {
  process.stderr.write(
    [
      "Uso: mesh-review <subcomando> [argumentos]",
      "",
      "Subcomandos:",
      "  project [--pending] <doc>         Proyecta los hilos abiertos del documento",
      "  emit <doc> <tipo> [clave=valor\u2026]  Emite un evento de revisi\xF3n para el documento",
      "  reanchor <doc>                    Re-resuelve anclas y emite thread.reanchored",
      "  fix <doc> <thread_id> -m <msg> --body <texto>",
      "                                    Commit + evento message.posted en una llamada",
      "",
      "Ejemplos:",
      "  mesh-review project --pending docs/SPEC.md",
      '  mesh-review emit docs/SPEC.md message.posted thread_id=<uuid> body="correcci\xF3n" commit=null',
      "  mesh-review reanchor docs/SPEC.md",
      '  mesh-review fix docs/SPEC.md <uuid> -m "fix(spec): corrige p\xE1rrafo" --body "Aplicado"'
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

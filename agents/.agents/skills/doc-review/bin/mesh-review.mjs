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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
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
async function getHeadSha(gitRoot) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--short", "HEAD"],
      { cwd: gitRoot }
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
async function getUserName(fromDir) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["config", "user.name"],
      { cwd: fromDir }
    );
    return stdout.trim() || void 0;
  } catch {
    return void 0;
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
  const discardedPaths = [];
  const MAX_EVENT_FILE_BYTES = 1 * 1024 * 1024;
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const filePath = path.join(dir, name);
    try {
      const fileStat = await stat(filePath);
      if (fileStat.size > MAX_EVENT_FILE_BYTES) {
        discardedPaths.push(filePath);
        continue;
      }
      const content = await readFile(filePath, "utf8");
      const parsed = JSON.parse(content);
      if (parsed?.version !== 2) continue;
      if (typeof parsed.id !== "string" || !isUuid(parsed.id)) continue;
      if (typeof parsed.thread_id !== "string" || !isUuid(parsed.thread_id)) continue;
      if ("body" in parsed && typeof parsed.body !== "string") continue;
      if (!parsed.author || typeof parsed.author !== "object" || Array.isArray(parsed.author)) {
        discardedPaths.push(filePath);
        continue;
      }
      const authorKind = parsed.author.kind;
      if (authorKind !== "human" && authorKind !== "ai") {
        discardedPaths.push(filePath);
        continue;
      }
      if (authorKind === "ai") {
        const authorModel = parsed.author.model;
        if (typeof authorModel !== "string") {
          discardedPaths.push(filePath);
          continue;
        }
      }
      if ("anchor" in parsed && parsed.anchor !== null && typeof parsed.anchor === "object") {
        const anchorRec = parsed.anchor;
        const badField = ("line_hint" in anchorRec && typeof anchorRec.line_hint !== "number" ? "line_hint" : null) ?? ("char_offset" in anchorRec && typeof anchorRec.char_offset !== "number" ? "char_offset" : null) ?? ("quote" in anchorRec && typeof anchorRec.quote !== "string" ? "quote" : null);
        if (badField !== null) {
          discardedPaths.push(filePath);
          continue;
        }
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
  if (discardedPaths.length > 0) {
    console.warn(
      `mesh-review: descartando ${discardedPaths.length} evento(s) malformado(s) en ${dir}; ejemplo: ${discardedPaths[0]}`
    );
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
  const reviewDir = path2.resolve(gitRoot, ".ai", "review");
  const eventDir = path2.resolve(reviewDir, path2.relative(gitRoot, docAbs));
  if (!eventDir.startsWith(reviewDir + path2.sep)) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro del git root\n");
    process.exit(1);
  }
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
  const reviewDir = path3.resolve(gitRoot, ".ai", "review");
  const eventDir = path3.resolve(reviewDir, path3.relative(gitRoot, docAbs));
  if (!eventDir.startsWith(reviewDir + path3.sep)) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro del git root\n");
    process.exit(1);
  }
  const id = randomUUID();
  const created_at = utcTimestampMs();
  let kvData;
  try {
    kvData = parseKvPairs(pairs);
  } catch (err) {
    process.stderr.write(`${err.message}
`);
    process.exit(1);
  }
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
var NUMERIC_KV_PATHS = /* @__PURE__ */ new Set(["anchor.line_hint", "anchor.char_offset"]);
var FORBIDDEN_KEY_SEGMENTS = /* @__PURE__ */ new Set(["__proto__", "constructor", "prototype"]);
function parseKvPairs(pairs) {
  const result = {};
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx);
    const rawValue = pair.slice(idx + 1);
    let value;
    if (rawValue === "null") {
      value = null;
    } else if (rawValue === "true") {
      value = true;
    } else if (rawValue === "false") {
      value = false;
    } else if (NUMERIC_KV_PATHS.has(key)) {
      if (!/^\d+$/.test(rawValue)) {
        throw new Error(
          `mesh-review emit: ${key} debe ser un entero no negativo, pero se recibi\xF3: "${rawValue}"`
        );
      }
      value = parseInt(rawValue, 10);
    } else {
      value = rawValue;
    }
    const parts = key.split(".");
    for (const seg of parts) {
      if (FORBIDDEN_KEY_SEGMENTS.has(seg.toLowerCase())) {
        throw new Error(
          `mesh-review emit: clave reservada rechazada ("${seg}"); no se admiten __proto__, constructor ni prototype`
        );
      }
    }
    let obj = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof obj[part] !== "object" || obj[part] === null) {
        obj[part] = /* @__PURE__ */ Object.create(null);
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
  const reviewDir = path4.resolve(gitRoot, ".ai", "review");
  const eventDir = path4.resolve(reviewDir, path4.relative(gitRoot, docAbs));
  if (!eventDir.startsWith(reviewDir + path4.sep)) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro del git root\n");
    process.exit(1);
  }
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
  if (alreadyDone !== void 0 && !/^[0-9a-f]{7,40}$/i.test(alreadyDone)) {
    process.stderr.write(
      `mesh-review fix: --already-done debe ser un SHA hex de 7\u201340 caracteres: ${alreadyDone}
`
    );
    process.exit(1);
  }
  if (commitMsg !== void 0 && alreadyDone !== void 0) {
    process.stderr.write(
      "mesh-review fix: -m y --already-done son mutuamente excluyentes\n"
    );
    process.exit(1);
  }
  if (!commitMsg && alreadyDone === void 0) {
    process.stderr.write("mesh-review fix: se requiere -m <commit-msg> (o --already-done <sha>)\n");
    process.exit(1);
  }
  if (body === void 0) {
    process.stderr.write("mesh-review fix: se requiere --body <respuesta>\n");
    process.exit(1);
  }
  if (body.length > 1e4) {
    process.stderr.write(
      `mesh-review fix: --body supera el l\xEDmite de 10000 caracteres (${body.length})
`
    );
    process.exit(1);
  }
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/.test(body)) {
    process.stderr.write(
      "mesh-review fix: --body contiene caracteres de control no permitidos\n"
    );
    process.exit(1);
  }
  if (!isUuid(threadId)) {
    process.stderr.write(`mesh-review fix: thread_id no es un UUID v\xE1lido: ${threadId}
`);
    process.exit(1);
  }
  if (confidence !== void 0 && !["alta", "media", "baja"].includes(confidence)) {
    process.stderr.write(
      `mesh-review fix: --confidence debe ser alta, media o baja: ${confidence}
`
    );
    process.exit(1);
  }
  const docAbs = path5.resolve(doc);
  const gitRoot = await getGitRoot(path5.dirname(docAbs));
  if (!gitRoot) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro de un repositorio git\n");
    process.exit(1);
  }
  const reviewDir = path5.resolve(gitRoot, ".ai", "review");
  const eventDir = path5.resolve(reviewDir, path5.relative(gitRoot, docAbs));
  if (!eventDir.startsWith(reviewDir + path5.sep)) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro del git root\n");
    process.exit(1);
  }
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
      "Uso: mesh-review fix <doc> <thread_id>",
      "         (-m <commit-msg> | --already-done <sha>)",
      "         --body <respuesta>",
      "         [--reanchor] [--model <id>] [--confidence alta|media|baja]",
      "",
      "Crea un commit del documento con pathspec expl\xEDcito, captura el SHA corto",
      'y emite un evento message.posted con author.kind="ai" y ese commit.',
      "Con --already-done se omite el commit y se usa el SHA suministrado.",
      "-m y --already-done son mutuamente excluyentes.",
      "",
      "Opciones:",
      "  -m <msg>             Mensaje del commit (obligatorio sin --already-done)",
      "  --already-done <sha> SHA hex (7-40 chars) a usar en lugar de crear un commit",
      "  --body <texto>       Cuerpo del mensaje IA en el hilo (obligatorio)",
      "  --reanchor           Re-resuelve anclas tras el commit",
      "  --model <id>         Identificador del modelo (por defecto: mesh-review-cli)",
      "  --confidence <nivel> Nivel de confianza: alta, media o baja",
      "  --help               Muestra este mensaje",
      "",
      "Salida:",
      "  stdout: UUID del evento message.posted escrito",
      "  stderr: SHA corto del commit (nuevo o --already-done)",
      "",
      "Ejemplos:",
      '  mesh-review fix docs/SPEC.md <uuid> -m "fix(spec): corrige p\xE1rrafo" --body "Correcci\xF3n aplicada"',
      '  mesh-review fix docs/SPEC.md <uuid> --already-done abc1234 --body "Correcci\xF3n aplicada en commit previo"'
    ].join("\n") + "\n"
  );
}

// src/cli/commands/open.ts
import { readFile as readFile4 } from "node:fs/promises";
import { randomUUID as randomUUID4 } from "node:crypto";
import * as path6 from "node:path";

// src/cli/args.ts
function parseCliArgs(argv, knownFlags, subcommand) {
  const flags = /* @__PURE__ */ new Map();
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=", 2);
      let name;
      let value;
      if (eqIdx !== -1) {
        name = arg.slice(2, eqIdx);
        value = arg.slice(eqIdx + 1);
      } else {
        name = arg.slice(2);
        if (argv[i + 1] === void 0) {
          process.stderr.write(`mesh-review ${subcommand}: la flag --${name} requiere un valor
`);
          process.exit(1);
        }
        value = argv[i + 1];
        i++;
      }
      if (!knownFlags.has(name)) {
        process.stderr.write(`mesh-review ${subcommand}: flag desconocida: --${name}
`);
        process.exit(1);
      }
      flags.set(name, value);
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

// src/cli/commands/open.ts
var OPEN_KNOWN_FLAGS = /* @__PURE__ */ new Set([
  "offset",
  "end-offset",
  "type",
  "body",
  "author",
  "model",
  "effort",
  "subagent",
  "confidence",
  "assignee"
]);
var MAX_BODY_CHARS = 1e4;
var CTRL_CHAR_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/;
async function runOpen(argv) {
  if (argv.includes("--help") || argv.length === 0) {
    printUsage3();
    return;
  }
  const { flags, positionals } = parseCliArgs(argv, OPEN_KNOWN_FLAGS, "open");
  const doc = positionals[0];
  const offsetStr = flags.get("offset");
  const endOffsetStr = flags.get("end-offset");
  const type = flags.get("type");
  const body = flags.get("body");
  const author = flags.get("author") ?? "human";
  const model = flags.get("model");
  const effort = flags.get("effort");
  const subagent = flags.get("subagent");
  const confidence = flags.get("confidence");
  const assignee = flags.get("assignee");
  if (!doc) {
    process.stderr.write("mesh-review open: se requiere <doc>\n");
    process.exit(1);
  }
  if (offsetStr === void 0) {
    process.stderr.write("mesh-review open: se requiere --offset\n");
    process.exit(1);
  }
  if (endOffsetStr === void 0) {
    process.stderr.write("mesh-review open: se requiere --end-offset\n");
    process.exit(1);
  }
  if (!type) {
    process.stderr.write("mesh-review open: se requiere --type\n");
    process.exit(1);
  }
  if (!body || body.length === 0) {
    process.stderr.write("mesh-review open: se requiere --body y no puede estar vac\xEDo\n");
    process.exit(1);
  }
  if (body.length > MAX_BODY_CHARS) {
    process.stderr.write(
      `mesh-review open: --body supera el l\xEDmite de ${MAX_BODY_CHARS} caracteres (${body.length})
`
    );
    process.exit(1);
  }
  if (CTRL_CHAR_RE.test(body)) {
    process.stderr.write(
      "mesh-review open: --body contiene caracteres de control no permitidos\n"
    );
    process.exit(1);
  }
  const offset = Number(offsetStr);
  const endOffset = Number(endOffsetStr);
  if (!Number.isInteger(offset) || offset < 0) {
    process.stderr.write(`mesh-review open: --offset debe ser un entero no negativo: ${offsetStr}
`);
    process.exit(1);
  }
  if (!Number.isInteger(endOffset) || endOffset < 0) {
    process.stderr.write(`mesh-review open: --end-offset debe ser un entero no negativo: ${endOffsetStr}
`);
    process.exit(1);
  }
  if (endOffset <= offset) {
    process.stderr.write(`mesh-review open: --end-offset (${endOffset}) debe ser mayor que --offset (${offset})
`);
    process.exit(1);
  }
  if (!VALID_COMMENT_TYPES.has(type)) {
    process.stderr.write(
      `mesh-review open: --type inv\xE1lido: ${type}. Debe ser uno de: ${[...VALID_COMMENT_TYPES].join(", ")}
`
    );
    process.exit(1);
  }
  if (author !== "human" && author !== "ai") {
    process.stderr.write(`mesh-review open: --author debe ser "human" o "ai": ${author}
`);
    process.exit(1);
  }
  if (author === "ai" && !model) {
    process.stderr.write("mesh-review open: --author ai requiere --model\n");
    process.exit(1);
  }
  if (author !== "ai" && model !== void 0) {
    process.stderr.write("mesh-review open: --model solo es v\xE1lido con --author ai\n");
    process.exit(1);
  }
  if (author !== "ai" && effort !== void 0) {
    process.stderr.write("mesh-review open: --effort solo es v\xE1lido con --author ai\n");
    process.exit(1);
  }
  if (author !== "ai" && subagent !== void 0) {
    process.stderr.write("mesh-review open: --subagent solo es v\xE1lido con --author ai\n");
    process.exit(1);
  }
  const typesRequiringConfidence = /* @__PURE__ */ new Set(["verifica", "supuesto"]);
  if (typesRequiringConfidence.has(type) && !confidence) {
    process.stderr.write(
      `mesh-review open: --type ${type} requiere --confidence (alta|media|baja)
`
    );
    process.exit(1);
  }
  if (confidence !== void 0 && !["alta", "media", "baja"].includes(confidence)) {
    process.stderr.write(
      `mesh-review open: --confidence debe ser alta, media o baja: ${confidence}
`
    );
    process.exit(1);
  }
  const docAbs = path6.resolve(doc);
  const gitRoot = await getGitRoot(path6.dirname(docAbs));
  if (!gitRoot) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro de un repositorio git\n");
    process.exit(1);
  }
  const reviewDir = path6.resolve(gitRoot, ".ai", "review");
  const eventDir = path6.resolve(reviewDir, path6.relative(gitRoot, docAbs));
  if (!eventDir.startsWith(reviewDir + path6.sep)) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro del git root\n");
    process.exit(1);
  }
  let text;
  try {
    text = await readFile4(docAbs, "utf8");
  } catch (err) {
    process.stderr.write(
      `mesh-review open: no se puede leer el documento: ${err instanceof Error ? err.message : String(err)}
`
    );
    process.exit(1);
  }
  if (offset >= text.length) {
    process.stderr.write(
      `mesh-review open: --offset (${offset}) fuera del documento (longitud ${text.length})
`
    );
    process.exit(1);
  }
  if (endOffset > text.length) {
    process.stderr.write(
      `mesh-review open: --end-offset (${endOffset}) fuera del documento (longitud ${text.length})
`
    );
    process.exit(1);
  }
  const anchor = createAnchor(text, offset, endOffset);
  let authorObj;
  if (author === "ai") {
    authorObj = {
      kind: "ai",
      model,
      ...effort !== void 0 ? { effort } : {},
      ...subagent !== void 0 ? { subagent } : {}
    };
  } else {
    const name = await getUserName(path6.dirname(docAbs));
    authorObj = name !== void 0 ? { kind: "human", name } : { kind: "human" };
  }
  const threadId = randomUUID4();
  const ev = {
    id: threadId,
    version: 2,
    type: "thread.opened",
    thread_id: threadId,
    author: authorObj,
    created_at: utcTimestampMs(),
    commit: await getHeadSha(gitRoot),
    dirty: false,
    anchor,
    commentType: type,
    body
  };
  if (confidence !== void 0) ev.confidence = confidence;
  if (assignee !== void 0) ev.assignee = assignee;
  await emitEvent(eventDir, ev);
  process.stdout.write(`${threadId}
`);
}
function printUsage3() {
  process.stderr.write(
    [
      "Uso: mesh-review open <doc>",
      "         --offset <n> --end-offset <n>",
      "         --type <commentType> --body <texto>",
      "         [--author human|ai] [--model <id>]",
      "         [--effort <str>] [--subagent <str>]",
      "         [--confidence alta|media|baja] [--assignee <nombre>]",
      "",
      "Crea un hilo de revisi\xF3n anclado a la selecci\xF3n [offset, end-offset) del",
      "documento. Los offsets son \xEDndices de unidades de c\xF3digo UTF-16 (\xEDndices",
      "de cadena JS). Imprime el UUID del nuevo hilo en stdout.",
      "",
      "Tipos v\xE1lidos: edita, sugerencia, pregunta, verifica, nota, referencia, supuesto",
      "  --type verifica|supuesto requiere --confidence.",
      "  --author ai requiere --model.",
      "",
      "Salida:",
      "  stdout: UUID del nuevo hilo (thread_id)",
      "",
      "Ejemplo:",
      '  mesh-review open docs/SPEC.md --offset 0 --end-offset 5 --type nota --body "Revisar"'
    ].join("\n") + "\n"
  );
}

// src/cli/commands/reply.ts
import { randomUUID as randomUUID5 } from "node:crypto";
import * as path7 from "node:path";
var REPLY_KNOWN_FLAGS = /* @__PURE__ */ new Set([
  "body",
  "author",
  "model",
  "effort",
  "subagent",
  "confidence"
]);
var MAX_BODY_CHARS2 = 1e4;
var CTRL_CHAR_RE2 = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/;
async function runReply(argv) {
  if (argv.includes("--help") || argv.length === 0) {
    printUsage4();
    return;
  }
  const { flags, positionals } = parseCliArgs(argv, REPLY_KNOWN_FLAGS, "reply");
  const doc = positionals[0];
  const threadId = positionals[1];
  const body = flags.get("body");
  const author = flags.get("author") ?? "human";
  const model = flags.get("model");
  const effort = flags.get("effort");
  const subagent = flags.get("subagent");
  const confidence = flags.get("confidence");
  if (!doc) {
    process.stderr.write("mesh-review reply: se requiere <doc>\n");
    process.exit(1);
  }
  if (!threadId) {
    process.stderr.write("mesh-review reply: se requiere <thread_id>\n");
    process.exit(1);
  }
  if (!isUuid(threadId)) {
    process.stderr.write(`mesh-review reply: thread_id no es un UUID v\xE1lido: ${threadId}
`);
    process.exit(1);
  }
  if (!body || body.length === 0) {
    process.stderr.write("mesh-review reply: se requiere --body y no puede estar vac\xEDo\n");
    process.exit(1);
  }
  if (body.length > MAX_BODY_CHARS2) {
    process.stderr.write(
      `mesh-review reply: --body supera el l\xEDmite de ${MAX_BODY_CHARS2} caracteres (${body.length})
`
    );
    process.exit(1);
  }
  if (CTRL_CHAR_RE2.test(body)) {
    process.stderr.write(
      "mesh-review reply: --body contiene caracteres de control no permitidos\n"
    );
    process.exit(1);
  }
  if (author !== "human" && author !== "ai") {
    process.stderr.write(`mesh-review reply: --author debe ser "human" o "ai": ${author}
`);
    process.exit(1);
  }
  if (author === "ai" && !model) {
    process.stderr.write("mesh-review reply: --author ai requiere --model\n");
    process.exit(1);
  }
  if (author !== "ai" && model !== void 0) {
    process.stderr.write("mesh-review reply: --model solo es v\xE1lido con --author ai\n");
    process.exit(1);
  }
  if (author !== "ai" && effort !== void 0) {
    process.stderr.write("mesh-review reply: --effort solo es v\xE1lido con --author ai\n");
    process.exit(1);
  }
  if (author !== "ai" && subagent !== void 0) {
    process.stderr.write("mesh-review reply: --subagent solo es v\xE1lido con --author ai\n");
    process.exit(1);
  }
  if (confidence !== void 0 && !["alta", "media", "baja"].includes(confidence)) {
    process.stderr.write(
      `mesh-review reply: --confidence debe ser alta, media o baja: ${confidence}
`
    );
    process.exit(1);
  }
  const docAbs = path7.resolve(doc);
  const gitRoot = await getGitRoot(path7.dirname(docAbs));
  if (!gitRoot) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro de un repositorio git\n");
    process.exit(1);
  }
  const reviewDir = path7.resolve(gitRoot, ".ai", "review");
  const eventDir = path7.resolve(reviewDir, path7.relative(gitRoot, docAbs));
  if (!eventDir.startsWith(reviewDir + path7.sep)) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro del git root\n");
    process.exit(1);
  }
  const existingEvents = await readEvents(eventDir);
  const threads = project(existingEvents);
  const threadExists = threads.some((t) => t.thread_id === threadId);
  if (!threadExists) {
    process.stderr.write(`mesh-review reply: el hilo ${threadId} no existe en este documento
`);
    process.exit(1);
  }
  let authorObj;
  if (author === "ai") {
    authorObj = {
      kind: "ai",
      model,
      ...effort !== void 0 ? { effort } : {},
      ...subagent !== void 0 ? { subagent } : {}
    };
  } else {
    const name = await getUserName(path7.dirname(docAbs));
    authorObj = name !== void 0 ? { kind: "human", name } : { kind: "human" };
  }
  const id = randomUUID5();
  const ev = {
    id,
    version: 2,
    type: "message.posted",
    thread_id: threadId,
    author: authorObj,
    created_at: utcTimestampMs(),
    commit: await getHeadSha(gitRoot),
    dirty: false,
    body
  };
  if (confidence !== void 0) ev.confidence = confidence;
  await emitEvent(eventDir, ev);
  process.stdout.write(`${id}
`);
}
function printUsage4() {
  process.stderr.write(
    [
      "Uso: mesh-review reply <doc> <thread_id>",
      "         --body <texto>",
      "         [--author human|ai] [--model <id>]",
      "         [--effort <str>] [--subagent <str>]",
      "         [--confidence alta|media|baja]",
      "",
      "Publica un mensaje en el hilo sin hacer commit de git. El campo commit",
      "captura el SHA corto del HEAD actual (o null). Imprime el UUID del",
      "evento message.posted en stdout.",
      "",
      "  --author ai requiere --model.",
      "",
      "Salida:",
      "  stdout: UUID del evento message.posted",
      "",
      "Ejemplo:",
      '  mesh-review reply docs/SPEC.md <uuid> --body "Correcci\xF3n aplicada"'
    ].join("\n") + "\n"
  );
}

// src/cli/commands/resolve.ts
import { randomUUID as randomUUID6 } from "node:crypto";
import * as path8 from "node:path";
var RESOLVE_KNOWN_FLAGS = /* @__PURE__ */ new Set(["author", "model", "effort", "subagent"]);
async function runResolve(argv) {
  if (argv.includes("--help") || argv.length === 0) {
    printUsage5();
    return;
  }
  const { flags, positionals } = parseCliArgs(argv, RESOLVE_KNOWN_FLAGS, "resolve");
  const doc = positionals[0];
  const threadId = positionals[1];
  const author = flags.get("author") ?? "human";
  const model = flags.get("model");
  const effort = flags.get("effort");
  const subagent = flags.get("subagent");
  if (!doc) {
    process.stderr.write("mesh-review resolve: se requiere <doc>\n");
    process.exit(1);
  }
  if (!threadId) {
    process.stderr.write("mesh-review resolve: se requiere <thread_id>\n");
    process.exit(1);
  }
  if (!isUuid(threadId)) {
    process.stderr.write(`mesh-review resolve: thread_id no es un UUID v\xE1lido: ${threadId}
`);
    process.exit(1);
  }
  if (author !== "human" && author !== "ai") {
    process.stderr.write(`mesh-review resolve: --author debe ser "human" o "ai": ${author}
`);
    process.exit(1);
  }
  if (author === "ai" && !model) {
    process.stderr.write("mesh-review resolve: --author ai requiere --model\n");
    process.exit(1);
  }
  if (author !== "ai" && model !== void 0) {
    process.stderr.write("mesh-review resolve: --model solo es v\xE1lido con --author ai\n");
    process.exit(1);
  }
  if (author !== "ai" && effort !== void 0) {
    process.stderr.write("mesh-review resolve: --effort solo es v\xE1lido con --author ai\n");
    process.exit(1);
  }
  if (author !== "ai" && subagent !== void 0) {
    process.stderr.write("mesh-review resolve: --subagent solo es v\xE1lido con --author ai\n");
    process.exit(1);
  }
  const docAbs = path8.resolve(doc);
  const gitRoot = await getGitRoot(path8.dirname(docAbs));
  if (!gitRoot) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro de un repositorio git\n");
    process.exit(1);
  }
  const reviewDir = path8.resolve(gitRoot, ".ai", "review");
  const eventDir = path8.resolve(reviewDir, path8.relative(gitRoot, docAbs));
  if (!eventDir.startsWith(reviewDir + path8.sep)) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro del git root\n");
    process.exit(1);
  }
  const existingEvents = await readEvents(eventDir);
  const threads = project(existingEvents);
  const threadExists = threads.some((t) => t.thread_id === threadId);
  if (!threadExists) {
    process.stderr.write(`mesh-review resolve: el hilo ${threadId} no existe en este documento
`);
    process.exit(1);
  }
  let authorObj;
  if (author === "ai") {
    authorObj = {
      kind: "ai",
      model,
      ...effort !== void 0 ? { effort } : {},
      ...subagent !== void 0 ? { subagent } : {}
    };
  } else {
    const name = await getUserName(path8.dirname(docAbs));
    authorObj = name !== void 0 ? { kind: "human", name } : { kind: "human" };
  }
  const id = randomUUID6();
  const ev = {
    id,
    version: 2,
    type: "thread.status-changed",
    thread_id: threadId,
    author: authorObj,
    created_at: utcTimestampMs(),
    commit: await getHeadSha(gitRoot),
    dirty: false,
    to: "resolved"
  };
  await emitEvent(eventDir, ev);
  process.stdout.write(`${id}
`);
}
function printUsage5() {
  process.stderr.write(
    [
      "Uso: mesh-review resolve <doc> <thread_id>",
      "         [--author human|ai] [--model <id>]",
      "         [--effort <str>] [--subagent <str>]",
      "",
      "Cierra un hilo de revisi\xF3n emitiendo thread.status-changed to=resolved.",
      "Imprime el UUID del nuevo evento en stdout.",
      "",
      "  --author ai requiere --model.",
      "",
      "Salida:",
      "  stdout: UUID del evento thread.status-changed",
      "",
      "Ejemplo:",
      "  mesh-review resolve docs/SPEC.md <uuid>"
    ].join("\n") + "\n"
  );
}

// src/cli/commands/retract.ts
import { randomUUID as randomUUID7 } from "node:crypto";
import * as path9 from "node:path";
var RETRACT_KNOWN_FLAGS = /* @__PURE__ */ new Set(["reason", "author", "model", "effort", "subagent"]);
var MAX_REASON_CHARS = 1e4;
var CTRL_CHAR_RE3 = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/;
async function runRetract(argv) {
  if (argv.includes("--help") || argv.length === 0) {
    printUsage6();
    return;
  }
  const { flags, positionals } = parseCliArgs(argv, RETRACT_KNOWN_FLAGS, "retract");
  const doc = positionals[0];
  const threadId = positionals[1];
  const messageId = positionals[2];
  const reason = flags.get("reason");
  const author = flags.get("author") ?? "human";
  const model = flags.get("model");
  const effort = flags.get("effort");
  const subagent = flags.get("subagent");
  if (!doc) {
    process.stderr.write("mesh-review retract: se requiere <doc>\n");
    process.exit(1);
  }
  if (!threadId) {
    process.stderr.write("mesh-review retract: se requiere <thread_id>\n");
    process.exit(1);
  }
  if (!isUuid(threadId)) {
    process.stderr.write(`mesh-review retract: thread_id no es un UUID v\xE1lido: ${threadId}
`);
    process.exit(1);
  }
  if (!messageId) {
    process.stderr.write("mesh-review retract: se requiere <message_id>\n");
    process.exit(1);
  }
  if (!isUuid(messageId)) {
    process.stderr.write(`mesh-review retract: message_id no es un UUID v\xE1lido: ${messageId}
`);
    process.exit(1);
  }
  if (reason !== void 0 && reason.length > MAX_REASON_CHARS) {
    process.stderr.write(
      `mesh-review retract: --reason supera el l\xEDmite de ${MAX_REASON_CHARS} caracteres (${reason.length})
`
    );
    process.exit(1);
  }
  if (reason !== void 0 && CTRL_CHAR_RE3.test(reason)) {
    process.stderr.write(
      "mesh-review retract: --reason contiene caracteres de control no permitidos\n"
    );
    process.exit(1);
  }
  if (author !== "human" && author !== "ai") {
    process.stderr.write(`mesh-review retract: --author debe ser "human" o "ai": ${author}
`);
    process.exit(1);
  }
  if (author === "ai" && !model) {
    process.stderr.write("mesh-review retract: --author ai requiere --model\n");
    process.exit(1);
  }
  if (author !== "ai" && model !== void 0) {
    process.stderr.write("mesh-review retract: --model solo es v\xE1lido con --author ai\n");
    process.exit(1);
  }
  if (author !== "ai" && effort !== void 0) {
    process.stderr.write("mesh-review retract: --effort solo es v\xE1lido con --author ai\n");
    process.exit(1);
  }
  if (author !== "ai" && subagent !== void 0) {
    process.stderr.write("mesh-review retract: --subagent solo es v\xE1lido con --author ai\n");
    process.exit(1);
  }
  const docAbs = path9.resolve(doc);
  const gitRoot = await getGitRoot(path9.dirname(docAbs));
  if (!gitRoot) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro de un repositorio git\n");
    process.exit(1);
  }
  const reviewDir = path9.resolve(gitRoot, ".ai", "review");
  const eventDir = path9.resolve(reviewDir, path9.relative(gitRoot, docAbs));
  if (!eventDir.startsWith(reviewDir + path9.sep)) {
    process.stderr.write("mesh-review: el documento no est\xE1 dentro del git root\n");
    process.exit(1);
  }
  const existingEvents = await readEvents(eventDir);
  const threads = project(existingEvents);
  const thread = threads.find((t) => t.thread_id === threadId);
  if (!thread) {
    process.stderr.write(`mesh-review retract: el hilo ${threadId} no existe en este documento
`);
    process.exit(1);
  }
  const messageExists = thread.messages.some((m) => m.id === messageId);
  if (!messageExists) {
    process.stderr.write(`mesh-review retract: el mensaje ${messageId} no existe en el hilo ${threadId}
`);
    process.exit(1);
  }
  let authorObj;
  if (author === "ai") {
    authorObj = {
      kind: "ai",
      model,
      ...effort !== void 0 ? { effort } : {},
      ...subagent !== void 0 ? { subagent } : {}
    };
  } else {
    const name = await getUserName(path9.dirname(docAbs));
    authorObj = name !== void 0 ? { kind: "human", name } : { kind: "human" };
  }
  const id = randomUUID7();
  const ev = {
    id,
    version: 2,
    type: "message.retracted",
    thread_id: threadId,
    author: authorObj,
    created_at: utcTimestampMs(),
    commit: await getHeadSha(gitRoot),
    dirty: false,
    target_message_id: messageId,
    ...reason !== void 0 ? { reason } : {}
  };
  await emitEvent(eventDir, ev);
  process.stdout.write(`${id}
`);
}
function printUsage6() {
  process.stderr.write(
    [
      "Uso: mesh-review retract <doc> <thread_id> <message_id>",
      "         [--reason <texto>]",
      "         [--author human|ai] [--model <id>]",
      "         [--effort <str>] [--subagent <str>]",
      "",
      "Retracta un mensaje del hilo emitiendo message.retracted.",
      "Imprime el UUID del nuevo evento en stdout.",
      "",
      "  --author ai requiere --model.",
      "  --reason es opcional.",
      "",
      "Salida:",
      "  stdout: UUID del evento message.retracted",
      "",
      "Ejemplo:",
      '  mesh-review retract docs/SPEC.md <thread-uuid> <msg-uuid> --reason "Error tipogr\xE1fico"'
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
    case "open":
      await runOpen(rest);
      break;
    case "reply":
      await runReply(rest);
      break;
    case "resolve":
      await runResolve(rest);
      break;
    case "retract":
      await runRetract(rest);
      break;
    default:
      printUsage7();
      if (subcommand !== void 0) process.exit(1);
      break;
  }
}
function printUsage7() {
  process.stderr.write(
    [
      "Uso: mesh-review <subcomando> [argumentos]",
      "",
      "Subcomandos de lectura:",
      "  project [--pending] <doc>         Proyecta los hilos abiertos del documento",
      "",
      "Subcomandos de escritura:",
      "  open <doc> --offset <n> --end-offset <n> --type <t> --body <txt>",
      "                                    Abre un hilo (offsets = \xEDndices UTF-16)",
      "  reply <doc> <thread_id> --body <txt>",
      "                                    Publica un mensaje sin hacer commit",
      "  resolve <doc> <thread_id>         Cierra el hilo (thread.status-changed resolved)",
      "  retract <doc> <thread_id> <msg_id> [--reason <txt>]",
      "                                    Retracta un mensaje del hilo",
      "  fix <doc> <thread_id> -m <msg> --body <texto>",
      "                                    Commit + mensaje en una llamada",
      "",
      "Herramientas de bajo nivel:",
      "  emit <doc> <tipo> [clave=valor\u2026]  Emite un evento de revisi\xF3n para el documento",
      "  reanchor <doc>                    Re-resuelve anclas y emite thread.reanchored",
      "",
      "Ejemplos:",
      "  mesh-review project --pending docs/SPEC.md",
      '  mesh-review open docs/SPEC.md --offset 0 --end-offset 5 --type nota --body "Revisar"',
      '  mesh-review reply docs/SPEC.md <uuid> --body "Correcci\xF3n aplicada"',
      "  mesh-review resolve docs/SPEC.md <uuid>",
      '  mesh-review retract docs/SPEC.md <thread-uuid> <msg-uuid> --reason "Error"',
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

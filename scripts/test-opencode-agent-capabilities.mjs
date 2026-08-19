#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = new URL("..", import.meta.url).pathname
const agentsDir = join(root, "opencode/.config/opencode/agents")

const mcpServers = ["notion", "github", "tavily", "openalex", "zotero"]

const expected = {
  maker: {
    mode: "primary",
    allows: [["edit", "src/example.txt"], ["task", "build"], ["skill", "source-driven-development"]],
    asks: [["bash", "git reset --hard"], ["bash", "git push --force-with-lease"]],
  },
  build: {
    mode: "subagent",
    allows: [["edit", "src/example.txt"], ["task", "review"], ["skill", "test-driven-development"]],
    asks: [["bash", "git reset --hard"], ["bash", "git push --force"]],
  },
  scribe: {
    mode: "primary",
    allows: [["edit", "draft.md"], ["edit", ".ai/review/docs/file.md/event.json"], ["task", "reviser"], ["skill", "doc-review"]],
    denies: [["edit", "src/code.ts"], ["bash", "npm test"], ["task", "build"]],
  },
  plan: {
    mode: "subagent",
    allows: [["edit", ".ai/tasks/2026-08-19-opencode-slim/plan.md"], ["skill", "planning-and-task-breakdown"], ["webfetch", "https://opencode.ai/docs/agents"]],
    denies: [["edit", "README.md"], ["bash", "git status"], ["task", "build"]],
  },
  review: {
    mode: "subagent",
    allows: [["read", "README.md"], ["skill", "code-review-and-quality"]],
    denies: [["edit", "README.md"], ["bash", "git diff"], ["task", "security"]],
  },
  editor: {
    mode: "subagent",
    allows: [["read", "draft.md"], ["skill", "anti-ai-style"]],
    denies: [["edit", "draft.md"], ["bash", "pandoc draft.md"], ["task", "reviser"]],
  },
  security: {
    mode: "subagent",
    allows: [["bash", "git diff --staged"], ["bash", "npm audit --omit=dev"], ["skill", "security-and-hardening"]],
    denies: [["edit", "README.md"], ["bash", "git status"], ["task", "review"]],
  },
  maths: {
    mode: "subagent",
    allows: [["bash", "python3 -c 'import sympy as s; print(s.factor(s.Symbol(\"x\")**2-1))'"]],
    denies: [["edit", "README.md"], ["bash", "python3 script.py"], ["task", "review"]],
  },
  reviser: {
    mode: "subagent",
    allows: [["edit", ".ai/review/docs/file.md/event.json"], ["skill", "doc-review"]],
    denies: [["edit", "docs/file.md"], ["bash", "git diff"], ["task", "editor"]],
  },
}

function extractFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) throw new Error("missing frontmatter")
  return parseYamlSubset(match[1])
}

function parseYamlSubset(source) {
  const rootObject = {}
  const stack = [{ indent: -1, value: rootObject }]
  for (const raw of source.split("\n")) {
    if (!raw.trim()) continue
    const indent = raw.match(/^ */)[0].length
    const line = raw.trim()
    const separator = findKeySeparator(line)
    if (separator === -1) continue
    const key = unquote(line.slice(0, separator).trim())
    const rest = line.slice(separator + 1).trim()
    while (stack.at(-1).indent >= indent) stack.pop()
    const parent = stack.at(-1).value
    if (rest === "") {
      parent[key] = {}
      stack.push({ indent, value: parent[key] })
    } else {
      parent[key] = parseScalar(rest)
    }
  }
  return rootObject
}

function findKeySeparator(line) {
  let quote = null
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if ((char === '"' || char === "'") && line[index - 1] !== "\\") {
      quote = quote === char ? null : quote ?? char
      continue
    }
    if (char === ":" && quote === null) return index
  }
  return -1
}

function parseScalar(value) {
  const unquoted = unquote(value)
  if (unquoted === "true") return true
  if (unquoted === "false") return false
  const number = Number(unquoted)
  return Number.isFinite(number) && unquoted !== "" ? number : unquoted
}

function unquote(value) {
  return value.replace(/^['"]|['"]$/g, "")
}

function matches(pattern, input) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*").replaceAll("?", ".")
  return new RegExp(`^${escaped}$`).test(input)
}

function resolve(permission, key, input = "") {
  if (typeof permission === "string") return permission
  const candidates = Object.entries(permission)
    .filter(([permissionKey]) => matches(permissionKey, key))
    .map(([, entry]) => entry)
  let result
  for (const entry of candidates) {
    if (typeof entry === "string") result = entry
    else for (const [pattern, action] of Object.entries(entry)) if (matches(pattern, input)) result = action
  }
  return result ?? "allow"
}

const failures = []

for (const [agent, checks] of Object.entries(expected)) {
  const markdown = readFileSync(join(agentsDir, `${agent}.md`), "utf8")
  if (/^  write:/m.test(markdown)) failures.push(`${agent}: use native edit permission, not legacy write permission`)
  const frontmatter = extractFrontmatter(markdown)
  if (frontmatter.mode !== checks.mode) failures.push(`${agent}: expected mode ${checks.mode}, got ${frontmatter.mode}`)
  const permission = frontmatter.permission ?? {}
  for (const [key, input] of checks.allows ?? []) {
    const action = resolve(permission, key, input)
    if (action !== "allow") failures.push(`${agent}: expected ${key} ${input} => allow, got ${action}`)
  }
  for (const [key, input] of checks.asks ?? []) {
    const action = resolve(permission, key, input)
    if (action !== "ask") failures.push(`${agent}: expected ${key} ${input} => ask, got ${action}`)
  }
  for (const [key, input] of checks.denies ?? []) {
    const action = resolve(permission, key, input)
    if (action !== "deny") failures.push(`${agent}: expected ${key} ${input} => deny, got ${action}`)
  }
  for (const server of mcpServers) {
    const action = resolve(permission, `${server}_search`, `${server}_search`)
    const shouldDeny = !["maker", "build"].includes(agent)
    if (shouldDeny && action !== "deny") failures.push(`${agent}: expected MCP ${server}_* => deny, got ${action}`)
  }
}

const lastMatchPermission = { bash: { "*": "deny", "git *": "allow", "git push *": "ask" } }
if (resolve(lastMatchPermission, "bash", "git push origin HEAD") !== "ask") {
  failures.push("last-match fixture did not prefer later git push rule")
}

if (failures.length) {
  console.error(failures.join("\n"))
  process.exit(1)
}

console.log("OpenCode agent capability matrix is statically valid")

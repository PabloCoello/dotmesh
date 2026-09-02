// dotmesh-commands — plugin de servidor para dsh
// Registra /req, /gate y /handoff via ctx.commands.register().
//
// Restricción de la Fase 0: este fichero no puede importar nada del árbol de
// dsh (sin node_modules en ~/.dsh/plugins/). Solo módulos internos de Node.
//
// Montado desde cordis.patch.yml con:
//   name: '../../plugins/commands.js'
// relativo al directorio del perfil (~/.dsh/profiles/web/).

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'

export const name = 'dotmesh-commands'
// Declara la dependencia de servicio requerida por Cordis.
// Sin esto, ctx.commands lanza "cannot get property without inject".
export const inject = ['commands']

// ---------------------------------------------------------------------------
// Rutas de estado
// ---------------------------------------------------------------------------

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const STATE_FILE = join(DSH_HOME, 'state', 'workbench.json')

// Patrón de ID de argos: REQ-00001-1, SREQ-00002-1, VER-00001-1, etc.
const ID_RE = /^[A-Z]+-\d+-\d+$/

// ---------------------------------------------------------------------------
// Helpers de estado (lectura y escritura atómica)
// ---------------------------------------------------------------------------

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    // Fichero ausente o corrupto → sin REQ activo, no es un error fatal.
    return {}
  }
}

// Artefact fields come from repository content and may carry newlines or
// markdown that would break the handoff document's structure. Collapse them to
// a single bounded line so downstream readers treat them as data, not markup.
function oneLine(value, max = 200) {
  if (typeof value !== 'string') return value
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function writeState(patch) {
  const current = readState()
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() }
  if (next.title !== undefined) next.title = oneLine(next.title)
  if (next.status !== undefined) next.status = oneLine(next.status, 50)
  const dir = join(DSH_HOME, 'state')
  mkdirSync(dir, { recursive: true })
  const tmp = STATE_FILE + '.tmp'
  // 0600: the file records the absolute path of the active project.
  writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 })
  // Escritura atómica: rename en el mismo filesystem es operación atómica en Linux.
  renameSync(tmp, STATE_FILE)
}

// ---------------------------------------------------------------------------
// Helper de subproceso con timeout
// ---------------------------------------------------------------------------

function run(cmd, args, { cwd, timeout = 15000 } = {}) {
  return spawnSync(cmd, args, {
    cwd,
    timeout,
    encoding: 'utf8',
    stdio: 'pipe',
  })
}

// ---------------------------------------------------------------------------
// Directorio de trabajo de la sesión
//
// invocation.agent.session.header.cwd es el directorio con el que se arrancó
// dsh (verificado en dsh-session/lib/index.js:1320-1390). Si no está
// disponible (sesión sin metadatos de cabecera), cae a process.cwd() del
// proceso servidor. Se documenta como limitación: en ese caso el directorio
// puede ser el de lanzamiento de dsh, no el del proyecto.
// ---------------------------------------------------------------------------

function sessionCwd(inv) {
  return inv?.agent?.session?.header?.cwd ?? process.cwd()
}

// ---------------------------------------------------------------------------
// Detección del target make gate
// ---------------------------------------------------------------------------

function hasGateTarget(cwd) {
  const r = run('make', ['-n', 'gate'], { cwd, timeout: 5000 })
  return r.status === 0
}

// ---------------------------------------------------------------------------
// Conteo de hallazgos de argos diagnose --json
// ---------------------------------------------------------------------------

function countArgosFindings(stdout) {
  try {
    const arr = JSON.parse(stdout)
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    // Si la salida no es JSON (p.ej. solo warnings de plugin), cuenta líneas
    // no vacías como aproximación conservadora.
    return stdout.split('\n').filter(l => l.trim().length > 0).length
  }
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export function apply(ctx) {
  // ── /req <ID> ─────────────────────────────────────────────────────────────
  // Fija el requisito activo: consulta argos get <ID> --json, extrae título y
  // status, y escribe $DSH_HOME/state/workbench.json.
  ctx.commands.register({
    name: 'req',
    description: 'Fija el requisito activo consultando argos y actualiza el banco de trabajo.',
    input: { hint: '<ID>' },
    async handler(inv) {
      const id = inv.rawInput.trim()

      if (!ID_RE.test(id)) {
        return {
          kind: 'error',
          text: `ID inválido: «${id}». Formato esperado: REQ-00001-1, SREQ-00002-1, etc.`,
        }
      }

      const cwd = sessionCwd(inv)
      const r = run('argos', ['get', id, '--json'], { cwd, timeout: 10000 })

      if (r.error?.code === 'ETIMEDOUT') {
        return { kind: 'error', text: 'argos get superó el tiempo límite (10 s).' }
      }
      if (r.status !== 0) {
        const detail = (r.stderr ?? '').trim() || r.stdout?.trim() || r.error?.message || 'error desconocido'
        return { kind: 'error', text: `argos get falló: ${detail}` }
      }

      let entity
      try {
        entity = JSON.parse(r.stdout)
      } catch {
        return {
          kind: 'error',
          text: `Respuesta de argos no es JSON válido: ${r.stdout.slice(0, 200)}`,
        }
      }

      writeState({
        req: entity.id,
        title: entity.title,
        status: entity.status,
        cwd,
      })

      return {
        kind: 'success',
        text: `REQ activo: ${entity.id} — ${oneLine(entity.title)} [${entity.status}]`,
      }
    },
  })

  // ── /gate ─────────────────────────────────────────────────────────────────
  // Corre el gate del proyecto y registra el resultado en workbench.json.
  // Usa make gate si existe el target; si no, argos diagnose --new --json.
  ctx.commands.register({
    name: 'gate',
    description: 'Corre el gate del proyecto (make gate o argos diagnose --new) y registra el resultado.',
    async handler(inv) {
      const cwd = sessionCwd(inv)
      let ok, findings, cmdLabel

      if (hasGateTarget(cwd)) {
        cmdLabel = 'make gate'
        const r = run('make', ['gate'], { cwd, timeout: 120000 })
        // Sin esta comprobación un timeout se registraría como gate fallido:
        // spawnSync deja status a null y `null === 0` es false. El estado
        // persistido mentiría sobre por qué falló.
        if (r.error?.code === 'ETIMEDOUT') {
          return { kind: 'error', text: 'make gate superó el tiempo límite (120 s).' }
        }
        ok = r.status === 0
        // make gate no emite hallazgos estructurados: si falla, se registra
        // findings = 1 para indicar «al menos un fallo», sin sobre-contar
        // líneas de log que no corresponden a findings individuales.
        findings = ok ? 0 : 1
      } else {
        cmdLabel = 'argos diagnose --new'
        const r = run('argos', ['diagnose', '--new', '--json'], { cwd, timeout: 30000 })
        if (r.error?.code === 'ETIMEDOUT') {
          return { kind: 'error', text: 'argos diagnose superó el tiempo límite (30 s).' }
        }
        // argos diagnose sale con código 0 tanto si hay hallazgos como si no;
        // un código distinto de 0 indica fallo de ejecución (p.ej. no hay proyecto argos).
        if (r.status !== 0) {
          const detail = (r.stderr ?? '').trim().slice(0, 300) || r.error?.message || 'error desconocido'
          return { kind: 'error', text: `argos diagnose falló (exit ${r.status}): ${detail}` }
        }
        const out = r.stdout ?? ''
        findings = countArgosFindings(out)
        ok = findings === 0
      }

      writeState({ gate: { ok, findings, ranAt: new Date().toISOString() } })

      const text = ok
        ? `Gate OK (${cmdLabel}).`
        : `Gate falló — ${findings} hallazgo(s) (${cmdLabel}).`

      return { kind: ok ? 'success' : 'error', text }
    },
  })

  // ── /handoff [slug] ───────────────────────────────────────────────────────
  // Escribe .ai/tasks/<slug>/handoff.md en el proyecto activo con el formato
  // de la skill handoff de dotmesh (secciones: Objetivo, Estado, Decisiones,
  // Próximos pasos, Skills sugeridas).
  // Si ya existe, devuelve error en lugar de sobrescribir.
  ctx.commands.register({
    name: 'handoff',
    description: 'Escribe .ai/tasks/<slug>/handoff.md en el proyecto activo con el formato estándar de handoff.',
    input: { hint: '[slug]' },
    async handler(inv) {
      const state = readState()
      // El cwd del handoff es el del proyecto registrado en el banco de trabajo,
      // o el de la sesión actual si aún no hay REQ fijado.
      const cwd = state.cwd ?? sessionCwd(inv)

      const slugArg = inv.rawInput.trim()
      const date = new Date().toISOString().slice(0, 10)
      const reqPart = state.req
        ? state.req.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        : 'task'
      const slug = slugArg.length > 0 ? slugArg : `${date}-${reqPart}`

      // Previene path traversal: el slug no puede contener separadores de ruta
      // ni componentes que naveguen hacia arriba. Solo letras, dígitos, guiones,
      // puntos y guiones bajos.
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(slug)) {
        return {
          kind: 'error',
          text: `Slug inválido: «${slug}». Solo se permiten letras, dígitos, -, _ y . (sin barras ni ..)`,
        }
      }

      const dest = join(cwd, '.ai', 'tasks', slug, 'handoff.md')

      const reqLine = state.req
        ? `${state.req}${state.title ? ` — ${state.title}` : ''}`
        : '(ninguno)'

      const gateLines = state.gate
        ? [
            `- Gate: ${state.gate.ok ? 'OK' : `FALLÓ (${state.gate.findings} hallazgo(s))`}`,
            `- Última ejecución del gate: ${state.gate.ranAt}`,
          ]
        : ['- Gate: no ejecutado en esta sesión']

      const content = [
        `# Handoff — ${slug}`,
        '',
        '## Objetivo',
        '',
        '<!-- Qué se está intentando conseguir. -->',
        '',
        '## Estado',
        '',
        `- REQ activo: ${reqLine}`,
        `- Status argos: ${state.status ?? '(desconocido)'}`,
        `- Proyecto: ${cwd}`,
        ...gateLines,
        '',
        '## Decisiones',
        '',
        '<!-- Elecciones tomadas y por qué. Referencia ADRs, PRs, commits por ruta o URL; no los dupliques. -->',
        '',
        '## Próximos pasos',
        '',
        '<!-- Acciones concretas para la siguiente sesión. -->',
        '',
        '## Skills sugeridas',
        '',
        '- `incremental-implementation`',
        '- `argos-traza`',
        '',
        '---',
        `*Generado por /handoff de dotmesh-commands el ${new Date().toISOString()}*`,
        `*Estado del banco de trabajo: ${STATE_FILE}*`,
        '',
      ].join('\n')

      mkdirSync(join(cwd, '.ai', 'tasks', slug), { recursive: true })
      try {
        writeFileSync(dest, content, { encoding: 'utf8', flag: 'wx' })
      } catch (err) {
        if (err.code === 'EEXIST') {
          return {
            kind: 'error',
            text: `Ya existe ${dest}. Elige un slug diferente o elimínalo antes de continuar.`,
          }
        }
        throw err
      }

      return { kind: 'success', text: `Handoff escrito en ${dest}` }
    },
  })
}

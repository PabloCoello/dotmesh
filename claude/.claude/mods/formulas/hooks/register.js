// Shows LaTeX in assistant messages as Unicode (x², ∑ᵢ aᵢ, α ≤ β).
// MessageDisplay is display-only: the stored message and what the model reads are untouched.
// Out of scope: matrices, stacked fractions, limits above or below.

// Display math gets its own indented line; NBSP so markdown neither trims it nor reads a code block
const DISPLAY_INDENT = ' '.repeat(4)
// Bounds that keep one hostile line or block from stalling the UI thread
const MAX_LINE = 10000
const MAX_DEPTH = 100
const MAX_HELD = 20
const MAX_STREAMS = 32

const SYMBOLS = {
  // Greek
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ',
  varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
  Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  // Operators
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '·', ast: '∗', star: '⋆', circ: '∘', bullet: '•',
  oplus: '⊕', otimes: '⊗', cdots: '⋯', ldots: '…', dots: '…', vdots: '⋮', ddots: '⋱',
  // Relations
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼',
  simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫', prec: '≺', succ: '≻', perp: '⊥',
  parallel: '∥', mid: '∣',
  // Arrows
  to: '→', rightarrow: '→', leftarrow: '←', gets: '←', leftrightarrow: '↔', Rightarrow: '⇒',
  Leftarrow: '⇐', Leftrightarrow: '⇔', implies: '⟹', impliedby: '⟸', iff: '⟺', mapsto: '↦',
  uparrow: '↑', downarrow: '↓', longrightarrow: '⟶', longleftarrow: '⟵',
  // Sets and logic
  in: '∈', notin: '∉', ni: '∋', subset: '⊂', supset: '⊃', subseteq: '⊆', supseteq: '⊇', cup: '∪',
  cap: '∩', emptyset: '∅', varnothing: '∅', setminus: '∖', forall: '∀', exists: '∃', nexists: '∄',
  neg: '¬', lnot: '¬', land: '∧', wedge: '∧', lor: '∨', vee: '∨', infty: '∞', partial: '∂',
  nabla: '∇', top: '⊤', bot: '⊥', angle: '∠', ell: 'ℓ', hbar: 'ℏ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ',
  // Big operators
  sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃',
  bigcap: '⋂',
  // Delimiters
  langle: '⟨', rangle: '⟩', lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋', vert: '|',
  lvert: '|', rvert: '|', Vert: '‖', '|': '‖',
  // Spacing
  ',': ' ', ':': ' ', ';': ' ', ' ': ' ', quad: ' ', qquad: ' ', '!': '',
}
for (const f of ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos',
  'arctan', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'arg', 'deg', 'dim',
  'ker', 'Pr']) SYMBOLS[f] = f
// Prefix operators bind to what follows: \forall x reads ∀x
const PREFIX = new Set(['forall', 'exists', 'nexists', 'partial', 'neg', 'lnot', 'nabla'])
// Sizing commands carry no glyph of their own
const DROP = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr',
  'displaystyle', 'textstyle', 'limits', 'nolimits'])
const RAW_TEXT = new Set(['text', 'textrm', 'textit', 'textbf', 'mbox'])
const STYLE = new Set(['mathrm', 'mathit', 'mathbf', 'mathsf', 'boldsymbol', 'operatorname'])
const BLACKBOARD = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', H: 'ℍ' }

const SUP = mapOf('0123456789+-=()abcdefghijklmnoprstuvwxyzABDEGHIJKLMNOPRTUVW',
  '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖʳˢᵗᵘᵛʷˣʸᶻᴬᴮᴰᴱᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾᴿᵀᵁⱽᵂ')
const SUB = mapOf('0123456789+-=()aehijklmnoprstuvx', '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ')

function mapOf(from, to) {
  const a = [...from]
  const b = [...to]
  return Object.fromEntries(a.map((c, i) => [c, b[i]]))
}

const NAME = /[A-Za-z]+/y
function commandName(s, at) {
  NAME.lastIndex = at
  const m = NAME.exec(s)
  return m ? m[0] : s[at] ?? ''
}

// Per-conversion flags: an unknown command or runaway nesting leaves the span raw
let ctx = { unknown: false, depth: 0 }
const TOO_DEEP = new Error('nesting too deep')

// Recursive descent over the LaTeX source; returns [text, index after the stop]
function parse(s, i, stop) {
  if (++ctx.depth > MAX_DEPTH) throw TOO_DEEP
  try {
    return parseBody(s, i, stop)
  } finally {
    ctx.depth--
  }
}

function parseBody(s, i, stop) {
  let out = ''
  while (i < s.length) {
    const c = s[i]
    if (c === stop) return [out, i + 1]
    if (c === '\\') {
      const name = commandName(s, i + 1)
      i += 1 + name.length
      let piece
      ;[piece, i] = command(s, i, name)
      out += piece
    } else if (c === '^' || c === '_') {
      let arg, braced
      ;[arg, braced, i] = argument(s, i + 1)
      out += script(arg, braced, c === '^' ? SUP : SUB, c)
    } else if (c === '{') {
      let inner
      ;[inner, i] = parse(s, i + 1, '}')
      out += inner
    } else {
      out += c === '~' ? ' ' : c
      i++
    }
  }
  return [out, i]
}

function command(s, i, name) {
  if (++ctx.depth > MAX_DEPTH) throw TOO_DEEP
  try {
    return commandBody(s, i, name)
  } finally {
    ctx.depth--
  }
}

function commandBody(s, i, name) {
  if (name in SYMBOLS) {
    if (PREFIX.has(name)) while (s[i] === ' ') i++
    return [SYMBOLS[name], i]
  }
  // \left. is an invisible delimiter
  if (DROP.has(name)) return ['', s[i] === '.' ? i + 1 : i]
  if ('{}%$&#_'.includes(name) && name.length === 1) return [name, i]
  if (name === '\\') return ['\n', i]
  if (RAW_TEXT.has(name) && s[i] === '{') {
    const end = matching(s, i)
    return [s.slice(i + 1, end), end + 1]
  }
  if (STYLE.has(name)) return argument(s, i).filter((_, k) => k !== 1)
  if (name === 'mathbb' && s[i] === '{') {
    const end = matching(s, i)
    return [[...s.slice(i + 1, end)].map((ch) => BLACKBOARD[ch] ?? ch).join(''), end + 1]
  }
  if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
    const [num, , j] = argument(s, i)
    const [den, , k] = argument(s, j)
    return [`${wrap(num)}/${wrap(den)}`, k]
  }
  if (name === 'sqrt') {
    let index = ''
    if (s[i] === '[') [index, i] = parse(s, i + 1, ']')
    const [arg, , j] = argument(s, i)
    const mark = index ? script(index, true, SUP, '') : ''
    return [mark + '√' + wrap(arg), j]
  }
  // Unknown: keep the source so nothing is silently lost
  ctx.unknown = true
  if (s[i] === '{') {
    const [inner, j] = parse(s, i + 1, '}')
    return [`\\${name}{${inner}}`, j]
  }
  return ['\\' + name, i]
}

// One argument: a braced group, a command, or a single character
function argument(s, i) {
  while (s[i] === ' ') i++
  if (s[i] === '{') {
    const [inner, j] = parse(s, i + 1, '}')
    return [inner, true, j]
  }
  if (s[i] === '\\') {
    const name = commandName(s, i + 1)
    const [piece, j] = command(s, i + 1 + name.length, name)
    return [piece, false, j]
  }
  return [s[i] ?? '', false, i + 1]
}

function matching(s, open) {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '\\') i++
    else if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth === 0) return i
  }
  return s.length
}

function script(arg, braced, table, mark) {
  const chars = [...arg]
  if (chars.length && chars.every((ch) => ch in table)) return chars.map((ch) => table[ch]).join('')
  return braced ? `${mark}(${arg})` : mark + arg
}

function wrap(text) {
  return /^[\p{L}\p{N}.]+$/u.test(text) ? text : `(${text})`
}

export function latexToUnicode(src) {
  ctx = { unknown: false, depth: 0 }
  return parse(src, 0, null)[0].replace(/[ \t]{2,}/g, ' ').trim()
}

// Null when the span holds something we cannot render faithfully
function convert(src) {
  try {
    const text = latexToUnicode(src)
    return ctx.unknown ? null : text
  } catch (err) {
    if (err === TOO_DEEP) return null
    throw err
  }
}

// Rendered math must not be reread as markdown emphasis
function escapeMarkdown(text) {
  return text.replace(/[*_]/g, '\\$&')
}

// Converted span, or the source with its delimiters when it cannot be rendered
function inlineMath(src, open, close) {
  const text = convert(src)
  return text === null ? open + src + close : escapeMarkdown(text)
}

const TICKS = /`+/y

// Inline pass over one line outside fences: skips code spans, converts \(..\), \[..\], $$..$$ and $..$
function convertLine(line) {
  if (line.length > MAX_LINE) return line
  // A closer already missing from the rest of the line stays missing: no rescans
  const missing = new Set()
  const find = (token, from) => {
    if (missing.has(token)) return -1
    const at = line.indexOf(token, from)
    if (at === -1) missing.add(token)
    return at
  }
  let out = ''
  let i = 0
  while (i < line.length) {
    const c = line[i]
    if (c === '`') {
      TICKS.lastIndex = i
      const run = TICKS.exec(line)[0]
      const end = find(run, i + run.length)
      if (end === -1) {
        out += run
        i += run.length
      } else {
        out += line.slice(i, end + run.length)
        i = end + run.length
      }
    } else if (c === '\\' && line[i + 1] === '$') {
      out += '\\$'
      i += 2
    } else if (c === '\\' && (line[i + 1] === '(' || line[i + 1] === '[')) {
      const open = line.slice(i, i + 2)
      const close = line[i + 1] === '(' ? '\\)' : '\\]'
      const end = find(close, i + 2)
      if (end === -1) {
        out += open
        i += 2
      } else {
        out += inlineMath(line.slice(i + 2, end), open, close)
        i = end + 2
      }
    } else if (c === '$' && line[i + 1] === '$') {
      const end = find('$$', i + 2)
      if (end === -1) {
        out += '$$'
        i += 2
      } else {
        out += inlineMath(line.slice(i + 2, end), '$$', '$$')
        i = end + 2
      }
    } else if (c === '$') {
      // Pandoc's rule keeps money out: no space inside the delimiters, no digit after the closing one.
      // A letter after the closing one marks shell variables ($HOME/$USER), not math.
      const end = find('$', i + 1)
      const ok = end > i + 1 && !/\s/.test(line[i + 1]) && !/\s/.test(line[end - 1]) &&
        !/[\p{L}\d_{]/u.test(line[end + 1] ?? '')
      if (ok) {
        out += inlineMath(line.slice(i + 1, end), '$', '$')
        i = end + 1
      } else {
        out += '$'
        i++
      }
    } else {
      out += c
      i++
    }
  }
  return out
}

// Null when the block cannot be rendered faithfully; the caller shows the source instead
function renderDisplay(src) {
  const text = convert(src.replace(/\n/g, ' ').replace(/\\[\s\S]|&/g, (m) => (m === '&' ? '' : m)))
  if (text === null) return null
  return text
    .split('\n')
    .map((l) => DISPLAY_INDENT + escapeMarkdown(l.trim()))
    .join('\n')
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/

// Text after the closing delimiter stays on the same line; null leaves the block raw
function closeDisplay(body, rest) {
  const shown = renderDisplay(body)
  if (shown === null) return null
  return shown + (rest.trim() ? ' ' + convertLine(rest.trim()) : '')
}

// Per-message state: open code fence and display math held until it closes
export function createStream() {
  let fence = null
  let display = null // { close, raw: [], body: [] }

  function line(text, nl) {
    if (fence) {
      const m = FENCE.exec(text)
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && !text.slice(m[0].length).trim()) fence = null
      return text + nl
    }
    const m = FENCE.exec(text)
    if (display) {
      // A fence or a runaway block means this was never display math: show what was held
      if (m) return release() + line(text, nl)
      const at = text.indexOf(display.close)
      if (text.length > MAX_LINE || (at === -1 && display.raw.length >= MAX_HELD)) {
        return release() + convertLine(text) + nl
      }
      display.raw.push(text + nl)
      if (at === -1) {
        display.body.push(text)
        return ''
      }
      display.body.push(text.slice(0, at))
      const shown = closeDisplay(display.body.join('\n'), text.slice(at + display.close.length))
      const raw = release()
      return shown === null ? raw : shown + nl
    }
    if (m) {
      fence = m[1]
      return text + nl
    }
    const lead = text.trimStart()
    const opener = lead.startsWith('$$') ? '$$' : lead.startsWith('\\[') ? '\\[' : null
    if (!opener || text.length > MAX_LINE) return convertLine(text) + nl
    const close = opener === '$$' ? '$$' : '\\]'
    const after = lead.slice(2)
    const at = after.indexOf(close)
    if (at !== -1) {
      const shown = closeDisplay(after.slice(0, at), after.slice(at + 2))
      return (shown === null ? text : shown) + nl
    }
    // Hold only a bare opener or one followed by LaTeX; prose like "$$ es el PID" goes through
    const tail = after.trim()
    if (tail && !tail.startsWith('\\')) return convertLine(text) + nl
    display = { close, raw: [text + nl], body: [after] }
    return ''
  }

  function release() {
    const raw = display ? display.raw.join('') : ''
    display = null
    return raw
  }

  return {
    push(delta, final) {
      const before = display ? display.raw.join('') : ''
      try {
        let out = ''
        const parts = delta.split('\n')
        parts.forEach((p, k) => {
          const last = k === parts.length - 1
          if (last && p === '') return
          out += line(p, last ? '' : '\n')
        })
        if (final) out += release()
        return out
      } catch (err) {
        // Show what was held before this flush and the flush itself, unconverted
        display = null
        throw Object.assign(err, { shown: before + delta })
      }
    },
  }
}

export function convertText(text) {
  return createStream().push(text, true)
}

export function register(on) {
  const streams = new Map() // message_id -> stream
  on('classic.MessageDisplay', async ($, e, next) => {
    const r = await next(e)
    try {
      let stream = streams.get(e.message_id)
      if (!stream) {
        // A message aborted before its final flush never deletes its entry: drop the oldest
        if (streams.size >= MAX_STREAMS) streams.delete(streams.keys().next().value)
        streams.set(e.message_id, (stream = createStream()))
      }
      const shown = stream.push(r?.displayContent ?? e.delta, e.final)
      if (e.final) streams.delete(e.message_id)
      return { ...r, displayContent: shown }
    } catch (err) {
      $.ui.log('formulas: ' + err)
      if (e.final) streams.delete(e.message_id)
      return err.shown === undefined ? r : { ...r, displayContent: err.shown }
    }
  })
}

// Shows LaTeX in assistant messages as Unicode (x², ∑ᵢ aᵢ, α ≤ β).
// MessageDisplay is display-only: the stored message and what the model reads are untouched.
// Out of scope: matrices, stacked fractions, limits above or below.

// Display math gets its own indented line; NBSP so markdown neither trims it nor reads a code block
const DISPLAY_INDENT = ' '.repeat(4)

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

// Recursive descent over the LaTeX source; returns [text, index after the stop]
function parse(s, i, stop) {
  let out = ''
  while (i < s.length) {
    const c = s[i]
    if (c === stop) return [out, i + 1]
    if (c === '\\') {
      const m = /^[A-Za-z]+/.exec(s.slice(i + 1))
      const name = m ? m[0] : s[i + 1] ?? ''
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
    const [arg, , j] = argument(s, i)
    return ['√' + wrap(arg), j]
  }
  // Unknown: keep the source so nothing is silently lost
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
    const m = /^[A-Za-z]+/.exec(s.slice(i + 1))
    const name = m ? m[0] : s[i + 1] ?? ''
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
  return parse(src, 0, null)[0].replace(/[ \t]{2,}/g, ' ').trim()
}

// Rendered math must not be reread as markdown emphasis
function escapeMarkdown(text) {
  return text.replace(/[*_]/g, '\\$&')
}

function inlineMath(src) {
  return escapeMarkdown(latexToUnicode(src))
}

// Inline pass over one line outside fences: skips code spans, converts \(..\), \[..\], $$..$$ and $..$
function convertLine(line) {
  let out = ''
  let i = 0
  while (i < line.length) {
    const c = line[i]
    if (c === '`') {
      const run = /^`+/.exec(line.slice(i))[0]
      const end = line.indexOf(run, i + run.length)
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
      const close = line[i + 1] === '(' ? '\\)' : '\\]'
      const end = line.indexOf(close, i + 2)
      if (end === -1) {
        out += line.slice(i, i + 2)
        i += 2
      } else {
        out += inlineMath(line.slice(i + 2, end))
        i = end + 2
      }
    } else if (c === '$' && line[i + 1] === '$') {
      const end = line.indexOf('$$', i + 2)
      if (end === -1) {
        out += '$$'
        i += 2
      } else {
        out += inlineMath(line.slice(i + 2, end))
        i = end + 2
      }
    } else if (c === '$') {
      // Pandoc's rule keeps money out: no space inside the delimiters, no digit after the closing one
      const end = line.indexOf('$', i + 1)
      const ok = end > i + 1 && !/\s/.test(line[i + 1]) && !/\s/.test(line[end - 1]) &&
        !/\d/.test(line[end + 1] ?? '')
      if (ok) {
        out += inlineMath(line.slice(i + 1, end))
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

function renderDisplay(src) {
  return latexToUnicode(src.replace(/\n/g, ' ').replace(/&/g, ''))
    .split('\n')
    .map((l) => DISPLAY_INDENT + escapeMarkdown(l.trim()))
    .join('\n')
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/

// Text after the closing delimiter stays on the same line
function closeDisplay(body, rest) {
  return renderDisplay(body) + (rest.trim() ? ' ' + convertLine(rest.trim()) : '')
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
    if (display) {
      display.raw.push(text + nl)
      const at = text.indexOf(display.close)
      if (at === -1) {
        display.body.push(text)
        return ''
      }
      display.body.push(text.slice(0, at))
      const shown = closeDisplay(display.body.join('\n'), text.slice(at + display.close.length))
      display = null
      return shown + nl
    }
    const m = FENCE.exec(text)
    if (m) {
      fence = m[1]
      return text + nl
    }
    const lead = text.trimStart()
    const opener = lead.startsWith('$$') ? '$$' : lead.startsWith('\\[') ? '\\[' : null
    if (!opener) return convertLine(text) + nl
    const close = opener === '$$' ? '$$' : '\\]'
    const after = lead.slice(2)
    const at = after.indexOf(close)
    if (at !== -1) return closeDisplay(after.slice(0, at), after.slice(at + 2)) + nl
    display = { close, raw: [text + nl], body: [after] }
    return ''
  }

  return {
    push(delta, final) {
      let out = ''
      const parts = delta.split('\n')
      parts.forEach((p, k) => {
        const last = k === parts.length - 1
        if (last && p === '') return
        out += line(p, last ? '' : '\n')
      })
      if (final && display) {
        out += display.raw.join('')
        display = null
      }
      return out
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
      if (!stream) streams.set(e.message_id, (stream = createStream()))
      const shown = stream.push(r?.displayContent ?? e.delta, e.final)
      if (e.final) streams.delete(e.message_id)
      return { ...r, displayContent: shown }
    } catch (err) {
      $.ui.log('formulas: ' + err)
      return r
    }
  })
}

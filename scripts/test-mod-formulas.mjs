// Tests for the formulas mod converter: node --test scripts/test-mod-formulas.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { latexToUnicode, convertText, createStream } from '../claude/.claude/mods/formulas/hooks/register.js'

const IND = '\u00a0'.repeat(4) // display math indent

const cases = [
  ['\\alpha + \\beta = \\gamma', 'α + β = γ'],
  ['\\Omega \\Delta \\pi', 'Ω Δ π'],
  ['x^2 + y^2', 'x² + y²'],
  ['x^{n+1}', 'xⁿ⁺¹'],
  ['a_i + a_{ij}', 'aᵢ + aᵢⱼ'],
  ['x^{\\alpha}', 'x^(α)'], // no superscript alpha: falls back
  ['e^{i\\pi} + 1 = 0', 'e^(iπ) + 1 = 0'],
  ['\\sum_{i=1}^{n} x_i', '∑ᵢ₌₁ⁿ xᵢ'],
  ['\\int_0^\\infty f(x)\\,dx', '∫₀^∞ f(x) dx'],
  ['\\frac{1}{2}', '1/2'],
  ['\\frac{a+b}{c}', '(a+b)/c'],
  ['\\sqrt{2}', '√2'],
  ['\\sqrt{x+1}', '√(x+1)'],
  ['a \\leq b \\neq c \\geq d', 'a ≤ b ≠ c ≥ d'],
  ['x \\in \\mathbb{R}', 'x ∈ ℝ'],
  ['\\forall x \\exists y', '∀x ∃y'],
  ['A \\cup B \\cap C', 'A ∪ B ∩ C'],
  ['f: A \\to B', 'f: A → B'],
  ['p \\Rightarrow q', 'p ⇒ q'],
  ['\\text{si } x > 0', 'si x > 0'],
  ['\\left( x \\right)', '( x )'],
  ['a \\cdot b \\times c \\pm d', 'a · b × c ± d'],
  ['\\partial f / \\partial x', '∂f / ∂x'],
  ['\\hat{x}', '\\hat{x}'], // unknown command left as is
]
for (const [src, want] of cases) {
  test(`latexToUnicode: ${src}`, () => assert.equal(latexToUnicode(src), want))
}

test('inline $...$ is converted, delimiters dropped', () => {
  assert.equal(convertText('la energía es $E = mc^2$ siempre'), 'la energía es E = mc² siempre')
})
test('inline \\(...\\) is converted', () => {
  assert.equal(convertText('con \\(\\alpha\\) fijo'), 'con α fijo')
})
test('money is not math', () => {
  assert.equal(convertText('cuesta $5 y $10'), 'cuesta $5 y $10')
  assert.equal(convertText('entre $ 3 y 4 $'), 'entre $ 3 y 4 $')
})
test('inline code is left alone', () => {
  assert.equal(convertText('usa `$x^2$` así y $x^2$'), 'usa `$x^2$` así y x²')
})
test('display $$...$$ on one line', () => {
  assert.equal(convertText('$$\\sum_i a_i$$'), IND + '∑ᵢ aᵢ')
})
test('display \\[...\\] spanning lines', () => {
  assert.equal(convertText('\\[\n\\frac{1}{n}\n\\]'), IND + '1/n')
})
test('leftover markdown characters are escaped', () => {
  assert.equal(convertText('$a*b*c$'), 'a\\*b\\*c')
  assert.equal(convertText('$x_{\\alpha}$'), 'x\\_(α)')
})
test('text without math is returned unchanged', () => {
  const s = 'hola *mundo* con `código` y \\n escapes'
  assert.equal(convertText(s), s)
})

test('stream: fenced code is not touched, across flushes', () => {
  const s = createStream()
  assert.equal(s.push('antes $x^2$\n```\n', false), 'antes x²\n```\n')
  assert.equal(s.push('$y^2$ dentro\n', false), '$y^2$ dentro\n')
  assert.equal(s.push('```\n$z^2$\n', true), '```\nz²\n')
})
test('stream: display math across flushes is held until it closes', () => {
  const s = createStream()
  assert.equal(s.push('texto\n$$\n', false), 'texto\n')
  assert.equal(s.push('\\alpha^2\n', false), '')
  assert.equal(s.push('$$\nfin\n', true), IND + 'α²\nfin\n')
})
test('stream: unclosed display math is released raw at the end', () => {
  const s = createStream()
  assert.equal(s.push('$$\n', false), '')
  assert.equal(s.push('x^2\n', true), '$$\nx^2\n')
})
test('stream: plain flush passes through untouched', () => {
  const s = createStream()
  assert.equal(s.push('sin fórmulas\n', false), 'sin fórmulas\n')
})
test('display \\[...\\] in the middle of a line is converted inline', () => {
  assert.equal(convertText('y \\[ \\forall x \\in \\mathbb{R} \\] fin'), 'y ∀x ∈ ℝ fin')
})
test('shell variables are not math', () => {
  assert.equal(convertText('copia $HOME/$USER y PATH=$HOME/bin:$PATH'), 'copia $HOME/$USER y PATH=$HOME/bin:$PATH')
})
test('a span with an unknown command is left raw', () => {
  assert.equal(convertText('la regex \\(\\d+\\) casa'), 'la regex \\(\\d+\\) casa')
  assert.equal(convertText('$\\hat{x}$'), '$\\hat{x}$')
})
test('prose starting with $$ does not hold the message', () => {
  const s = createStream()
  assert.equal(s.push('$$ es el PID del shell\n', false), '$$ es el PID del shell\n')
})
test('a display block that runs too long is released raw', () => {
  const s = createStream()
  let out = s.push('$$\n', false)
  for (let k = 0; k < 40; k++) out += s.push(`linea ${k}\n`, false)
  assert.ok(out.startsWith('$$\nlinea 0\n'))
})
test('a fence inside an open display block releases it raw', () => {
  const s = createStream()
  assert.equal(s.push('$$\nx^2\n```\n$y^2$\n', false), '$$\nx^2\n```\n$y^2$\n')
})
test('nth root and escaped ampersand', () => {
  assert.equal(latexToUnicode('\\sqrt[3]{x}'), '³√x')
  assert.equal(convertText('$$a \\& b$$'), ' '.repeat(4) + 'a & b')
})
test('a long line of unmatched openers stays fast and unchanged', () => {
  for (const unit of ['\\(', '\\[']) {
    const line = 'a' + unit.repeat(4900) // just under the line cap, so the scan really runs
    const t = performance.now()
    assert.equal(convertText(line), line)
    assert.ok(performance.now() - t < 200, `${unit} took too long`)
  }
})
test('deep nesting is left raw instead of throwing', () => {
  const src = '$' + '{'.repeat(3000) + 'x' + '}'.repeat(3000) + '$'
  assert.equal(convertText(src), src)
})
test('a command chain counts toward the nesting cap, also inside a held block', () => {
  const chain = n => '\\sqrt'.repeat(n) + ' x' // the space keeps `\sqrtx` from reading as an unknown command
  assert.equal(convertText('$$\n' + chain(50) + '\n$$').includes('\\sqrt'), false) // under the cap: converted
  assert.equal(convertText('$$\n' + chain(1000) + '\n$$'), '$$\n' + chain(1000) + '\n$$')
})
test('a block closing on its twentieth held line still closes', () => {
  const s = createStream()
  let out = s.push('$$\n', false)
  for (let k = 0; k < 19; k++) out += s.push('x\n', false)
  out += s.push('$$\n$y^2$\n', true)
  assert.ok(out.endsWith('y²\n'), out.slice(-20))
})
test('a line break before an ampersand keeps neither in the display row', () => {
  assert.equal(convertText('$$a \\\\& b$$'), IND + 'a\n' + IND + 'b')
})
test('an overlong closing line releases the block raw', () => {
  const tail = 'x'.repeat(10001) + '$$'
  assert.equal(convertText('$$\n\\alpha\n' + tail), '$$\n\\alpha\n' + tail)
})

# dotmesh — Design System

A **personal** design system for a developer's daily tools and macOS itself. The
goal is one quiet, coherent language from the shell prompt to the editor to the
system settings panel: **monochrome first** (in the spirit of Microsoft's recent
black‑and‑white work), with **muted syntax colours** used only where colour
carries meaning — code, git state, build status.

It is not a corporate brand. It is the visual layer of a dotfiles setup.

---

## Sources

This system was built **only to learn the toolset** the owner uses day to day —
no palettes or styles were lifted from the repo or from any other design system.
The colour direction (monochrome + three seed accents) was specified by the owner.

- **Dotfiles repo:** <https://github.com/PabloCoello/dotmesh> — macOS dotfiles
  managing Warp (terminal), Zsh, Starship (prompt), VS Code, Git + delta, and the
  AI CLIs OpenCode / Codex / Claude Code. Explore it to understand exactly which
  surfaces this system is meant to theme.

The tools that define the surfaces:

| Surface | Tool | Where it shows up here |
|---|---|---|
| Terminal | Warp | `templates/terminal/` |
| Prompt | Starship (powerline) | `templates/terminal/Prompt.jsx` |
| Editor | VS Code (Fira Code) | `templates/editor/` |
| System | macOS Settings | `templates/macos/` |
| VCS | Git + delta | diff colours in the syntax palette |

---

## The system in one breath

**Paper, Ink, Syntax.**

- **Paper** — true white and near‑white surfaces for light contexts (settings,
  docs, the OS).
- **Ink** — a near‑black canvas (`#121212`) for the terminal and editor.
- **Graphite** — a neutral grey ramp doing all the structural work: text, borders,
  prompt segments, chrome. Chrome stays monochrome on purpose.
- **Syntax** — seven muted accents. Three were chosen by hand
  (`#ffaa7a` peach, `#cbaacb` lilac, `#6cb6b0` teal); four harmonised companions
  (blue, sage, gold, rose) were generated in the same low‑chroma register. They
  appear **only as signal** — syntax tokens, status, git — never as decoration.

---

## CONTENT FUNDAMENTALS

How copy reads across this system.

- **Voice:** terse, lowercase‑leaning, engineer‑to‑self. Labels are short nouns
  and verbs: `Run install`, `Switch branch`, `Auto‑fetch`, `synced`. No marketing
  tone, no exclamation.
- **Person:** mostly impersonal/imperative (`Apply to all tools`,
  `Reduce transparency`). When it addresses anyone it is the second person, quietly.
- **Casing:** Sentence case for UI labels and headings. **Mono lowercase** for
  anything that echoes the shell — versions, branch names, file paths, status
  pills (`passed`, `main`, `py 3.12`). Section overlines are UPPERCASE mono with
  wide tracking.
- **Numbers & paths:** always in JetBrains Mono. Versions and counts read as data, not
  prose (`1.21.1`, `3 failed`, `Ln 4, Col 18`).
- **Emoji:** none. Status uses glyphs from the type itself (`✓`, `✗`, `●`) and
  line icons, never emoji.
- **Spanish/English:** the owner's repo is documented in peninsular Spanish; this
  design system's chrome is in English but copy should stay equally sober in
  either language — no filler, no hype.
- **Vibe:** calm, precise, a little austere. The work is the colour; the interface
  gets out of the way.

Examples — good: `make health`, `0 errors · 2 warnings`, `Export dotfiles`.
Avoid: `Let's get started! 🚀`, `Awesome — your theme is ready!!`.

---

## VISUAL FOUNDATIONS

- **Colour:** monochrome base (Paper / Ink / Graphite). The seven syntax accents
  are muted, light‑medium, low‑chroma — they read on both white and ink. Chrome is
  never coloured; accents only mark meaning. On paper, signals use slightly deeper
  siblings (`--signal-*`) so they pass on white; on ink the pastels are used
  directly.
- **Contrast / ergonomics (from the real implementation):** the shipped configs
  (Warp, VS Code, Starship) surfaced three contrast needs that are now tokens, so
  the system matches what actually reads on screen:
  - **Bright syntax tier (`--syntax-*-bright`).** The muted base tones sit calmly
    on ink but read soft when text must assert — bold markup, bright‑ANSI, a hot
    diff line. A one‑step‑lighter sibling (rose/sage/gold/blue/lilac/teal; peach is
    already there) is used **only for emphasis on ink**, never as a second palette.
  - **Ink chrome ramp (`--chrome-1…6`, `--chrome-text`).** The Starship powerline
    needs six interpolated graphite steps (gray‑800 → gray‑600), not the coarse
    800/700/600 jumps — otherwise light text rides unevenly across the gradient.
    Primary ink‑light (`--chrome-text`, `#eaeaea`) holds on every segment; only the
    segment icons take a syntax accent.
  - **Faint text tier (`--text-faint`).** A dim‑but‑legible step below muted
    (`#474747` on ink, `--gray-300` on paper) for line numbers, disabled labels and
    whitespace guides — so secondary text didn't have to be pushed down to carry
    them.
  - **Deep canvas + calm body (the ratio, not the value).** The ink ramp was
    deepened (`--ink-0` `#16171b → #121212`, the whole scale moving together so
    elevation stays proportional) and the dark primary text dimmed
    (`#e9eaec → #cecece`). Long-reading fatigue on ink came from *too much*
    contrast — a near-white body on near-black rides ~15:1. Dimming the text (not
    the background) drops it to ~11:1: calm but still well above AA. The neutral
    gray is always kept just off pure black (never `#000`) so light text doesn't
    bloom.
- **Type:** **Hanken Grotesk** for UI and display (clean, neutral, a touch warm);
  **JetBrains Mono** for all code, prompts, metadata and numbers — ligatures **on**.
  Display is tightly tracked (`-0.022em`) and heavy (800); body is generous
  (15px / 1.55). Few weights, lots of air.
- **Spacing:** 4px base grid. Layouts breathe — generous padding inside cards,
  clear section rhythm with mono overlines.
- **Backgrounds:** flat. Paper is white or `--gray-50`; ink is `#121212`. The only
  gradients allowed are the faint radial vignettes behind the device windows in
  the device windows of the surface templates — never on content. No textures, no patterns, no illustrations.
- **Borders:** hairline‑first. 1px `--border` (grey‑200 on paper, ink‑3 on dark)
  does most of the separation. Stronger `--border-strong` for inputs and
  interactive edges.
- **Shadows:** soft, neutral, low‑alpha — a sheet of paper lifting, never a glow.
  Border first, shadow only when an element floats (cards on hover, overlays,
  device windows). On ink, shadows are near‑black and borders carry the structure.
- **Corner radii:** modest. 8px (`--radius-md`) is the workhorse; 12px for cards
  and windows; `--radius-pill` only for switches, dots and status. Never
  pill‑everything.
- **Cards:** white (or ink) surface + 1px hairline border + small radius; no
  resting shadow unless lifted. Settings rows live inside a card divided by
  hairlines.
- **Animation:** restrained. 0.14–0.16s ease on colour/border/background; a 0.5px
  press nudge on buttons; switch knob on a gentle cubic‑bezier. No bounce, no
  decorative loops, no parallax.
- **Hover states:** subtle background wash (`--bg-sunken`) or a one‑step border
  darken; ghost elements gain a faint fill and darker text. **Press:** tiny
  downward translate, no colour flip.
- **Focus:** 2px `--focus-ring` outline with offset (ink at ~32% on paper, white
  at ~30% on ink); inputs draw a 3px ring inside an ink border.
- **Transparency / blur:** used sparingly and only on the OS layer (the macOS
  panel can opt into translucency); never behind text‑heavy content. "Reduce
  transparency" is a first‑class toggle.
- **Imagery:** there isn't any, by design. The system's "imagery" is code itself,
  rendered in the syntax theme. If photography is ever added it should be cool and
  neutral — but the default is none.

---

## ICONOGRAPHY

- **In the real tools:** the owner leans on **Nerd Fonts** everywhere — Starship
  powerline glyphs, MesloLGS Nerd Font in the terminal, and the
  **Material Icon Theme** for the VS Code file tree. Symbols are line/glyph based,
  monochrome, sitting inline with mono text.
- **In this system's HTML:** Nerd Font binaries can't be loaded on the web, so
  recreations substitute **[Lucide](https://lucide.dev)** (thin 1.5–2px stroke,
  rounded) via CDN — the closest match to the minimal, even‑weight Nerd Font /
  Fluent look. **This is a substitution; flagged below.** Powerline separators are
  drawn as CSS triangles (clip‑path), not glyphs.
- **Colour:** icons are graphite by default; they take a syntax accent only when
  they carry the same meaning as their segment (folder = teal, git = sage,
  language = blue). Status glyphs (`✓ ✗ ●`) come from the type.
- **Emoji / unicode:** no emoji. A small set of unicode glyphs is used as real
  symbols — `❯` prompt caret, `✓ ✗ ●` status, `›` breadcrumbs.

---

## VISUAL ASSETS

This is a type‑ and token‑driven system with **no logo or illustration set** — the
mark is the monospace wordmark `dotmesh` itself. There is intentionally no
`assets/` artwork: imagery is code in the syntax theme. Fonts load from Google
Fonts (see substitution note).

---

## SUBSTITUTIONS — please confirm

1. **UI font — Hanken Grotesk** stands in for a Segoe‑like neutral grotesque
   (Segoe UI is proprietary). The owner's editor runs Fira Code; this system uses
   **JetBrains Mono** as the mono voice by choice. If you'd prefer a different UI
   grotesque (or to self‑host Segoe), say so.
2. **Icons — Lucide** substitutes the Nerd Font / Material Icon glyphs used in the
   actual tools. If you want the real Nerd Font glyphs in the web recreations,
   share an `.woff2` of your patched font and I'll wire it in.
3. Fonts currently load from **Google Fonts CDN**. For an offline‑safe bundle I can
   self‑host the `.woff2` files under `assets/fonts/` and swap to `@font-face` —
   tell me if you want that.

---

## INDEX

Root manifest.

- `styles.css` — global entry point (the file consumers link). `@import`s only.
- `tokens/`
  - `fonts.css` — Hanken Grotesk + JetBrains Mono (Google Fonts).
  - `colors.css` — Paper / Ink / Graphite + Syntax (base + `-bright`) + Signal +
    Chrome ramp, with `.theme-dark` scope.
  - `typography.css` — families, scale, weights, tracking, line‑heights.
  - `spacing.css` — 4px grid + radii.
  - `elevation.css` — shadows + focus ring vars.
- `guidelines/` — foundation specimen cards (Colors, Type, Spacing, Syntax).
- `components/`
  - `core/` — **Button**, **Badge**, **Card**, **Kbd**
  - `forms/` — **Input**, **Switch**
  - `navigation/` — **Tabs**
- `templates/` — copyable starting folders (shown as **Templates** in consuming
  projects). Each is `templates/<slug>/` with an `@template` first line.
  - `deck/` — Deck personal (`Deck.dc.html`, deck‑stage slides).
  - `terminal/` — Warp window + Starship prompt (`index.html`).
  - `editor/` — VS Code with the dotmesh syntax theme (`index.html`).
  - `macos/` — System Settings · Appearance (`index.html`).
  - `tahoe/` — macOS Tahoe 26 desktop (`index.html`).
- `SKILL.md` — Agent‑Skill entry point.
- `readme.md` — this file.

Components are consumed via `window.DotmeshDesignSystem_512187.<Name>` after
loading the compiled `_ds_bundle.js`. Each component directory has a
`<Name>.prompt.md` with usage.

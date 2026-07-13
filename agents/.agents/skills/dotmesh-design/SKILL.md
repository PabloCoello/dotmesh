---
name: dotmesh-design
description: Use this skill to generate well-branded interfaces and assets for dotmesh — a personal, monochrome-first developer design system (Microsoft-style black & white with muted syntax accents) for theming terminal, editor, prompt and macOS surfaces — either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, and UI kit components for prototyping.
user-invocable: true
disable-model-invocation: true
---

Read the README.md file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this system.

Core idea: **Paper, Ink, Syntax.** Monochrome chrome (Paper white / Ink near-black / a Graphite grey ramp), with seven muted syntax accents used *only* as signal — code, git state, status — never as decoration. Hanken Grotesk for UI, Fira Code for everything code-shaped (ligatures on). Hairline-first borders, soft low-alpha shadows, modest radii, restrained animation.

Where to look:
- `styles.css` — link this one file to inherit every token.
- `tokens/` — colours (with `.theme-dark` scope), type, spacing, elevation.
- `guidelines/` — foundation specimen cards.
- `components/` — Button, Badge, Card, Kbd, Input, Switch, Tabs (consume via `window.DotmeshDesignSystem_512187.<Name>` after loading the compiled `_ds_bundle.js`; each has a `.prompt.md`).
- `templates/` — copyable starting folders: deck (`Deck.dc.html`), terminal (Ghostty + Starship), editor (VS Code theme), macos (System Settings), tahoe (Tahoe 26 desktop) — full-surface recreations consuming projects can copy and adapt.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need. Keep copy sober and lowercase-leaning; no emoji.

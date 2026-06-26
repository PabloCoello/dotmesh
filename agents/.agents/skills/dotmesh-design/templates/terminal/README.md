# Terminal — Warp + Starship

A re-skinned **Warp** terminal window running an interactive `zsh` session with a
**Starship** powerline prompt, rendered in the dotmesh palette.

- `index.html` — interactive entry. Type `make health`, `git status`, or `ls`.
- `Prompt.jsx` — the powerline prompt. Graphite segments (monochrome chrome) with
  syntax-tinted Lucide icons (folder = teal, git = sage, language = blue).
  Separators are CSS triangles, not Nerd Font glyphs.
- `WarpWindow.jsx` — window chrome + block-based session + command runner.

Chrome stays monochrome (grey traffic lights); colour appears only in output as
signal (`✓` sage, versions peach, branch lilac, errors rose). Nerd Font glyphs are
substituted with Lucide — see root README.

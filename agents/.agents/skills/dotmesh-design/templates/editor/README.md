# Editor — VS Code · dotmesh theme

A re-skinned **VS Code** window showing the dotmesh **syntax theme** on an ink
canvas. Click files in the explorer to open tabs and switch the code shown.

- `index.html` — interactive entry.
- `CodePane.jsx` — hand-tokenised file contents + the gutter/cursor code pane.
  Syntax mapping: keyword = lilac, function = blue, string = sage, number = peach,
  type = gold, comment = muted grey, property = teal.
- `Sidebar.jsx` — file explorer (Lucide icons, graphite chrome).
- `EditorWindow.jsx` — activity bar, tabs, breadcrumb, status bar.

Chrome is monochrome graphite; the only colour is the code and a few status
accents (git branch sage, errors rose, language peach). Icons are Lucide
substituting the Material Icon Theme / Nerd Font glyphs — see root README.

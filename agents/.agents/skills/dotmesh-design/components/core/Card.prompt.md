Container surface for grouped content — settings rows, panels, list items. Border-first; add elevation only when the card floats.

```jsx
<Card padding="md">
  <h3>Ghostty · dotmesh</h3>
  <p>Terminal theme synced.</p>
</Card>
<Card interactive elevation="sm">…</Card>
```

Props: `padding` (`sm`/`md`/`lg`), `elevation` (`none`/`sm`/`md`/`lg`), `interactive` (hover lift). Compose freely — the card brings no internal layout.

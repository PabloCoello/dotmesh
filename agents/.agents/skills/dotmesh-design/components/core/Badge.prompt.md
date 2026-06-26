Small label for status, counts, language tags, git state — set in mono to echo the terminal.

```jsx
<Badge tone="success" dot>passed</Badge>
<Badge tone="lilac">python</Badge>
<Badge tone="neutral" variant="outline">main</Badge>
<Badge tone="rose" variant="solid">3 failed</Badge>
```

Tones: `neutral` + signals (`success`/`warning`/`danger`/`info`) + syntax (`peach`/`lilac`/`teal`/`blue`/`sage`/`gold`/`rose`). Variants: `soft` (default), `solid`, `outline`. Optional `dot`.

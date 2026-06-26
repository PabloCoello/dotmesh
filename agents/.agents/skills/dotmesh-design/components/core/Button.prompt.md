Monochrome action button — use for any clickable action; reserve `primary` for the single main action per view and `danger` for destructive ones.

```jsx
<Button variant="primary">Run install</Button>
<Button variant="secondary" leadingIcon={<Icon name="git-branch" />}>Switch branch</Button>
<Button variant="ghost" size="sm">Cancel</Button>
<Button variant="danger">Unstow</Button>
```

Variants: `primary` (ink fill), `secondary` (hairline outline), `ghost` (text-only), `danger` (rose outline). Sizes: `sm` · `md` · `lg`. Props: `fullWidth`, `leadingIcon`, `trailingIcon`, `disabled`. Stays monochrome — colour only appears on `danger`.

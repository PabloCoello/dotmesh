Text field with optional label, mono affixes and a hint line. Affixes are great for paths and file extensions.

```jsx
<Input label="Worktree name" placeholder="session/abc1" />
<Input prefix="~/" suffix=".zsh" defaultValue=".config/shell/aliases" />
<Input label="Token" invalid hint="Required" />
```

Props: `label`, `prefix`, `suffix`, `hint`, `invalid` — plus all native input attributes. Focus draws an ink ring.

Controlled on/off toggle for settings rows. Monochrome track fills with ink when on.

```jsx
const [on, setOn] = React.useState(true);
<Switch checked={on} onChange={setOn} label="Auto-fetch" />
```

Props: `checked`, `onChange(next)`, `label`, `disabled`. Pair with `Card` rows for a settings list.

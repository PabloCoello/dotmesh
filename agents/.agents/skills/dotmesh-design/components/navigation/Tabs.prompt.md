Horizontal underline tabs for switching views or panels. Controlled.

```jsx
const [tab, setTab] = React.useState("shell");
<Tabs
  value={tab}
  onChange={setTab}
  items={[
    { value: "shell", label: "Shell" },
    { value: "git", label: "Git", count: 3 },
    "Warp",
  ]}
/>
```

Active tab gets an ink underline and bolder label. Items accept `{value,label,count}` or a bare string.

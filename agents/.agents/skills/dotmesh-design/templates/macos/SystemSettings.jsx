/* macOS System Settings, dotmesh-themed. Composes the design
   system primitives from the compiled bundle. Light surface —
   the Microsoft-minimal paper side of the system. */

function NavItem({ icon, label, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 10, height: 32, padding: "0 10px", borderRadius: "var(--radius-md)",
      background: active ? "var(--accent)" : "transparent",
      color: active ? "var(--accent-contrast)" : "var(--text-primary)",
      cursor: "pointer", fontSize: 13.5, fontWeight: 500,
    }}
    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--bg-sunken)"; }}
    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <i data-lucide={icon} style={{ width: 16, height: 16, opacity: active ? 1 : 0.7 }} />
      {label}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--text-muted)", margin: "0 0 12px 2px" }}>{children}</div>;
}

function SettingRow({ title, desc, control, last }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "13px 16px", borderBottom: last ? "none" : "1px solid var(--hairline)" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)" }}>{title}</div>
        {desc && <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>{desc}</div>}
      </div>
      {control}
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: "var(--bg-sunken)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 2 }}>
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} style={{
          fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, padding: "5px 14px", border: "none", cursor: "pointer",
          borderRadius: "var(--radius-sm)", background: value === o ? "var(--surface)" : "transparent",
          color: value === o ? "var(--text-primary)" : "var(--text-secondary)",
          boxShadow: value === o ? "var(--shadow-sm)" : "none",
        }}>{o}</button>
      ))}
    </div>
  );
}

function SystemSettings() {
  const NS = window.DotmeshDesignSystem_512187 || {};
  const { Card, Switch, Button, Badge, Input } = NS;
  const [nav, setNav] = React.useState("Appearance");
  const [theme, setTheme] = React.useState("Light");
  const [accent, setAccent] = React.useState("peach");
  const [transparency, setTransparency] = React.useState(true);
  const [contrast, setContrast] = React.useState(false);
  const [sync, setSync] = React.useState({ Ghostty: true, "VS Code": true, Starship: false });

  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });

  const swatches = [
    ["peach", "var(--syntax-peach)"], ["lilac", "var(--syntax-lilac)"], ["teal", "var(--syntax-teal)"],
    ["blue", "var(--syntax-blue)"], ["sage", "var(--syntax-sage)"], ["gold", "var(--syntax-gold)"], ["rose", "var(--syntax-rose)"],
  ];
  const tools = [
    { name: "Ghostty", icon: "terminal", status: "synced" },
    { name: "VS Code", icon: "code", status: "synced" },
    { name: "Starship", icon: "chevron-right", status: "paused" },
  ];

  return (
    <div style={{ width: 900, height: 600, background: "var(--surface)", borderRadius: 12, boxShadow: "0 30px 80px rgba(20,22,26,.25), 0 0 0 1px rgba(20,22,26,.06)", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "var(--font-sans)" }}>
      {/* title bar */}
      <div style={{ height: 44, display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid var(--hairline)", flex: "none" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "var(--gray-300)" }} />
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "var(--gray-300)" }} />
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "var(--gray-300)" }} />
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* sidebar */}
        <div style={{ width: 232, background: "var(--bg-sunken)", borderRight: "1px solid var(--hairline)", flex: "none", padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
          {Input && <Input prefix={<i data-lucide="search" style={{ width: 14, height: 14, display: "flex" }} />} placeholder="Search" style={{ marginBottom: 8 }} />}
          {["Appearance", "Terminal", "Editor", "Git", "Shell", "Agents"].map((n, i) => (
            <NavItem key={n} icon={["palette", "terminal", "code", "git-branch", "square-terminal", "sparkles"][i]} label={n} active={nav === n} onClick={() => setNav(n)} />
          ))}
        </div>
        {/* content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "26px 30px" }}>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", marginBottom: 22 }}>Appearance</div>

          <SectionLabel>Theme</SectionLabel>
          <div style={{ marginBottom: 26 }}>
            <Segmented options={["Light", "Dark", "Auto"]} value={theme} onChange={setTheme} />
          </div>

          <SectionLabel>Accent · syntax family</SectionLabel>
          <div style={{ display: "flex", gap: 12, marginBottom: 30 }}>
            {swatches.map(([k, c]) => (
              <button key={k} onClick={() => setAccent(k)} title={k} style={{
                width: 30, height: 30, borderRadius: 999, background: c, cursor: "pointer",
                border: "2px solid " + (accent === k ? "var(--text-primary)" : "transparent"),
                outline: accent === k ? "none" : "1px solid var(--border)", outlineOffset: -1,
              }} />
            ))}
          </div>

          <SectionLabel>Surfaces</SectionLabel>
          {Card && (
            <Card padding="sm" style={{ marginBottom: 30, padding: 0 }}>
              <SettingRow title="Reduce transparency" desc="Solid panels instead of blur." control={Switch && <Switch checked={transparency} onChange={setTransparency} />} />
              <SettingRow title="Increase contrast" desc="Stronger hairlines and text." last control={Switch && <Switch checked={contrast} onChange={setContrast} />} />
            </Card>
          )}

          <SectionLabel>Synced tools</SectionLabel>
          {Card && (
            <Card padding="sm" style={{ marginBottom: 26, padding: 0 }}>
              {tools.map((t, i) => (
                <SettingRow key={t.name} last={i === tools.length - 1}
                  title={<span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}><i data-lucide={t.icon} style={{ width: 16, height: 16, color: "var(--text-secondary)" }} />{t.name}</span>}
                  control={
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      {Badge && <Badge tone={t.status === "synced" ? "success" : "warning"} dot>{t.status}</Badge>}
                      {Switch && <Switch checked={sync[t.name]} onChange={(v) => setSync((s) => ({ ...s, [t.name]: v }))} />}
                    </div>
                  }
                />
              ))}
            </Card>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            {Button && <Button variant="primary">Apply to all tools</Button>}
            {Button && <Button variant="secondary">Export dotfiles</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SystemSettings });

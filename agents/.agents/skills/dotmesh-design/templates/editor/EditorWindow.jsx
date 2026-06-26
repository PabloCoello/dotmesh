/* VS Code-style editor window, re-skinned in the dotmesh palette.
   Self-contained: tokens via styles.css, Sidebar + CodePane from
   sibling files. */

function ActivityBar() {
  const items = ["files", "search", "git-branch", "play", "blocks"];
  return (
    <div style={{ width: 48, background: "var(--ink-1)", flex: "none", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, gap: 18 }}>
      {items.map((ic, i) => (
        <div key={ic} style={{ position: "relative", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {i === 0 && <span style={{ position: "absolute", left: -8, top: 4, bottom: 4, width: 2, background: "var(--accent)" }} />}
          <i data-lucide={ic} style={{ width: 19, height: 19, color: i === 0 ? "#e9eaec" : "#6a6d74" }} />
        </div>
      ))}
      <div style={{ marginTop: "auto", paddingBottom: 14, display: "flex", flexDirection: "column", gap: 16, alignItems: "center" }}>
        <i data-lucide="sparkles" style={{ width: 19, height: 19, color: "var(--syntax-peach)" }} />
        <i data-lucide="settings-2" style={{ width: 19, height: 19, color: "#6a6d74" }} />
      </div>
    </div>
  );
}

function Tab({ label, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 16px",
      background: active ? "var(--ink-0)" : "transparent",
      color: active ? "#e9eaec" : "#9a9da4", fontFamily: "var(--font-sans)", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
    }}>
      <i data-lucide="file-code" style={{ width: 14, height: 14, color: "#6a6d74" }} />
      {label}
      <i data-lucide="x" style={{ width: 13, height: 13, color: "#6a6d74", marginLeft: 4 }} />
    </div>
  );
}

function StatusBar({ file }) {
  const lang = file.endsWith(".py") ? "Python" : file.endsWith(".toml") ? "TOML" : "CSS";
  return (
    <div style={{ height: 26, background: "var(--ink-1)", display: "flex", alignItems: "center", gap: 16, padding: "0 12px", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "#9a9da4", flex: "none" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--syntax-sage)" }}><i data-lucide="git-branch" style={{ width: 12, height: 12 }} /> main</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><i data-lucide="circle-x" style={{ width: 12, height: 12, color: "var(--syntax-rose)" }} /> 0 <i data-lucide="triangle-alert" style={{ width: 12, height: 12, color: "var(--syntax-gold)" }} /> 2</span>
      <span style={{ marginLeft: "auto" }}>Ln 4, Col 18</span>
      <span>Spaces: 4</span>
      <span>UTF-8</span>
      <span style={{ color: "var(--syntax-peach)" }}>{lang}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--syntax-peach)" }}><i data-lucide="sparkles" style={{ width: 12, height: 12 }} /> Claude</span>
    </div>
  );
}

function EditorWindow() {
  const { Sidebar, CodePane } = window;
  const [open, setOpen] = React.useState(["colors.css", "weight.py"]);
  const [active, setActive] = React.useState("colors.css");

  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });

  const openFile = (f) => {
    setActive(f);
    setOpen((o) => (o.includes(f) ? o : [...o, f]));
  };

  return (
    <div style={{ width: 920, height: 560, background: "var(--ink-0)", borderRadius: 12, boxShadow: "0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.03)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* title bar */}
      <div style={{ height: 38, display: "flex", alignItems: "center", padding: "0 14px", background: "var(--ink-1)", flex: "none" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "#3c3f47" }} />
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "#3c3f47" }} />
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "#3c3f47" }} />
        </div>
        <div style={{ flex: 1, textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 12.5, color: "#9a9da4", whiteSpace: "nowrap" }}>{active} — dotmesh</div>
        <div style={{ width: 52 }} />
      </div>
      {/* body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <ActivityBar />
        <Sidebar openFile={active} onOpen={openFile} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ height: 38, display: "flex", background: "var(--ink-1)", flex: "none", overflow: "hidden" }}>
            {open.map((f) => <Tab key={f} label={f} active={f === active} onClick={() => setActive(f)} />)}
          </div>
          <div style={{ padding: "6px 16px", color: "#6a6d74", fontFamily: "var(--font-mono)", fontSize: 11.5, background: "var(--ink-0)", display: "flex", gap: 6, alignItems: "center", flex: "none" }}>
            <span style={{ color: "var(--syntax-gold)" }}>tokens</span><span>›</span><span style={{ color: "#e9eaec" }}>{active}</span>
          </div>
          <CodePane file={active} />
        </div>
      </div>
      <StatusBar file={active} />
    </div>
  );
}

Object.assign(window, { EditorWindow });

/* File explorer sidebar for the editor kit. */

function Row({ depth = 0, icon, iconColor, label, active, onClick, caret }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6, height: 24, cursor: "pointer",
      paddingLeft: 10 + depth * 14, paddingRight: 10,
      background: active ? "rgba(255,255,255,.06)" : "transparent",
      color: active ? "#e9eaec" : "#9a9da4", fontFamily: "var(--font-sans)", fontSize: 13,
    }}
    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,.03)"; }}
    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      {caret !== undefined
        ? <i data-lucide={caret ? "chevron-down" : "chevron-right"} style={{ width: 13, height: 13, color: "#6a6d74" }} />
        : <span style={{ width: 13 }} />}
      <i data-lucide={icon} style={{ width: 14, height: 14, color: iconColor || "#6a6d74", flex: "none" }} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </div>
  );
}

function Sidebar({ openFile, onOpen }) {
  return (
    <div style={{ width: 224, background: "var(--ink-1)", flex: "none", display: "flex", flexDirection: "column" }}>
      <div style={{ height: 36, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", color: "#9a9da4", fontFamily: "var(--font-sans)", fontSize: 11, letterSpacing: ".12em" }}>
        <span>DOTMESH</span>
        <i data-lucide="ellipsis" style={{ width: 14, height: 14 }} />
      </div>
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 2 }}>
        <Row caret={true} icon="folder-open" label="tokens" iconColor="var(--syntax-gold)" />
        <Row depth={1} icon="file-code" label="colors.css" active={openFile === "colors.css"} onClick={() => onOpen("colors.css")} />
        <Row depth={1} icon="file-code" label="typography.css" onClick={() => onOpen("colors.css")} />
        <Row caret={true} icon="folder-open" label="ui_kits" iconColor="var(--syntax-gold)" />
        <Row depth={1} icon="file-code" label="weight.py" active={openFile === "weight.py"} onClick={() => onOpen("weight.py")} />
        <Row caret={false} icon="folder" label="components" iconColor="var(--syntax-gold)" />
        <Row icon="file-code" label="starship.toml" active={openFile === "starship.toml"} onClick={() => onOpen("starship.toml")} />
        <Row icon="file-text" label="README.md" onClick={() => onOpen("colors.css")} />
        <Row icon="settings" label="Makefile" onClick={() => onOpen("starship.toml")} />
      </div>
    </div>
  );
}

Object.assign(window, { Sidebar });

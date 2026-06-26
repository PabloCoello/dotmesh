/* macOS Tahoe 26 menu bar — Liquid Glass (translucent). Monochrome
   glyphs over the wallpaper. */

function MenuBar({ dark }) {
  const fg = dark ? "rgba(255,255,255,.92)" : "rgba(20,22,26,.88)";
  const fgDim = dark ? "rgba(255,255,255,.62)" : "rgba(20,22,26,.55)";
  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });
  const menus = ["Finder", "Archivo", "Edición", "Visualización", "Ir", "Ventana", "Ayuda"];
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, height: 30,
      display: "flex", alignItems: "center", gap: 20, padding: "0 16px",
      // Liquid Glass: barely-there translucency
      background: dark ? "rgba(28,29,34,.18)" : "rgba(255,255,255,.20)",
      backdropFilter: "blur(18px) saturate(150%)", WebkitBackdropFilter: "blur(18px) saturate(150%)",
      fontFamily: "var(--font-sans)", fontSize: 13.5, color: fg, zIndex: 40,
    }}>
      <i data-lucide="command" style={{ width: 16, height: 16, color: fg }} />
      <span style={{ fontWeight: 700 }}>{menus[0]}</span>
      {menus.slice(1).map((m) => <span key={m} style={{ fontWeight: 500, color: fg }}>{m}</span>)}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
        <i data-lucide="git-branch" style={{ width: 15, height: 15, color: fgDim }} />
        <i data-lucide="battery-full" style={{ width: 17, height: 17, color: fg }} />
        <i data-lucide="wifi" style={{ width: 15, height: 15, color: fg }} />
        <i data-lucide="search" style={{ width: 15, height: 15, color: fg }} />
        <i data-lucide="panel-top" style={{ width: 15, height: 15, color: fg }} />
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>mié 18 jun</span>
        <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>14:32</span>
      </div>
    </div>
  );
}

Object.assign(window, { MenuBar });

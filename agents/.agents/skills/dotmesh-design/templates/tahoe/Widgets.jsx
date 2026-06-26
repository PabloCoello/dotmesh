/* Liquid Glass desktop widgets for the Tahoe sim. Monochrome,
   dotmesh-themed. */

function Glass({ dark, children, style = {} }) {
  return (
    <div style={{
      borderRadius: 22,
      background: dark ? "rgba(36,37,43,.34)" : "rgba(255,255,255,.40)",
      backdropFilter: "blur(28px) saturate(150%)", WebkitBackdropFilter: "blur(28px) saturate(150%)",
      border: dark ? "1px solid rgba(255,255,255,.12)" : "1px solid rgba(255,255,255,.6)",
      boxShadow: dark ? "0 16px 44px rgba(0,0,0,.40), inset 0 1px 0 rgba(255,255,255,.10)" : "0 16px 44px rgba(20,22,26,.14), inset 0 1px 0 rgba(255,255,255,.7)",
      color: dark ? "#e9eaec" : "#16181d", fontFamily: "var(--font-sans)",
      ...style,
    }}>{children}</div>
  );
}

function Widgets({ dark }) {
  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });
  const sub = dark ? "rgba(255,255,255,.6)" : "rgba(20,22,26,.55)";
  return (
    <div style={{ position: "absolute", top: 64, right: 40, display: "flex", flexDirection: "column", gap: 20, zIndex: 10, width: 248 }}>
      {/* Clock */}
      <Glass dark={dark} style={{ padding: "22px 24px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: ".18em", textTransform: "uppercase", color: sub }}>miércoles</div>
        <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, marginTop: 4 }}>14:32</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 14, color: sub }}>
          <i data-lucide="sun" style={{ width: 15, height: 15 }} /> 18° · despejado
        </div>
      </Glass>

      {/* System / theme widget */}
      <Glass dark={dark} style={{ padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 19, fontWeight: 600 }}>dotmesh<span style={{ color: "var(--syntax-teal)" }}>.</span></span>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--syntax-sage)" }} />
        </div>
        <div style={{ fontSize: 13, color: sub, marginTop: 10, lineHeight: 1.5 }}>Tema activo en 4 superficies</div>
        <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
          {["peach", "lilac", "teal", "blue", "sage", "gold"].map((t) => (
            <span key={t} style={{ flex: 1, height: 8, borderRadius: 999, background: `var(--syntax-${t})` }} />
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 16, fontFamily: "var(--font-mono)", fontSize: 11.5, color: sub }}>
          <i data-lucide="apple" style={{ width: 13, height: 13 }} /> macOS Tahoe 26.5.1
        </div>
      </Glass>
    </div>
  );
}

Object.assign(window, { Widgets });

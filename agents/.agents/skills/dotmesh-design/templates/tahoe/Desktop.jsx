/* macOS Tahoe 26 desktop simulation, dotmesh-themed.
   Composes MenuBar + Widgets + Dock over a minimal dot-mesh
   wallpaper. A small control toggles two feasible appearance
   configs (Dark / Light Liquid Glass). */

function Wallpaper({ dark }) {
  // Minimal dotmesh wallpaper: deep graphite (or paper) gradient,
  // a faint dot mesh, and one soft syntax-tinted glow.
  const base = dark
    ? "radial-gradient(130% 110% at 28% 18%, #20222a 0%, #16171b 52%, #101116 100%)"
    : "radial-gradient(130% 110% at 28% 18%, #ffffff 0%, #f1f1f3 55%, #e6e7ea 100%)";
  const dot = dark ? "rgba(255,255,255,.05)" : "rgba(20,22,26,.05)";
  return (
    <div style={{ position: "absolute", inset: 0, background: base, overflow: "hidden" }}>
      {/* dot mesh */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `radial-gradient(${dot} 1.4px, transparent 1.4px)`, backgroundSize: "30px 30px", backgroundPosition: "center" }} />
      {/* soft syntax glow */}
      <div style={{ position: "absolute", width: 720, height: 720, left: "52%", top: "30%", borderRadius: "50%", background: "radial-gradient(circle, color-mix(in oklab, var(--syntax-peach) 26%, transparent), transparent 62%)", filter: "blur(40px)", opacity: dark ? 0.5 : 0.4 }} />
      <div style={{ position: "absolute", width: 560, height: 560, left: "8%", top: "44%", borderRadius: "50%", background: "radial-gradient(circle, color-mix(in oklab, var(--syntax-teal) 22%, transparent), transparent 62%)", filter: "blur(46px)", opacity: dark ? 0.42 : 0.34 }} />
    </div>
  );
}

function Desktop() {
  const { MenuBar, Dock, Widgets } = window;
  const [dark, setDark] = React.useState(true);
  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });
  return (
    <div style={{ position: "relative", width: 1280, height: 800, borderRadius: 14, overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,.5), 0 0 0 1px rgba(0,0,0,.3)" }}>
      <Wallpaper dark={dark} />
      <MenuBar dark={dark} />
      <Widgets dark={dark} />
      <Dock dark={dark} />

      {/* appearance toggle — bottom-left, glassy */}
      <button
        onClick={() => setDark((d) => !d)}
        style={{
          position: "absolute", left: 24, bottom: 30, zIndex: 50, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 9, padding: "9px 15px", borderRadius: 999,
          background: dark ? "rgba(40,41,46,.4)" : "rgba(255,255,255,.45)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          border: dark ? "1px solid rgba(255,255,255,.16)" : "1px solid rgba(255,255,255,.6)",
          color: dark ? "#e9eaec" : "#16181d", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500,
          boxShadow: "0 8px 20px rgba(0,0,0,.2)",
        }}
      >
        <i data-lucide={dark ? "moon" : "sun"} style={{ width: 15, height: 15 }} />
        {dark ? "Liquid Glass · Oscuro" : "Liquid Glass · Claro"}
      </button>
    </div>
  );
}

Object.assign(window, { Desktop });

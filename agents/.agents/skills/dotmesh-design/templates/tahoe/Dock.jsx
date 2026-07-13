/* macOS Tahoe 26 Dock — Liquid Glass tray with monochrome (Tinted-
   style) squircle app icons. A couple carry a muted syntax tint to
   echo the design system; the rest stay graphite. */

// [label, lucide glyph, tint] — tint null = monochrome graphite
const APPS = [
  ["Finder", "folder", "blue"],
  ["Ghostty", "square-terminal", null],
  ["VS Code", "code-xml", null],
  ["Safari", "compass", null],
  ["Mail", "mail", null],
  ["Mensajes", "message-circle", "sage"],
  ["Música", "music", "peach"],
  ["Fotos", "image", null],
  ["Notas", "notebook-pen", "gold"],
  ["Ajustes", "settings", null],
];

function tintColor(t) {
  return ({
    blue: "var(--syntax-blue)", sage: "var(--syntax-sage)",
    peach: "var(--syntax-peach)", gold: "var(--syntax-gold)",
    lilac: "var(--syntax-lilac)", teal: "var(--syntax-teal)",
  })[t];
}

function DockIcon({ label, glyph, tint, dark }) {
  const [hover, setHover] = React.useState(false);
  // Tinted/Dark icon style: dark glass squircle, light glyph; tinted ones
  // get a faint coloured glass + coloured glyph.
  const c = tint ? tintColor(tint) : null;
  const bg = dark
    ? (c ? `color-mix(in oklab, ${c} 22%, #26272d)` : "linear-gradient(160deg, #34363d, #232429)")
    : (c ? `color-mix(in oklab, ${c} 26%, #f2f2f4)` : "linear-gradient(160deg, #fbfbfc, #e7e8ea)");
  const glyphColor = dark
    ? (c ? c : "rgba(255,255,255,.9)")
    : (c ? `color-mix(in oklab, ${c} 70%, #16181d)` : "rgba(20,22,26,.82)");
  const border = dark ? "1px solid rgba(255,255,255,.10)" : "1px solid rgba(20,22,26,.08)";
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", transition: "transform .18s cubic-bezier(.3,.8,.3,1)", transform: hover ? "translateY(-12px) scale(1.08)" : "none" }}
    >
      {hover && (
        <div style={{ position: "absolute", top: -38, whiteSpace: "nowrap", fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 500, color: dark ? "#fff" : "#16181d", background: dark ? "rgba(40,41,46,.7)" : "rgba(255,255,255,.7)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", padding: "5px 11px", borderRadius: 8, boxShadow: "0 6px 18px rgba(0,0,0,.25)" }}>{label}</div>
      )}
      <div style={{
        width: 54, height: 54, borderRadius: 15, background: bg, border,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: dark ? "inset 0 1px 0 rgba(255,255,255,.08), 0 4px 10px rgba(0,0,0,.30)" : "inset 0 1px 0 rgba(255,255,255,.7), 0 4px 10px rgba(20,22,26,.12)",
      }}>
        <i data-lucide={glyph} style={{ width: 28, height: 28, color: glyphColor }} />
      </div>
    </div>
  );
}

function Dock({ dark }) {
  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 14, display: "flex", justifyContent: "center", zIndex: 30 }}>
      <div style={{
        display: "flex", alignItems: "flex-end", gap: 12, padding: "10px 14px",
        borderRadius: 26,
        // Liquid Glass tray
        background: dark ? "rgba(40,41,46,.30)" : "rgba(255,255,255,.32)",
        backdropFilter: "blur(34px) saturate(160%)", WebkitBackdropFilter: "blur(34px) saturate(160%)",
        border: dark ? "1px solid rgba(255,255,255,.12)" : "1px solid rgba(255,255,255,.55)",
        boxShadow: dark ? "0 18px 50px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.12)" : "0 18px 50px rgba(20,22,26,.20), inset 0 1px 0 rgba(255,255,255,.7)",
      }}>
        {APPS.map((a) => <DockIcon key={a[0]} label={a[0]} glyph={a[1]} tint={a[2]} dark={dark} />)}
        <div style={{ width: 1, alignSelf: "stretch", margin: "4px 4px", background: dark ? "rgba(255,255,255,.14)" : "rgba(20,22,26,.12)" }} />
        <DockIcon label="Papelera" glyph="trash-2" tint={null} dark={dark} />
      </div>
    </div>
  );
}

Object.assign(window, { Dock });

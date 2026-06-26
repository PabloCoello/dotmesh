/* Starship-style powerline prompt, re-skinned in the dotmesh
   palette: graphite segments (monochrome chrome) with syntax-
   tinted icons (signal only). Nerd-Font glyphs are substituted
   with Lucide line icons — see README. */

function Sep({ from, to }) {
  return (
    <span style={{ width: 11, height: "100%", background: to, position: "relative", flex: "none" }}>
      <span style={{ position: "absolute", inset: 0, background: from, clipPath: "polygon(0 0, 0 100%, 100% 50%)" }} />
    </span>
  );
}

function Seg({ bg, children, accent }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 7, height: "100%",
      background: bg, padding: "0 11px", fontFamily: "var(--font-mono)",
      fontSize: 12.5, color: "#e9eaec", whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function Ico({ name, color }) {
  return <i data-lucide={name} style={{ width: 13, height: 13, color: color || "#cfd2d8", display: "inline-flex" }} />;
}

const TERM = "transparent";

function Prompt({ user = "pablo", path = "~/dev/dotmesh", branch = "main", lang = "py 3.12", time = "14:32", dirty = false }) {
  const g1 = "#2a2c33", g2 = "#33363d", g3 = "#3c3f47", g4 = "#474b54", g5 = "#565a63";
  return (
    <div style={{ display: "flex", alignItems: "stretch", height: 24, marginTop: 2 }}>
      <Seg bg={g1}><Ico name="command" color="var(--syntax-peach)" />{user}</Seg>
      <Sep from={g1} to={g2} />
      <Seg bg={g2}><Ico name="folder" color="var(--syntax-teal)" />{path}</Seg>
      <Sep from={g2} to={g3} />
      <Seg bg={g3}><Ico name="git-branch" color="var(--syntax-sage)" />{branch}{dirty && <span style={{ color: "var(--syntax-peach)" }}>●</span>}</Seg>
      <Sep from={g3} to={g4} />
      <Seg bg={g4}><Ico name="circle-dot" color="var(--syntax-blue)" />{lang}</Seg>
      <Sep from={g4} to={g5} />
      <Seg bg={g5}><Ico name="clock" color="#cfd2d8" />{time}</Seg>
      <Sep from={g5} to={TERM} />
    </div>
  );
}

Object.assign(window, { Prompt });

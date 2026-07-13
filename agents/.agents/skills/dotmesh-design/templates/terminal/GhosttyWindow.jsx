/* Ghostty terminal window, dotmesh theme. Self-contained: uses
   design tokens via styles.css and the Prompt from Prompt.jsx. */

const L = (t, c) => ({ t, c });

function runCommand(cmd) {
  const c = cmd.trim();
  if (c === "make health") {
    return [
      [L("✓ ", "var(--syntax-sage)"), L("stow      ", "#e9eaec"), L("1.6.0", "var(--syntax-peach)")],
      [L("✓ ", "var(--syntax-sage)"), L("starship  ", "#e9eaec"), L("1.21.1", "var(--syntax-peach)")],
      [L("✓ ", "var(--syntax-sage)"), L("delta     ", "#e9eaec"), L("0.18.2", "var(--syntax-peach)")],
      [L("✓ ", "var(--syntax-sage)"), L("zsh       ", "#e9eaec"), L("5.9", "var(--syntax-peach)")],
      [L("all binaries present.", "#6a6d74")],
    ];
  }
  if (c === "git status") {
    return [
      [L("On branch ", "#9a9da4"), L("main", "var(--syntax-lilac)")],
      [L("Your branch is up to date with ", "#9a9da4"), L("'origin/main'", "var(--syntax-sage)"), L(".", "#9a9da4")],
      [L("", "#fff")],
      [L("Changes not staged for commit:", "#9a9da4")],
      [L("  modified:   ", "var(--syntax-gold)"), L("tokens/colors.css", "#e9eaec")],
      [L("  modified:   ", "var(--syntax-gold)"), L("styles.css", "#e9eaec")],
    ];
  }
  if (c === "ls" || c === "ll") {
    return [
      [L("README.md   ", "#e9eaec"), L("Makefile   ", "#e9eaec"), L("styles.css", "#e9eaec")],
      [L("tokens/     ", "var(--syntax-blue)"), L("components/   ", "var(--syntax-blue)"), L("ui_kits/", "var(--syntax-blue)")],
    ];
  }
  if (c === "") return [];
  return [[L("zsh: command not found: ", "var(--syntax-rose)"), L(c.split(" ")[0], "#e9eaec")]];
}

function Line({ segs }) {
  return (
    <div style={{ minHeight: 21, lineHeight: "21px" }}>
      {segs.map((s, i) => <span key={i} style={{ color: s.c, whiteSpace: "pre" }}>{s.t}</span>)}
    </div>
  );
}

function Block({ block, dirty }) {
  const { Prompt } = window;
  return (
    <div style={{ padding: "10px 0", borderTop: "1px solid #1f2127" }}>
      <Prompt branch="main" lang="py 3.12" dirty={dirty} />
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginTop: 4 }}>
        <span style={{ color: "var(--syntax-sage)", fontFamily: "var(--font-mono)", fontSize: 13.5, flex: "none" }}>❯</span>
        <span style={{ color: "#e9eaec", fontFamily: "var(--font-mono)", fontSize: 13.5, whiteSpace: "nowrap" }}>{block.cmd}</span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, marginTop: 4 }}>
        {block.out.map((segs, i) => <Line key={i} segs={segs} />)}
      </div>
    </div>
  );
}

function GhosttyWindow() {
  const { Prompt } = window;
  const [blocks, setBlocks] = React.useState([
    { cmd: "make health", out: runCommand("make health") },
  ]);
  const [input, setInput] = React.useState("");
  const bodyRef = React.useRef(null);

  React.useEffect(() => { if (window.lucide) window.lucide.createIcons(); });
  React.useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [blocks]);

  const submit = (e) => {
    e.preventDefault();
    const cmd = input;
    setBlocks((b) => [...b, { cmd, out: runCommand(cmd) }]);
    setInput("");
  };

  return (
    <div style={{
      width: 760, height: 480, background: "var(--ink-0)", borderRadius: 12,
      boxShadow: "0 30px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.04)",
      overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      {/* title bar */}
      <div style={{ height: 40, display: "flex", alignItems: "center", padding: "0 14px", background: "#1c1d22", borderBottom: "1px solid #121317", flex: "none" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "#3c3f47" }} />
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "#3c3f47" }} />
          <span style={{ width: 12, height: 12, borderRadius: 999, background: "#3c3f47" }} />
        </div>
        <div style={{ flex: 1, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 12, color: "#9a9da4", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, whiteSpace: "nowrap" }}>
          <i data-lucide="terminal" style={{ width: 13, height: 13 }} /> zsh · dotmesh
        </div>
        <i data-lucide="plus" style={{ width: 15, height: 15, color: "#6a6d74" }} />
      </div>
      {/* body */}
      <div ref={bodyRef} style={{ flex: 1, overflowY: "auto", padding: "4px 18px 0" }}>
        {blocks.map((b, i) => <Block key={i} block={b} dirty={i === 0} />)}
        {/* active prompt */}
        <div style={{ padding: "10px 0", borderTop: "1px solid #1f2127" }}>
          <Prompt branch="main" lang="py 3.12" dirty={true} />
          <form onSubmit={submit} style={{ display: "flex", gap: 8, alignItems: "baseline", marginTop: 4 }}>
            <span style={{ color: "var(--syntax-sage)", fontFamily: "var(--font-mono)", fontSize: 13.5 }}>❯</span>
            <input
              autoFocus value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="try: git status · ls · make health"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#e9eaec", fontFamily: "var(--font-mono)", fontSize: 13.5, caretColor: "var(--syntax-teal)" }}
            />
          </form>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { GhosttyWindow });

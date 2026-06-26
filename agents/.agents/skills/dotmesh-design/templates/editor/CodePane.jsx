/* Tokenised file contents + the code pane for the editor kit.
   Hand-tokenised (no live highlighter) — enough to show the
   dotmesh syntax theme faithfully. */

// token helpers: keyword, fn, string, number, type, comment, prop, op, default
const K  = (t) => ({ t, c: "var(--syntax-lilac)" });
const F  = (t) => ({ t, c: "var(--syntax-blue)" });
const S  = (t) => ({ t, c: "var(--syntax-sage)" });
const N  = (t) => ({ t, c: "var(--syntax-peach)" });
const TY = (t) => ({ t, c: "var(--syntax-gold)" });
const C  = (t) => ({ t, c: "#6a6d74" });
const P  = (t) => ({ t, c: "var(--syntax-teal)" });
const O  = (t) => ({ t, c: "#9a9da4" });
const D  = (t) => ({ t, c: "#e9eaec" });

const FILES = {
  "colors.css": [
    [C("/* dotmesh — syntax accents */")],
    [O(":root"), D(" {")],
    [P("  --syntax-peach"), O(": "), N("#ffaa7a"), O(";"), C("  /* numbers */")],
    [P("  --syntax-lilac"), O(": "), N("#cbaacb"), O(";"), C("  /* keywords */")],
    [P("  --syntax-teal"), O(":  "), N("#6cb6b0"), O(";"), C("  /* special */")],
    [P("  --syntax-blue"), O(":  "), N("#8fb4e3"), O(";"), C("  /* functions */")],
    [P("  --syntax-sage"), O(":  "), N("#a8cba0"), O(";"), C("  /* strings */")],
    [D("}")],
    [],
    [O("."), TY("theme-dark"), D(" {")],
    [P("  --bg"), O(": "), F("var"), O("(--ink-0);")],
    [P("  --text-primary"), O(": "), N("#e9eaec"), O(";")],
    [D("}")],
  ],
  "weight.py": [
    [C("# weight survey responses by region")],
    [K("import"), D(" pandas "), K("as"), D(" pd")],
    [],
    [K("def"), F(" weight"), D("(df: "), TY("DataFrame"), D(", region="), S('"north"'), D(") "), O("->"), D(" "), TY("Series"), D(":")],
    [D("    w = "), N("1.0"), D(" / df."), F("groupby"), D("("), S('"region"'), D(")."), F("size"), D("()")],
    [D("    subset = df[df.region "), O("=="), D(" region]")],
    [K("    return"), D(" subset."), F("assign"), D("(w=w)")],
    [],
    [K("if"), D(" __name__ "), O("=="), D(" "), S('"__main__"'), D(":")],
    [D("    df = pd."), F("read_csv"), D("("), S('"survey.csv"'), D(")")],
    [F("    print"), D("("), F("weight"), D("(df, "), S('"south"'), D(")."), F("head"), D("("), N("5"), D("))")],
  ],
  "starship.toml": [
    [C("# prompt segments")],
    [O("["), TY("directory"), O("]")],
    [P("style"), D(" = "), S('"fg:ink bg:graphite"')],
    [P("format"), D(" = "), S('"[ $path ]($style)"')],
    [P("truncation_length"), D(" = "), N("3")],
    [],
    [O("["), TY("git_branch"), O("]")],
    [P("symbol"), D(" = "), S('""')],
    [P("style"), D(" = "), S('"bg:sage"')],
  ],
};

function CodePane({ file }) {
  const lines = FILES[file] || [];
  return (
    <div style={{ flex: 1, overflow: "auto", background: "var(--ink-0)", fontFamily: "var(--font-mono)", fontSize: 13.5, lineHeight: "22px", padding: "10px 0" }}>
      {lines.map((segs, i) => {
        const active = i === 3;
        return (
          <div key={i} style={{ display: "flex", background: active ? "rgba(255,255,255,.03)" : "transparent" }}>
            <span style={{ width: 44, textAlign: "right", paddingRight: 16, color: active ? "#9a9da4" : "#43464d", flex: "none", userSelect: "none" }}>{i + 1}</span>
            <span style={{ whiteSpace: "pre", paddingRight: 24 }}>
              {segs.length === 0 ? "\u00a0" : segs.map((s, j) => <span key={j} style={{ color: s.c }}>{s.t}</span>)}
              {active && <span style={{ display: "inline-block", width: 2, height: 16, background: "var(--syntax-teal)", verticalAlign: "-3px", marginLeft: 1 }} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { CodePane, EDITOR_FILES: FILES });

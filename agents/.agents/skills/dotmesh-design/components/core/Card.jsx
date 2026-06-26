import React from "react";

let _injected = false;
function ensureStyles() {
  if (_injected || typeof document === "undefined") return;
  _injected = true;
  const el = document.createElement("style");
  el.textContent = `
  .dm-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);
    transition:border-color .15s ease,box-shadow .15s ease,transform .1s ease;}
  .dm-card--interactive{cursor:pointer;}
  .dm-card--interactive:hover{border-color:var(--border-strong);box-shadow:var(--shadow-md);}
  `;
  document.head.appendChild(el);
}

const PAD = { sm: "var(--space-4)", md: "var(--space-6)", lg: "var(--space-8)" };
const ELEV = { none: "none", sm: "var(--shadow-sm)", md: "var(--shadow-md)", lg: "var(--shadow-lg)" };

/**
 * Surface container — a sheet of paper (or ink). Hairline border
 * first, shadow only when lifted. Use `interactive` for clickable
 * cards.
 */
export function Card({
  padding = "md",
  elevation = "none",
  interactive = false,
  children,
  style = {},
  ...rest
}) {
  ensureStyles();
  return (
    <div
      className={`dm-card${interactive ? " dm-card--interactive" : ""}`}
      style={{ padding: PAD[padding] || PAD.md, boxShadow: ELEV[elevation] || "none", ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

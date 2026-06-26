import React from "react";

let _injected = false;
function ensureStyles() {
  if (_injected || typeof document === "undefined") return;
  _injected = true;
  const el = document.createElement("style");
  el.textContent = `
  .dm-btn{font-family:var(--font-sans);font-weight:var(--w-medium);display:inline-flex;align-items:center;justify-content:center;
    border:1px solid transparent;cursor:pointer;white-space:nowrap;text-decoration:none;line-height:1;
    transition:background .14s ease,border-color .14s ease,color .14s ease,transform .06s ease;}
  .dm-btn:focus-visible{outline:var(--ring-width) solid var(--focus-ring);outline-offset:var(--ring-offset);}
  .dm-btn:active{transform:translateY(0.5px);}
  .dm-btn[disabled]{opacity:.45;pointer-events:none;}
  .dm-btn--primary{background:var(--accent);color:var(--accent-contrast);}
  .dm-btn--primary:hover{background:var(--accent-hover);}
  .dm-btn--secondary{background:var(--surface);color:var(--text-primary);border-color:var(--border-strong);}
  .dm-btn--secondary:hover{background:var(--bg-sunken);border-color:var(--gray-400);}
  .dm-btn--ghost{background:transparent;color:var(--text-secondary);}
  .dm-btn--ghost:hover{background:var(--bg-sunken);color:var(--text-primary);}
  .dm-btn--danger{background:transparent;color:var(--danger);border-color:color-mix(in oklab,var(--danger) 38%,transparent);}
  .dm-btn--danger:hover{background:color-mix(in oklab,var(--danger) 10%,transparent);}
  `;
  document.head.appendChild(el);
}

const SIZES = {
  sm: { fontSize: "13px", padding: "0 12px", height: "30px", gap: "6px", radius: "var(--radius-sm)" },
  md: { fontSize: "14px", padding: "0 16px", height: "38px", gap: "8px", radius: "var(--radius-md)" },
  lg: { fontSize: "15px", padding: "0 22px", height: "46px", gap: "8px", radius: "var(--radius-md)" },
};

/**
 * Primary action control. Monochrome by default — ink on paper,
 * paper on ink. Colour enters only via the `danger` variant.
 */
export function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  fullWidth = false,
  leadingIcon = null,
  trailingIcon = null,
  children,
  style = {},
  ...rest
}) {
  ensureStyles();
  const s = SIZES[size] || SIZES.md;
  return (
    <button
      className={`dm-btn dm-btn--${variant}`}
      disabled={disabled}
      style={{
        fontSize: s.fontSize,
        padding: s.padding,
        height: s.height,
        gap: s.gap,
        borderRadius: s.radius,
        width: fullWidth ? "100%" : undefined,
        ...style,
      }}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}

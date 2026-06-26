import React from "react";

const TONES = {
  neutral: "var(--text-secondary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger:  "var(--danger)",
  info:    "var(--info)",
  peach:   "var(--syntax-peach)",
  lilac:   "var(--syntax-lilac)",
  teal:    "var(--syntax-teal)",
  blue:    "var(--syntax-blue)",
  sage:    "var(--syntax-sage)",
  gold:    "var(--syntax-gold)",
  rose:    "var(--syntax-rose)",
};

/**
 * Compact status / metadata label. Soft, solid or outline.
 * Defaults to monochrome neutral; tones pull from the syntax
 * and signal families.
 */
export function Badge({
  tone = "neutral",
  variant = "soft",
  dot = false,
  children,
  style = {},
  ...rest
}) {
  const c = TONES[tone] || TONES.neutral;
  const base = {
    fontFamily: "var(--font-mono)",
    fontSize: "11px",
    fontWeight: 500,
    letterSpacing: "0.02em",
    lineHeight: 1,
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 9px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid transparent",
    whiteSpace: "nowrap",
  };
  const variants = {
    soft: { background: `color-mix(in oklab, ${c} 16%, transparent)`, color: `color-mix(in oklab, ${c} 58%, var(--text-primary))` },
    solid: { background: c, color: "var(--ink-0)" },
    outline: { background: "transparent", color: `color-mix(in oklab, ${c} 70%, var(--text-primary))`, borderColor: `color-mix(in oklab, ${c} 42%, transparent)` },
  };
  return (
    <span style={{ ...base, ...(variants[variant] || variants.soft), ...style }} {...rest}>
      {dot && (
        <span style={{ width: 6, height: 6, borderRadius: "999px", background: variant === "solid" ? "var(--ink-0)" : c, flex: "none" }} />
      )}
      {children}
    </span>
  );
}

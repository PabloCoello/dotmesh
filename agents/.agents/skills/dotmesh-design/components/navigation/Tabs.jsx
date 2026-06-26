import React from "react";

/**
 * Underline tab bar. Monochrome — the active tab is marked by an
 * ink underline and darker label, nothing more.
 */
export function Tabs({ items = [], value, onChange, style = {}, ...rest }) {
  return (
    <div
      role="tablist"
      style={{ display: "flex", gap: "var(--space-5)", borderBottom: "1px solid var(--border)", ...style }}
      {...rest}
    >
      {items.map((it) => {
        const key = typeof it === "string" ? it : it.value;
        const label = typeof it === "string" ? it : it.label;
        const count = typeof it === "object" ? it.count : undefined;
        const active = key === value;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange && onChange(key)}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "13.5px",
              fontWeight: active ? 600 : 500,
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 0 12px",
              marginBottom: "-1px",
              borderBottom: "2px solid " + (active ? "var(--accent)" : "transparent"),
              display: "inline-flex",
              alignItems: "center",
              gap: "7px",
              whiteSpace: "nowrap",
              transition: "color .14s ease, border-color .14s ease",
            }}
          >
            {label}
            {count != null && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", color: "var(--text-muted)" }}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

import React from "react";

/**
 * Keyboard key cap. Renders shortcut keys in mono with a subtle
 * raised border. Combine several for chords.
 */
export function Kbd({ children, style = {}, ...rest }) {
  return (
    <kbd
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "11.5px",
        fontWeight: 500,
        lineHeight: 1,
        color: "var(--text-secondary)",
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        borderBottomWidth: "2px",
        borderRadius: "var(--radius-sm)",
        padding: "3px 6px",
        minWidth: "10px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
      {...rest}
    >
      {children}
    </kbd>
  );
}

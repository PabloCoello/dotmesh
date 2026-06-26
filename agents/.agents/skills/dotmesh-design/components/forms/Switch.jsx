import React from "react";

/**
 * On/off switch. Monochrome track — fills with ink (or paper on
 * dark) when on. Label optional, sits to the right.
 */
export function Switch({
  checked = false,
  onChange,
  disabled = false,
  label,
  style = {},
  ...rest
}) {
  const track = {
    width: 38,
    height: 22,
    borderRadius: "999px",
    background: checked ? "var(--accent)" : "var(--gray-300)",
    border: "1px solid " + (checked ? "var(--accent)" : "var(--border-strong)"),
    position: "relative",
    transition: "background .16s ease, border-color .16s ease",
    flex: "none",
    padding: 0,
    cursor: disabled ? "not-allowed" : "pointer",
  };
  const knob = {
    position: "absolute",
    top: "50%",
    left: checked ? "calc(100% - 19px)" : "3px",
    transform: "translateY(-50%)",
    width: 16,
    height: 16,
    borderRadius: "999px",
    background: checked ? "var(--accent-contrast)" : "var(--surface)",
    boxShadow: "var(--shadow-sm)",
    transition: "left .16s cubic-bezier(.3,.7,.4,1)",
  };
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer", ...style }}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange && onChange(!checked)}
        style={track}
        {...rest}
      >
        <span style={knob} />
      </button>
      {label && <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--text-primary)", whiteSpace: "nowrap" }}>{label}</span>}
    </label>
  );
}

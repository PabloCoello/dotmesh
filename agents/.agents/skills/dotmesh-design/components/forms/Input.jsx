import React from "react";

let _injected = false;
function ensureStyles() {
  if (_injected || typeof document === "undefined") return;
  _injected = true;
  const el = document.createElement("style");
  el.textContent = `
  .dm-field{display:flex;flex-direction:column;gap:6px;}
  .dm-field__label{font-family:var(--font-sans);font-size:12.5px;font-weight:var(--w-medium);color:var(--text-secondary);}
  .dm-input-wrap{display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border-strong);
    border-radius:var(--radius-md);padding:0 12px;transition:border-color .14s ease,box-shadow .14s ease;}
  .dm-input-wrap:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--focus-ring);}
  .dm-input-wrap--invalid{border-color:var(--danger);}
  .dm-input{flex:1;border:none;outline:none;background:transparent;font-family:var(--font-sans);font-size:14px;
    color:var(--text-primary);height:36px;min-width:0;}
  .dm-input::placeholder{color:var(--text-muted);}
  .dm-input-affix{font-family:var(--font-mono);font-size:12.5px;color:var(--text-muted);flex:none;}
  .dm-field__hint{font-size:11.5px;color:var(--text-muted);}
  .dm-field__hint--invalid{color:var(--danger);}
  `;
  document.head.appendChild(el);
}

/**
 * Text input with optional label, affixes and validation hint.
 */
export function Input({
  label,
  prefix = null,
  suffix = null,
  hint,
  invalid = false,
  style = {},
  ...rest
}) {
  ensureStyles();
  return (
    <label className="dm-field" style={style}>
      {label && <span className="dm-field__label">{label}</span>}
      <span className={`dm-input-wrap${invalid ? " dm-input-wrap--invalid" : ""}`}>
        {prefix && <span className="dm-input-affix">{prefix}</span>}
        <input className="dm-input" {...rest} />
        {suffix && <span className="dm-input-affix">{suffix}</span>}
      </span>
      {hint && <span className={`dm-field__hint${invalid ? " dm-field__hint--invalid" : ""}`}>{hint}</span>}
    </label>
  );
}

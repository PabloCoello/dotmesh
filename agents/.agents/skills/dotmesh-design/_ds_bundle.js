/* @ds-bundle: {"format":3,"namespace":"DotmeshDesignSystem_512187","components":[{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Kbd","sourcePath":"components/core/Kbd.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/core/Badge.jsx":"2145aaa4d2ce","components/core/Button.jsx":"eeefce7e76f0","components/core/Card.jsx":"4d5477eaec5d","components/core/Kbd.jsx":"6360d8e590f1","components/forms/Input.jsx":"b69bea8fc0b3","components/forms/Switch.jsx":"807517226faf","components/navigation/Tabs.jsx":"1cbea98b0b0c"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.DotmeshDesignSystem_512187 = window.DotmeshDesignSystem_512187 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const TONES = {
  neutral: "var(--text-secondary)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  peach: "var(--syntax-peach)",
  lilac: "var(--syntax-lilac)",
  teal: "var(--syntax-teal)",
  blue: "var(--syntax-blue)",
  sage: "var(--syntax-sage)",
  gold: "var(--syntax-gold)",
  rose: "var(--syntax-rose)"
};

/**
 * Compact status / metadata label. Soft, solid or outline.
 * Defaults to monochrome neutral; tones pull from the syntax
 * and signal families.
 */
function Badge({
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
    whiteSpace: "nowrap"
  };
  const variants = {
    soft: {
      background: `color-mix(in oklab, ${c} 16%, transparent)`,
      color: `color-mix(in oklab, ${c} 58%, var(--text-primary))`
    },
    solid: {
      background: c,
      color: "var(--ink-0)"
    },
    outline: {
      background: "transparent",
      color: `color-mix(in oklab, ${c} 70%, var(--text-primary))`,
      borderColor: `color-mix(in oklab, ${c} 42%, transparent)`
    }
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      ...base,
      ...(variants[variant] || variants.soft),
      ...style
    }
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: "999px",
      background: variant === "solid" ? "var(--ink-0)" : c,
      flex: "none"
    }
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
  sm: {
    fontSize: "13px",
    padding: "0 12px",
    height: "30px",
    gap: "6px",
    radius: "var(--radius-sm)"
  },
  md: {
    fontSize: "14px",
    padding: "0 16px",
    height: "38px",
    gap: "8px",
    radius: "var(--radius-md)"
  },
  lg: {
    fontSize: "15px",
    padding: "0 22px",
    height: "46px",
    gap: "8px",
    radius: "var(--radius-md)"
  }
};

/**
 * Primary action control. Monochrome by default — ink on paper,
 * paper on ink. Colour enters only via the `danger` variant.
 */
function Button({
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
  return /*#__PURE__*/React.createElement("button", _extends({
    className: `dm-btn dm-btn--${variant}`,
    disabled: disabled,
    style: {
      fontSize: s.fontSize,
      padding: s.padding,
      height: s.height,
      gap: s.gap,
      borderRadius: s.radius,
      width: fullWidth ? "100%" : undefined,
      ...style
    }
  }, rest), leadingIcon, children, trailingIcon);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
const PAD = {
  sm: "var(--space-4)",
  md: "var(--space-6)",
  lg: "var(--space-8)"
};
const ELEV = {
  none: "none",
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)"
};

/**
 * Surface container — a sheet of paper (or ink). Hairline border
 * first, shadow only when lifted. Use `interactive` for clickable
 * cards.
 */
function Card({
  padding = "md",
  elevation = "none",
  interactive = false,
  children,
  style = {},
  ...rest
}) {
  ensureStyles();
  return /*#__PURE__*/React.createElement("div", _extends({
    className: `dm-card${interactive ? " dm-card--interactive" : ""}`,
    style: {
      padding: PAD[padding] || PAD.md,
      boxShadow: ELEV[elevation] || "none",
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Kbd.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Keyboard key cap. Renders shortcut keys in mono with a subtle
 * raised border. Combine several for chords.
 */
function Kbd({
  children,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("kbd", _extends({
    style: {
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
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Kbd });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Kbd.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
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
function Input({
  label,
  prefix = null,
  suffix = null,
  hint,
  invalid = false,
  style = {},
  ...rest
}) {
  ensureStyles();
  return /*#__PURE__*/React.createElement("label", {
    className: "dm-field",
    style: style
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "dm-field__label"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: `dm-input-wrap${invalid ? " dm-input-wrap--invalid" : ""}`
  }, prefix && /*#__PURE__*/React.createElement("span", {
    className: "dm-input-affix"
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    className: "dm-input"
  }, rest)), suffix && /*#__PURE__*/React.createElement("span", {
    className: "dm-input-affix"
  }, suffix)), hint && /*#__PURE__*/React.createElement("span", {
    className: `dm-field__hint${invalid ? " dm-field__hint--invalid" : ""}`
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * On/off switch. Monochrome track — fills with ink (or paper on
 * dark) when on. Label optional, sits to the right.
 */
function Switch({
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
    cursor: disabled ? "not-allowed" : "pointer"
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
    transition: "left .16s cubic-bezier(.3,.7,.4,1)"
  };
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    role: "switch",
    "aria-checked": checked,
    disabled: disabled,
    onClick: () => !disabled && onChange && onChange(!checked),
    style: track
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: knob
  })), label && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: "var(--font-sans)",
      fontSize: 14,
      color: "var(--text-primary)",
      whiteSpace: "nowrap"
    }
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Underline tab bar. Monochrome — the active tab is marked by an
 * ink underline and darker label, nothing more.
 */
function Tabs({
  items = [],
  value,
  onChange,
  style = {},
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", _extends({
    role: "tablist",
    style: {
      display: "flex",
      gap: "var(--space-5)",
      borderBottom: "1px solid var(--border)",
      ...style
    }
  }, rest), items.map(it => {
    const key = typeof it === "string" ? it : it.value;
    const label = typeof it === "string" ? it : it.label;
    const count = typeof it === "object" ? it.count : undefined;
    const active = key === value;
    return /*#__PURE__*/React.createElement("button", {
      key: key,
      role: "tab",
      "aria-selected": active,
      onClick: () => onChange && onChange(key),
      style: {
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
        transition: "color .14s ease, border-color .14s ease"
      }
    }, label, count != null && /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: "var(--font-mono)",
        fontSize: "10.5px",
        color: "var(--text-muted)"
      }
    }, count));
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Kbd = __ds_scope.Kbd;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Tabs = __ds_scope.Tabs;

})();

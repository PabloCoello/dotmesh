// Client bundle entry point for the dotmesh-ui plugin.
// Runs inside the browser via window.__ModuleLoader__.load; all dsh and React
// modules come from the runtime module loader (not bundled here).
import React from 'react';

// Cordis services this plugin requires before apply() is called.
// "theme" provides ctx.theme.overrideTokens; "slots" provides ctx.slots.register.
export const inject: string[] = ['slots', 'theme'];

// ── Palette from docs/DESIGN.md ──────────────────────────────────────────────

const INK = {
  0: '#121212', // lienzo base (fondo de editor y terminal)
  1: '#181818', // panel elevado (sidebar, barra de título)
  2: '#202020', // overlay / hover
  3: '#2a2a2a', // línea sobre oscuro
};

const GRAPHITE = {
  textPrimary:   '#cecece',
  textSecondary: '#9e9e9e',
  textDim:       '#6e6e6e',
};

// Paper (light mode) — blanco y casi blanco
const PAPER = {
  base:    '#ffffff',
  layer1:  '#f6f6f6',
  layer2:  '#ececec',
  overlay: '#dcdcdc',
  textPrimary:   '#121212',
  textSecondary: '#424242',
};

// Syntax accents (Ink / dark values; light variants deepened for contrast)
const SYNTAX = {
  peach: { dark: '#FFAA7A', light: '#b85a00' }, // números, constantes
  lilac: { dark: '#CBAACB', light: '#7a3a7a' }, // palabras clave
  teal:  { dark: '#6CB6B0', light: '#2e7d79' }, // especial, regex, escape; brand
  blue:  { dark: '#8FB4E3', light: '#2563b0' }, // funciones, métodos
  sage:  { dark: '#A8CBA0', light: '#3d7a38' }, // cadenas; adiciones
  gold:  { dark: '#E3C58A', light: '#9a7518' }, // tipos, clases
  rose:  { dark: '#E59A9A', light: '#c44c4c' }, // errores, etiquetas
};

// ── Theme token overrides ─────────────────────────────────────────────────────

function applyTheme(ctx: any): void {
  // Map dotmesh palette onto dsh's alias/specific tokens and Shiki syntax tokens.
  // Token names come from BUILTIN_INSPECT_TOKENS and the shiki_css in
  // dsh-client-ui-theme/lib/client.js. validateOverrides() rejects bare strings;
  // every entry must be { light, dark }.
  ctx.theme.overrideTokens('dotmesh', {
    // background surfaces
    '--dsw-alias-bg-base':    { dark: INK[0], light: PAPER.base },
    '--dsw-alias-bg-layer-1': { dark: INK[1], light: PAPER.layer1 },
    '--dsw-alias-bg-layer-2': { dark: INK[2], light: PAPER.layer2 },
    '--dsw-alias-bg-overlay': { dark: INK[3], light: PAPER.overlay },

    // borders (semi-transparent)
    '--dsw-alias-border-l1': { dark: 'rgba(255,255,255,0.06)', light: 'rgba(0,0,0,0.04)' },
    '--dsw-alias-border-l2': { dark: 'rgba(255,255,255,0.12)', light: 'rgba(0,0,0,0.10)' },

    // brand accent — teal canónico
    '--dsw-alias-brand-primary': { dark: SYNTAX.teal.dark, light: SYNTAX.teal.light },

    // labels
    '--dsw-alias-label-primary':   { dark: GRAPHITE.textPrimary,   light: PAPER.textPrimary },
    '--dsw-alias-label-secondary': { dark: GRAPHITE.textSecondary, light: PAPER.textSecondary },

    // semantic state
    '--dsw-alias-state-error-primary':   { dark: SYNTAX.rose.dark, light: SYNTAX.rose.light },
    '--dsw-alias-state-success-primary': { dark: SYNTAX.sage.dark, light: SYNTAX.sage.light },
    '--dsw-alias-state-warn-primary':    { dark: SYNTAX.gold.dark, light: SYNTAX.gold.light },

    // sidebar
    '--dsw-specific-sidebar-fill': { dark: INK[1], light: PAPER.layer1 },

    // Shiki syntax tokens — from the canonical syntax map in docs/DESIGN.md
    '--shiki-foreground':          { dark: GRAPHITE.textPrimary,   light: PAPER.textPrimary },
    '--shiki-background':          { dark: INK[0],                 light: PAPER.base },
    '--shiki-token-constant':      { dark: SYNTAX.peach.dark, light: SYNTAX.peach.light },
    '--shiki-token-string':        { dark: SYNTAX.sage.dark,  light: SYNTAX.sage.light },
    '--shiki-token-comment':       { dark: GRAPHITE.textDim,  light: '#767676' },
    '--shiki-token-keyword':       { dark: SYNTAX.lilac.dark, light: SYNTAX.lilac.light },
    '--shiki-token-parameter':     { dark: SYNTAX.peach.dark, light: SYNTAX.peach.light },
    '--shiki-token-function':      { dark: SYNTAX.blue.dark,  light: SYNTAX.blue.light },
    '--shiki-token-string-expression': { dark: SYNTAX.sage.dark, light: SYNTAX.sage.light },
    '--shiki-token-punctuation':   { dark: GRAPHITE.textSecondary, light: PAPER.textSecondary },
    '--shiki-token-link':          { dark: SYNTAX.teal.dark,  light: SYNTAX.teal.light },
  });
}

// ── Brand marks ──────────────────────────────────────────────────────────────

// Mesh icon: 4 nodes (2×2 grid) connected by lines + diagonal cross.
// Uses currentColor so it inherits the sidebar text color.
function DotmeshMark({ size = 24, className }: { size?: number; className?: string }) {
  return React.createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      className,
      fill: 'none',
      stroke: 'currentColor',
      'aria-label': 'dotmesh',
    },
    // grid lines
    React.createElement('line', { key: 't', x1: 6, y1: 6, x2: 18, y2: 6,  strokeWidth: 1.5 }),
    React.createElement('line', { key: 'l', x1: 6, y1: 6, x2: 6,  y2: 18, strokeWidth: 1.5 }),
    React.createElement('line', { key: 'r', x1: 18, y1: 6, x2: 18, y2: 18, strokeWidth: 1.5 }),
    React.createElement('line', { key: 'b', x1: 6, y1: 18, x2: 18, y2: 18, strokeWidth: 1.5 }),
    // diagonal cross (lighter)
    React.createElement('line', { key: 'd1', x1: 6, y1: 6,  x2: 18, y2: 18, strokeWidth: 1, opacity: 0.45 }),
    React.createElement('line', { key: 'd2', x1: 18, y1: 6, x2: 6,  y2: 18, strokeWidth: 1, opacity: 0.45 }),
    // corner nodes (filled circles)
    React.createElement('circle', { key: 'tl', cx: 6,  cy: 6,  r: 2.5, fill: 'currentColor', stroke: 'none' }),
    React.createElement('circle', { key: 'tr', cx: 18, cy: 6,  r: 2.5, fill: 'currentColor', stroke: 'none' }),
    React.createElement('circle', { key: 'bl', cx: 6,  cy: 18, r: 2.5, fill: 'currentColor', stroke: 'none' }),
    React.createElement('circle', { key: 'br', cx: 18, cy: 18, r: 2.5, fill: 'currentColor', stroke: 'none' }),
  );
}

// Text wordmark with JetBrains Mono, used in the sidebar name slot.
function DotmeshName() {
  return React.createElement(
    'span',
    {
      style: {
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontWeight: 700,
        letterSpacing: '0.05em',
        fontSize: '13px',
      },
    },
    'dotmesh',
  );
}

// ── Brand slot registration ───────────────────────────────────────────────────

function applyBrand(ctx: any): void {
  // Mirrors the pattern from dsh-client-ui-brand-official/lib/client.js:
  // nest ctx.slots.inject() calls so each slot is declared before registering.
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', function* () {
        yield ctx.slots.register({ name: 'sidebar.brand.mark' },       DotmeshMark);
        yield ctx.slots.register({ name: 'sidebar.brand.name' },       DotmeshName);
        yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, DotmeshMark);
      }),
    ),
  );
}

// ── Plugin entry point ────────────────────────────────────────────────────────

export function apply(ctx: any): void {
  applyTheme(ctx);
  applyBrand(ctx);
}

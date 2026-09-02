--- lua/dotmesh/palette.lua — Paleta de colores dotmesh para Neovim.
---
--- Exporta los tokens de docs/DESIGN.md como tabla Lua reutilizable.
--- Los valores son fuente de verdad para el colorscheme y para el tema
--- de lualine; no se definen en ningún otro sitio del paquete Neovim.
---
--- Referencia canónica:
---   docs/DESIGN.md § Paleta · § Mapa de sintaxis
---   vscode/themes/dotmesh-color-theme.json (cromo: line_nr, selection…)
---   ghostty/.config/ghostty/themes/dotmesh (ANSI 0-15)
---
--- Uso:
---   local p = require("dotmesh.palette")
---   p.ink._0          → "#121212"
---   p.syntax.teal     → "#6CB6B0"
---   { theme = p.lualine }

local M = {}

-- ---------------------------------------------------------------------------
-- Ink — fondo oscuro: lienzo base del editor y terminal
-- Fuente: docs/DESIGN.md § Ink (superficies oscuras)
-- Los cuatro escalones forman la jerarquía de elevación; el cromo se separa
-- por tono, nunca por línea dura.
-- ---------------------------------------------------------------------------
M.ink = {
  _0 = "#121212",  -- lienzo base (editor, terminal)
  _1 = "#181818",  -- panel elevado (sidebar, barra de título)
  _2 = "#202020",  -- overlay / hover
  _3 = "#2a2a2a",  -- línea sobre oscuro; fondo de sección b en lualine
}

-- ---------------------------------------------------------------------------
-- Graphite — rampa de grises neutros para el cromo monocromo
-- Fuente: docs/DESIGN.md § Graphite (rampa neutra)
-- Los nombres son los dos últimos dígitos hex del valor.
-- ---------------------------------------------------------------------------
M.graph = {
  _18 = "#181818",
  _21 = "#212121",
  _2e = "#2e2e2e",
  _42 = "#424242",
  _5c = "#5c5c5c",
  _76 = "#767676",
  _9e = "#9e9e9e",
  _c6 = "#c6c6c6",
  _de = "#dedede",
  _ec = "#ececec",
  _f6 = "#f6f6f6",
}

-- ---------------------------------------------------------------------------
-- Texto — tres escalones de gris sobre Ink
-- Fuente: docs/DESIGN.md § Graphite: "Texto sobre Ink"
-- primary (~11:1 sobre ink-0): legible sin que el blanco canse la vista.
-- secondary: operadores, puntuación, metadatos secundarios.
-- dim: comentarios, elementos atenuados, texto inactivo.
-- ---------------------------------------------------------------------------
M.text = {
  primary   = "#cecece",
  secondary = "#9e9e9e",
  dim       = "#6e6e6e",
}

-- ---------------------------------------------------------------------------
-- Syntax — los siete acentos muteados
-- Fuente: docs/DESIGN.md § Syntax (los siete acentos) y § Mapa de sintaxis
-- Los mismos valores en vscode/themes/dotmesh-color-theme.json (tokenColors)
-- y en ghostty/.config/ghostty/themes/dotmesh (ANSI 1-7).
-- ---------------------------------------------------------------------------
M.syntax = {
  peach = "#FFAA7A",  -- números, constantes, booleanos
  lilac = "#CBAACB",  -- palabras clave, control, decoradores
  teal  = "#6CB6B0",  -- especial, self, regex, escape; cursor
  blue  = "#8FB4E3",  -- funciones, métodos
  sage  = "#A8CBA0",  -- cadenas; adiciones Git; prompt correcto
  gold  = "#E3C58A",  -- tipos, clases, atributos
  rose  = "#E59A9A",  -- errores, etiquetas HTML/XML; eliminaciones Git
}

-- ---------------------------------------------------------------------------
-- Chrome — tokens de cromo tomados del tema VS Code
-- Fuente: vscode/themes/dotmesh-color-theme.json
-- line_nr: valor propio del tema VS Code (#474747), fuera de la rampa
-- powerline pero documentado en docs/DESIGN.md § Chrome.
-- selection: coincide con Ghostty selection-background (#2e2e2e = graph._2e).
-- cursor: teal canónico; coincide con Ghostty cursor-color.
-- ---------------------------------------------------------------------------
M.chrome = {
  line_nr        = "#474747",
  line_nr_active = "#9e9e9e",
  selection      = "#2e2e2e",
  border         = "#2a2a2a",
  cursor         = "#6CB6B0",
}

-- ---------------------------------------------------------------------------
-- Terminal ANSI — coinciden exactamente con ghostty/.config/ghostty/themes/dotmesh
-- Fuente: ghostty/.config/ghostty/themes/dotmesh (palette 0-15)
-- Al asignar vim.g.terminal_color_N con estos valores, :terminal dentro de
-- Neovim muestra la misma paleta que el terminal Ghostty exterior.
-- Normales (0-7): negro grafito · rose/sage/gold/blue/lilac/teal · blanco grafito
-- Brillantes (8-15): mismos roles, un escalón más claro.
-- ---------------------------------------------------------------------------
M.terminal = {
  [0]  = "#2a2a2a",  -- negro grafito (ink._3)
  [1]  = "#E59A9A",  -- rojo  → rose
  [2]  = "#A8CBA0",  -- verde → sage
  [3]  = "#E3C58A",  -- amarillo → gold
  [4]  = "#8FB4E3",  -- azul → blue
  [5]  = "#CBAACB",  -- magenta → lilac
  [6]  = "#6CB6B0",  -- cian → teal
  [7]  = "#c6c6c6",  -- blanco grafito
  [8]  = "#5c5c5c",
  [9]  = "#EAA9A9",
  [10] = "#B9D6B2",
  [11] = "#ECD2A3",
  [12] = "#A8C6EA",
  [13] = "#D8BFD8",
  [14] = "#84C4BF",
  [15] = "#F0F1F3",
}

-- ---------------------------------------------------------------------------
-- Lualine — tema de barra de estado
-- Fuente: plan C8 § "El tema lualine en palette.lua"
--
-- Filosofía: cromo monocromo en secciones b y c; solo la sección «a» lleva
-- el acento del modo, igual que los segmentos de Starship. La sección
-- inactiva usa el escalón dim para no competir con la ventana activa.
--
-- Sección a (modo): fg=ink-0 sobre acento-modo, negrita.
-- Sección b (rama/diff/diagnósticos): fg=primario sobre ink-3.
-- Sección c (nombre de fichero/ruta): fg=secundario sobre ink-0.
-- Inactivo: todo en dim sobre ink-0/ink-1.
-- ---------------------------------------------------------------------------
local ink0 = M.ink._0
local ink1 = M.ink._1
local ink3 = M.ink._3
local pri  = M.text.primary
local sec  = M.text.secondary
local dim  = M.text.dim
local syn  = M.syntax

local function mode_theme(accent)
  return {
    a = { fg = ink0, bg = accent, gui = "bold" },
    b = { fg = pri,  bg = ink3 },
    c = { fg = sec,  bg = ink0 },
  }
end

M.lualine = {
  normal   = mode_theme(syn.teal),   -- teal: acento principal del tema
  insert   = mode_theme(syn.sage),   -- sage: adición/positivo
  visual   = mode_theme(syn.gold),   -- gold: selección/tipos
  replace  = mode_theme(syn.rose),   -- rose: peligro/eliminación
  command  = mode_theme(syn.lilac),  -- lilac: control/palabras clave
  inactive = {
    a = { fg = dim, bg = ink0 },
    b = { fg = dim, bg = ink1 },
    c = { fg = dim, bg = ink0 },
  },
}

return M

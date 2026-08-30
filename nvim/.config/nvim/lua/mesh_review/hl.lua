--- lua/mesh_review/hl.lua — Grupos de highlight del plugin en runtime.
---
--- M.setup() define (o redefine) los 8 grupos de highlight del plugin
--- adaptados al fondo real del colorscheme activo. El fondo de Normal se
--- lee en runtime para que el tintado funcione con cualquier tema, no solo
--- con dotmesh.
---
--- El autocmd ColorScheme que relanza setup() se registra en init.lua (no aquí)
--- para que este módulo sea autocontenido y no tenga efectos secundarios al
--- cargarse. Basta con dejarlo listo, idempotente y documentado.
---
--- Grupos definidos:
---   MeshReviewEdita      — bg = blend(#E59A9A, Normal.bg, 0.18)
---   MeshReviewSugerencia — bg = blend(#E3C58A, Normal.bg, 0.18)
---   MeshReviewPregunta   — bg = blend(#8FB4E3, Normal.bg, 0.18)
---   MeshReviewVerifica   — bg = blend(#FFAA7A, Normal.bg, 0.18)
---   MeshReviewNota       — bg = blend(#6CB6B0, Normal.bg, 0.18)
---   MeshReviewReferencia — bg = blend(#A8CBA0, Normal.bg, 0.18)
---   MeshReviewSupuesto   — bg = blend(#CBAACB, Normal.bg, 0.18)
---   MeshReviewDetached   — fg = #6e6e6e, sin bg (hilos desanclados o tipo desconocido)

local M = {}

local types = require("mesh_review.types")
local blend = require("dotmesh.blend")

--- Alpha de mezcla para el fondo tintado. Replica DECORATION_BG_ALPHA de
--- la extensión VS Code (decorations-utils.ts) para paridad visual entre el
--- editor y el navegador/VS Code.
local ALPHA = 0.18

--- Fondo de Normal de respaldo cuando el tema no define bg (temas transparentes
--- o minimalistas). Equivale a ink._0 de la paleta dotmesh.
local FALLBACK_BG = "#121212"

--- Primer plano del grupo Detached: text.dim de la paleta dotmesh (#6e6e6e).
--- Se usa para hilos cuya ancla se ha perdido o cuyo tipo no está reconocido.
local DETACHED_FG = "#6e6e6e"

--- Convierte el entero devuelto por nvim_get_hl (.bg / .fg) a "#RRGGBB".
--- Neovim codifica los colores terminales como enteros de 24 bits (0xRRGGBB).
--- @param n integer
--- @return string
local function int_to_hex(n)
  return string.format("#%06X", n)
end

--- Define (o redefine) los grupos de highlight del plugin.
---
--- Lee el fondo real de Normal con link=false para resolver la cadena de
--- enlaces y obtener el valor RGB, no el grupo al que apunta. Si Normal.bg
--- no está definido (0 o nil), usa #121212 como respaldo.
---
--- Es idempotente: nvim_set_hl sobreescribe el grupo si ya existe, sin
--- duplicados ni errores. El orquestador llama a setup() de nuevo en
--- ColorScheme para adaptar los grupos al nuevo tema.
function M.setup()
  -- Obtener fondo real de Normal. link=false resuelve la cadena de :hi link
  -- hasta el grupo con valor concreto; sin él, .bg puede ser nil aunque el
  -- grupo esté enlazado a uno con bg definido.
  local normal_hl = vim.api.nvim_get_hl(0, { name = "Normal", link = false })
  local bg_hex
  if normal_hl.bg and normal_hl.bg ~= 0 then
    bg_hex = int_to_hex(normal_hl.bg)
  else
    -- Tema transparente o headless sin colorscheme cargado.
    bg_hex = FALLBACK_BG
  end

  -- Un grupo por tipo: fondo tintado al 18 %, sin fg explícito (el texto
  -- hereda el color del colorscheme activo sobre el rango tintado).
  for _, t in ipairs(types.list) do
    local bg_blended = blend.blend_hex(t.color, bg_hex, ALPHA)
    vim.api.nvim_set_hl(0, t.hl, { bg = bg_blended })
  end

  -- Grupo para anclas perdidas o tipos desconocidos: gris tenue sin fondo.
  -- No tintamos porque no sabemos dónde está el fragmento; el fg dim
  -- distingue estas marcas de las normales sin ocupar fondo.
  vim.api.nvim_set_hl(0, "MeshReviewDetached", { fg = DETACHED_FG })
end

return M

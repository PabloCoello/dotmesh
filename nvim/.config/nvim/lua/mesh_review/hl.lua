--- lua/mesh_review/hl.lua — Grupos de highlight del plugin en runtime.
---
--- M.setup() define (o redefine) los 15 grupos de highlight del plugin
--- adaptados al fondo real del colorscheme activo. El fondo de Normal se
--- lee en runtime para que el tintado funcione con cualquier tema, no solo
--- con dotmesh.
---
--- El autocmd ColorScheme que relanza setup() se registra en init.lua (no aquí)
--- para que este módulo sea autocontenido y no tenga efectos secundarios al
--- cargarse. Basta con dejarlo listo, idempotente y documentado.
---
--- Grupos de rango (uno por tipo) — solo `bg`, sin `fg`:
---   MeshReviewEdita      — bg = blend(#E59A9A, Normal.bg, 0.18)
---   MeshReviewSugerencia — bg = blend(#E3C58A, Normal.bg, 0.18)
---   MeshReviewPregunta   — bg = blend(#8FB4E3, Normal.bg, 0.18)
---   MeshReviewVerifica   — bg = blend(#FFAA7A, Normal.bg, 0.18)
---   MeshReviewNota       — bg = blend(#6CB6B0, Normal.bg, 0.18)
---   MeshReviewReferencia — bg = blend(#A8CBA0, Normal.bg, 0.18)
---   MeshReviewSupuesto   — bg = blend(#CBAACB, Normal.bg, 0.18)
--- Sin `fg` porque el texto del rango debe heredar el color de sintaxis activo;
--- recolorear la prosa del documento sería intrusivo.
---
--- Grupos de marca (uno por tipo) — solo `fg`, sin `bg`:
---   MeshReviewEditaMark      — fg = #E59A9A
---   MeshReviewSugerenciaMark — fg = #E3C58A
---   MeshReviewPreguntaMark   — fg = #8FB4E3
---   MeshReviewVerificaMark   — fg = #FFAA7A
---   MeshReviewNotaMark       — fg = #6CB6B0
---   MeshReviewReferenciaMark — fg = #A8CBA0
---   MeshReviewSupuestoMark   — fg = #CBAACB
--- Se usan para sign_hl_group y el hl de virt_text, donde el color del tipo
--- debe aparecer como texto visible. Sin `bg` para no interferir con el fondo
--- del signcolumn ni con la línea del documento.
---
--- Grupo de fallback:
---   MeshReviewDetached — fg = #6e6e6e, sin bg (hilos desanclados o tipo desconocido)

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

  -- Grupos de rango: fondo tintado al 18 %, sin fg explícito.
  -- Sin fg porque el texto del rango debe heredar el color de sintaxis del
  -- colorscheme activo; recolorear la prosa del documento sería intrusivo.
  for _, t in ipairs(types.list) do
    local bg_blended = blend.blend_hex(t.color, bg_hex, ALPHA)
    vim.api.nvim_set_hl(0, t.hl, { bg = bg_blended })
  end

  -- Grupos de marca: fg = color canónico del tipo, sin bg.
  -- sign_hl_group y el hl de virt_text usan estos grupos para que la letra
  -- del signo y la etiqueta de fin de línea aparezcan en el color del tipo,
  -- con contraste real sobre el fondo oscuro. Sin bg para no interferir con
  -- el fondo del signcolumn ni con la línea donde descansa el virt_text.
  for _, t in ipairs(types.list) do
    vim.api.nvim_set_hl(0, t.mark_hl, { fg = t.color })
  end

  -- Grupo para anclas perdidas o tipos desconocidos: gris tenue sin fondo.
  -- No tintamos porque no sabemos dónde está el fragmento; el fg dim
  -- distingue estas marcas de las normales sin ocupar fondo.
  -- MeshReviewDetached no necesita gemelo Mark: su fg ya sirve tanto para
  -- rangos inciertos como para sign_hl_group; el gris uniforme transmite
  -- la pérdida de ancla sin dar una señal cromática falsa.
  vim.api.nvim_set_hl(0, "MeshReviewDetached", { fg = DETACHED_FG })
end

return M

--- lua/mesh_review/types.lua — Tabla canónica de los 7 tipos de comentario.
---
--- Fuente de verdad de colores: TYPE_COLORS en
--- vscode/review-extension/src/decorations-utils.ts.
---
--- Nota sobre los dos grises de fallback:
---   - FALLBACK_COLOR (#9e9e9e) es el color de decoración de la extensión VS
---     Code cuando el tipo no está reconocido. Se documenta aquí como referencia
---     pero NO se usa para grupos de highlight de Neovim.
---   - FALLBACK_HL ("MeshReviewDetached") es el grupo de highlight de Neovim
---     para comentarios sin ancla o con tipo desconocido. Su fg es #6e6e6e
---     («text.dim» de la paleta dotmesh), definido en hl.lua y colors/dotmesh.lua.
---
--- El módulo es Lua puro: no llama a ninguna API de Neovim al nivel del módulo.
--- Carga limpiamente con package.path sin Neovim en ejecución.

local M = {}

-- ---------------------------------------------------------------------------
-- Constantes de fallback
-- ---------------------------------------------------------------------------

--- Color de decoración de fallback de la extensión VS Code (graphite secundario).
--- No se usa para grupos de highlight en Neovim.
M.FALLBACK_COLOR = "#9e9e9e"

--- Grupo de highlight para tipos no reconocidos o hilos desanclados.
--- fg = #6e6e6e (text.dim dotmesh), definido en hl.lua / colors/dotmesh.lua.
M.FALLBACK_HL = "MeshReviewDetached"

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

--- @class MeshReviewType
--- @field label           string   Nombre canónico del tipo (p.ej. "nota").
--- @field letter          string   Tecla de atajo de una sola pulsación.
--- @field color           string   Color hex copiado literalmente de TYPE_COLORS.
--- @field needs_confidence boolean true si el CLI requiere --confidence.
--- @field hl              string   Nombre del grupo de rango (p.ej. "MeshReviewNota"):
---                                 solo `bg` (mezcla 0.18). Uso: hl_group del extmark de rango.
--- @field mark_hl         string   Nombre del grupo de marca (p.ej. "MeshReviewNotaMark"):
---                                 solo `fg` = color del tipo, sin `bg`. Uso: sign_hl_group
---                                 y el hl de virt_text; da el color canónico sin teñir fondo.

--- Construye el nombre del grupo de rango a partir de una etiqueta.
--- Capitaliza el primer carácter: "nota" → "MeshReviewNota".
--- Solo bg (mezcla al 0.18). Se expone como M.hl_group para que los módulos que
--- reciben un label arbitrario puedan construir el nombre sin reimplementar la lógica.
--- @param label string
--- @return string
function M.hl_group(label)
  return "MeshReview" .. label:sub(1, 1):upper() .. label:sub(2)
end

--- Construye el nombre del grupo de marca a partir de una etiqueta.
--- "nota" → "MeshReviewNotaMark". Solo fg = color del tipo, sin bg.
--- Se usa para sign_hl_group y el hl de virt_text: el color del tipo debe
--- aparecer como texto visible, no como fondo tintado.
--- @param label string
--- @return string
function M.mark_hl_group(label)
  return "MeshReview" .. label:sub(1, 1):upper() .. label:sub(2) .. "Mark"
end

--- Array con los 7 tipos en orden canónico.
--- Los colores coinciden byte a byte con TYPE_COLORS en decorations-utils.ts.
--- Solo verifica y supuesto requieren --confidence al abrir un hilo.
--- @type MeshReviewType[]
M.list = {
  { label = "edita",      letter = "e", color = "#E59A9A", needs_confidence = false, hl = M.hl_group("edita"),      mark_hl = M.mark_hl_group("edita")      },
  { label = "sugerencia", letter = "s", color = "#E3C58A", needs_confidence = false, hl = M.hl_group("sugerencia"), mark_hl = M.mark_hl_group("sugerencia") },
  { label = "pregunta",   letter = "p", color = "#8FB4E3", needs_confidence = false, hl = M.hl_group("pregunta"),   mark_hl = M.mark_hl_group("pregunta")   },
  { label = "verifica",   letter = "v", color = "#FFAA7A", needs_confidence = true,  hl = M.hl_group("verifica"),   mark_hl = M.mark_hl_group("verifica")   },
  { label = "nota",       letter = "n", color = "#6CB6B0", needs_confidence = false, hl = M.hl_group("nota"),       mark_hl = M.mark_hl_group("nota")       },
  { label = "referencia", letter = "r", color = "#A8CBA0", needs_confidence = false, hl = M.hl_group("referencia"), mark_hl = M.mark_hl_group("referencia") },
  { label = "supuesto",   letter = "u", color = "#CBAACB", needs_confidence = true,  hl = M.hl_group("supuesto"),   mark_hl = M.mark_hl_group("supuesto")   },
}

--- Mapa etiqueta → tipo. Acceso O(1) por nombre canónico.
--- @type table<string, MeshReviewType>
M.by_label = {}

--- Mapa letra → tipo. Acceso O(1) por tecla de atajo.
--- @type table<string, MeshReviewType>
M.by_letter = {}

for _, t in ipairs(M.list) do
  M.by_label[t.label]   = t
  M.by_letter[t.letter] = t
end

return M

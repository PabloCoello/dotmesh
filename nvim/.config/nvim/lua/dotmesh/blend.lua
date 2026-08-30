--- lua/dotmesh/blend.lua — Mezcla lineal de colores hex sin corrección gamma.
---
--- Equivalente Lua de la interpolación que usa la extensión VS Code para
--- calcular el fondo de las decoraciones inline. La fórmula es:
---
---   result_canal = alpha × fg_canal + (1 − alpha) × bg_canal
---
--- redondeado al entero más cercano (round-half-up: math.floor(x + 0.5)).
---
--- Sin gamma: el valor resultante se asigna directamente como bg de un
--- highlight group. Esto replica lo que hace el navegador al componer
--- «rgba(tipo_color, alpha)» sobre el fondo del editor sin gestión de color.
---
--- Hex malformado: si fg_hex o bg_hex no tienen exactamente seis dígitos
--- hexadecimales (con o sin '#' inicial), la función devuelve fg_hex sin
--- modificar. Mismo comportamiento que hexToRgba en la extensión TS:
---   «if (!match) return hex»
--- La entrada viene siempre de la tabla de tipos o de la paleta (constantes
--- verificadas en compilación del plugin), así que el fallo es silencioso
--- e intencionado: no queremos lanzar error en mitad del setup del colorscheme.
---
--- Nota sobre los valores precalculados usados en los tests:
--- El plan documentaba "#382B2B" y "#222F2E" para los casos de referencia,
--- pero el cálculo real con round-half-up da "#382A2A" y "#22302E". Los tests
--- usan los valores de la implementación (verificados ejecutando el spec
--- antes de fijarlos), no los del plan.

local M = {}

-- ---------------------------------------------------------------------------
-- Helpers internos
-- ---------------------------------------------------------------------------

--- Convierte dos caracteres hex a entero (0-255).
--- @param s string  Exactamente dos dígitos hex (p.ej. "E5" o "e5").
--- @return integer
local function hex2int(s)
  return tonumber(s, 16)
end

--- Redondea al entero más cercano (round-half-up).
--- math.floor(x + 0.5) es equivalente a round para x ≥ 0.
--- Los valores de mezcla siempre están en [0, 255], así que la restricción
--- x ≥ 0 se cumple siempre.
--- @param x number
--- @return integer
local function round(x)
  return math.floor(x + 0.5)
end

-- ---------------------------------------------------------------------------
-- API pública
-- ---------------------------------------------------------------------------

--- Mezcla fg_hex y bg_hex linealmente (sin corrección gamma) con el alpha dado.
---
--- alpha = 0.0 devuelve bg_hex; alpha = 1.0 devuelve fg_hex.
---
--- @param fg_hex string  Color del primer plano en formato "#RRGGBB" o "RRGGBB".
--- @param bg_hex string  Color del fondo en formato "#RRGGBB" o "RRGGBB".
--- @param alpha  number  Factor de mezcla en [0.0, 1.0].
--- @return string        Color mezclado en formato "#RRGGBB" (mayúsculas).
function M.blend_hex(fg_hex, bg_hex, alpha)
  local r1, g1, b1 = fg_hex:match("^#?(%x%x)(%x%x)(%x%x)$")
  local r2, g2, b2 = bg_hex:match("^#?(%x%x)(%x%x)(%x%x)$")

  -- Fallo silencioso: hex malformado → devolver fg sin modificar.
  if not (r1 and r2) then
    return fg_hex
  end

  --- Mezcla un canal: round(alpha * f + (1 - alpha) * b).
  local function ch(f, b)
    return round(alpha * hex2int(f) + (1 - alpha) * hex2int(b))
  end

  return string.format("#%02X%02X%02X", ch(r1, r2), ch(g1, g2), ch(b1, b2))
end

return M

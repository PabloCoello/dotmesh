--- colors/dotmesh.lua — Colorscheme dotmesh para Neovim.
---
--- Fuente de verdad de la paleta: docs/DESIGN.md (§ Paleta · § Mapa de sintaxis).
--- Cromo de referencia: vscode/themes/dotmesh-color-theme.json.
--- Colores ANSI: ghostty/.config/ghostty/themes/dotmesh (palette 0-15).
---
--- Solo fondo oscuro (Ink). Paper (tema claro) no está en scope.
--- Usa nvim_set_hl (API moderna); no emite comandos highlight en cadena.
--- Carga limpiamente con `vim.cmd.colorscheme("dotmesh")` sin plugins.
---
--- Verificación headless (desde la raíz del repo):
---   REPO=$(git rev-parse --show-toplevel)
---   SPEC=$REPO/nvim/.config/nvim/tests/colorscheme_spec.lua
---   timeout 60 ~/.local/bin/nvim --headless -u NONE \
---     -c "set rtp+=$REPO/nvim/.config/nvim" \
---     -c "colorscheme dotmesh" \
---     -c "luafile $SPEC" -c "qa!"

-- Limpiar el estado del colorscheme anterior antes de redefinir grupos.
-- "syntax reset" vuelve a activar los grupos por defecto de Vim (Normal,
-- Comment, …) limpios, sobre los que se escriben los dotmesh a continuación.
vim.cmd("highlight clear")
if vim.fn.exists("syntax_on") == 1 then
  vim.cmd("syntax reset")
end

vim.g.colors_name = "dotmesh"
vim.o.background  = "dark"

-- Carga la paleta (módulo del paquete dotmesh, en lua/dotmesh/palette.lua).
-- El directorio de configuración debe estar en rtp para que require() lo encuentre.
local p   = require("dotmesh.palette")
local ink = p.ink
local syn = p.syntax
local txt = p.text
local chr = p.chrome

-- Helper: envuelve nvim_set_hl con el namespace global (0).
local function hl(name, opts)
  vim.api.nvim_set_hl(0, name, opts)
end

-- ===========================================================================
-- Grupos base
-- Mapa canónico: docs/DESIGN.md § Mapa de sintaxis.
-- El cromo usa ink._0–._3 en lugar de colores de acento para que el color
-- solo aparezca donde tiene significado (código, estado, señal).
-- ===========================================================================

-- Normal y superficies flotantes
-- ink._0 es el lienzo base; los paneles elevados usan ink._1 para el
-- escalón mínimo de separación sin recurrir a líneas duras.
hl("Normal",           { bg = ink._0, fg = txt.primary })
hl("NormalFloat",      { bg = ink._1, fg = txt.primary })
hl("NormalNC",         { bg = ink._1, fg = txt.primary })  -- ventana no activa

-- Comentarios: atenuado + cursiva (docs/DESIGN.md § comentarios → #6e6e6e)
hl("Comment",          { fg = txt.dim, italic = true })

-- Constantes, literales numéricos y booleanos → peach
hl("Constant",         { fg = syn.peach })
hl("Number",           { fg = syn.peach })
hl("Boolean",          { fg = syn.peach })
hl("Float",            { fg = syn.peach })

-- Cadenas → sage (coherente con adiciones Git y el acento de «correcto»)
hl("String",           { fg = syn.sage })
hl("Character",        { fg = syn.sage })

-- Variables e identificadores → texto primario sin tinte
hl("Identifier",       { fg = txt.primary })
-- Funciones y métodos → blue
hl("Function",         { fg = syn.blue })

-- Control de flujo y palabras clave → lilac
-- Lilac mapea a «storage», «keyword.control» y decoradores en VS Code.
hl("Statement",        { fg = syn.lilac })
hl("Conditional",      { fg = syn.lilac })
hl("Repeat",           { fg = syn.lilac })
hl("Exception",        { fg = syn.lilac })
hl("Keyword",          { fg = syn.lilac })
-- Etiquetas (goto, case, HTML tags) → rose; igual que entity.name.tag en VS Code
hl("Label",            { fg = syn.rose })
-- Operadores y delimitadores → gris secundario (puntuación invisible)
hl("Operator",         { fg = txt.secondary })

-- Preprocesador y directivas → lilac (decoradores, macros, includes)
hl("PreProc",          { fg = syn.lilac })
hl("Include",          { fg = syn.lilac })
hl("Define",           { fg = syn.lilac })
hl("Macro",            { fg = syn.lilac })
hl("PreCondit",        { fg = syn.lilac })

-- Tipos y clases → gold
hl("Type",             { fg = syn.gold })
hl("StorageClass",     { fg = syn.lilac })
hl("Structure",        { fg = syn.gold })
hl("Typedef",          { fg = syn.gold })

-- Especiales → teal (escape, regex, «self»)
hl("Special",          { fg = syn.teal })
hl("SpecialChar",      { fg = syn.teal })
hl("Tag",              { fg = syn.rose })   -- HTML/XML tag → rose
hl("Delimiter",        { fg = txt.secondary })
hl("SpecialComment",   { fg = txt.dim, italic = true })
hl("Debug",            { fg = syn.peach })

-- Subrayado, error y tareas
hl("Underlined",       { fg = syn.blue, underline = true })
hl("Ignore",           { fg = txt.dim })
hl("Error",            { fg = syn.rose })
hl("Todo",             { fg = syn.gold, bold = true })

-- ===========================================================================
-- Cromo del editor — monocromo a propósito
-- Referencia: vscode/themes/dotmesh-color-theme.json (editorLineNumber.*,
-- editor.lineHighlight*, editor.selection*, editorCursor.*).
-- ===========================================================================

hl("SignColumn",       { bg = ink._0, fg = txt.secondary })
-- Números de línea: #474747 es el valor del tema VS Code (documentado en
-- docs/DESIGN.md § Chrome: "VS Code usa #474747 para los números de línea").
hl("LineNr",           { fg = chr.line_nr })
hl("CursorLineNr",     { fg = chr.line_nr_active, bold = true })

-- Línea del cursor: escalón ink._1 sobre ink._0; sutil pero visible.
hl("CursorLine",       { bg = ink._1 })
hl("CursorColumn",     { bg = ink._1 })

-- Búsqueda: gold al 40 % sobre ink._0 (pre-calculado; replica VS Code
-- editor.findMatchBackground = #E3C58A66 compuesto sobre #121212).
-- blend_hex("#E3C58A","#121212",0.40) = #665A42
hl("Search",           { bg = "#665A42", fg = txt.primary })
-- IncSearch y CurSearch: gold puro sobre ink-0 para máxima visibilidad.
hl("IncSearch",        { bg = syn.gold, fg = ink._0, bold = true })
hl("CurSearch",        { bg = syn.gold, fg = ink._0, bold = true })

-- Selección visual: coincide con Ghostty selection-background (#2e2e2e).
hl("Visual",           { bg = chr.selection })
hl("VisualNOS",        { bg = chr.selection })

-- Paréntesis coincidente: teal sobre ink._2 para que destaque sin gritar.
hl("MatchParen",       { bg = ink._2, fg = syn.teal, bold = true })

-- Fold
hl("Folded",           { bg = ink._1, fg = txt.dim, italic = true })
hl("FoldColumn",       { bg = ink._0, fg = txt.dim })

-- Columna de color
hl("ColorColumn",      { bg = ink._1 })

-- ===========================================================================
-- Ventanas, separadores y tabline
-- Filosofía «cromo monocromo»: los paneles se separan por tono, no por línea
-- dura (docs/DESIGN.md: "los bordes duros desaparecen y los paneles se
-- separan solo por tono").
-- ===========================================================================

-- Separadores de ventana: el borde usa ink._3; el fondo, ink._0 para
-- que sea «transparente» en la transición entre paneles.
hl("VertSplit",        { fg = chr.border, bg = ink._0 })
hl("WinSeparator",     { fg = chr.border, bg = ink._0 })
hl("FloatBorder",      { fg = chr.border, bg = ink._1 })
hl("FloatTitle",       { fg = txt.secondary, bg = ink._1 })

hl("StatusLine",       { bg = ink._0, fg = txt.secondary })
hl("StatusLineNC",     { bg = ink._1, fg = txt.dim })

hl("TabLine",          { bg = ink._1, fg = txt.dim })
hl("TabLineFill",      { bg = ink._0 })
hl("TabLineSel",       { bg = ink._0, fg = txt.primary, bold = true })

hl("Directory",        { fg = syn.blue })

-- Cursor: teal canónico (coincide con Ghostty cursor-color).
hl("Cursor",           { fg = ink._0, bg = chr.cursor })
hl("lCursor",          { fg = ink._0, bg = chr.cursor })
hl("CursorIM",         { fg = ink._0, bg = chr.cursor })

-- ===========================================================================
-- Menú de completado (Pmenu)
-- Superficie ink._1 para flotar sobre ink._0 sin borde duro.
-- ===========================================================================

hl("Pmenu",            { bg = ink._1, fg = txt.primary })
hl("PmenuSel",         { bg = ink._3, fg = txt.primary })
hl("PmenuSbar",        { bg = ink._1 })
hl("PmenuThumb",       { bg = ink._3 })

-- ===========================================================================
-- Mensajes y prompts
-- ===========================================================================

hl("ModeMsg",          { fg = txt.primary, bold = true })
hl("MsgArea",          { fg = txt.primary })
hl("MoreMsg",          { fg = syn.sage })
hl("Question",         { fg = syn.blue })
hl("WarningMsg",       { fg = syn.peach })
hl("ErrorMsg",         { fg = syn.rose })
hl("Title",            { fg = syn.blue, bold = true })

-- ===========================================================================
-- Diff
-- Los fondos usan blend al 18 % sobre ink._0, mismo alpha que los MeshReview*,
-- para coherencia visual con el sistema de revisión.
-- Valores pre-calculados (blend_hex sin corrección gamma, round-half-up):
--   sage  #A8CBA0 0.18 → R=45(0x2D) G=51(0x33) B=44(0x2C) → #2D332C
--   gold  #E3C58A 0.18 → R=56(0x38) G=50(0x32) B=40(0x28) → #383228
--   rose  #E59A9A 0.18 → R=56(0x38) G=42(0x2A) B=42(0x2A) → #382A2A
--   DiffText usa gold al 30 % para resaltar la parte exacta del cambio.
-- ===========================================================================

hl("DiffAdd",          { bg = "#2D332C", fg = syn.sage })
hl("DiffChange",       { bg = "#383228", fg = syn.gold })
hl("DiffDelete",       { bg = "#382A2A", fg = syn.rose })
hl("DiffText",         { bg = "#514836", fg = syn.gold, bold = true })

-- ===========================================================================
-- Diagnósticos y LSP
-- Mapa: rose=error · peach=warn · blue=info · teal=hint
-- (coherente con el uso de rose/peach en el mapa de sintaxis canónico)
-- ===========================================================================

hl("DiagnosticError",           { fg = syn.rose })
hl("DiagnosticWarn",            { fg = syn.peach })
hl("DiagnosticInfo",            { fg = syn.blue })
hl("DiagnosticHint",            { fg = syn.teal })
hl("DiagnosticUnnecessary",     { fg = txt.dim, italic = true })

hl("DiagnosticSignError",       { fg = syn.rose })
hl("DiagnosticSignWarn",        { fg = syn.peach })
hl("DiagnosticSignInfo",        { fg = syn.blue })
hl("DiagnosticSignHint",        { fg = syn.teal })

-- Subrayado ondulado con el color del diagnóstico (sp = color del subrayado).
hl("DiagnosticUnderlineError",  { sp = syn.rose,  undercurl = true })
hl("DiagnosticUnderlineWarn",   { sp = syn.peach, undercurl = true })
hl("DiagnosticUnderlineInfo",   { sp = syn.blue,  undercurl = true })
hl("DiagnosticUnderlineHint",   { sp = syn.teal,  undercurl = true })

hl("LspInlayHint",              { fg = txt.dim, italic = true })
hl("LspReferenceText",          { bg = ink._2 })
hl("LspReferenceRead",          { bg = ink._2 })
hl("LspReferenceWrite",         { bg = ink._2, bold = true })

-- ===========================================================================
-- Treesitter (@-groups)
-- Mapa canónico: docs/DESIGN.md § Mapa de sintaxis.
-- Se definen los grupos base; Treesitter los hereda o los ajusta por lenguaje.
-- Solo se añaden overrides cuando el comportamiento es distinto del base.
-- ===========================================================================

-- Variables
hl("@variable",              { fg = txt.primary })
hl("@variable.builtin",      { fg = syn.teal })    -- self, this, etc. → especial
hl("@variable.parameter",    { fg = txt.primary })
hl("@variable.member",       { fg = txt.primary })

-- Palabras clave y control → lilac
hl("@keyword",               { fg = syn.lilac })
hl("@keyword.function",      { fg = syn.lilac })
hl("@keyword.operator",      { fg = syn.lilac })
hl("@keyword.return",        { fg = syn.lilac })
hl("@keyword.import",        { fg = syn.lilac })
hl("@keyword.exception",     { fg = syn.lilac })

-- Funciones y métodos → blue
hl("@function",              { fg = syn.blue })
hl("@function.builtin",      { fg = syn.blue })
hl("@function.method",       { fg = syn.blue })
hl("@function.call",         { fg = syn.blue })
hl("@function.method.call",  { fg = syn.blue })
hl("@method",                { fg = syn.blue })
hl("@method.call",           { fg = syn.blue })
-- Constructores → gold (crean tipos, son más «tipo» que «función»)
hl("@constructor",           { fg = syn.gold })

-- Cadenas y caracteres → sage
hl("@string",                { fg = syn.sage })
-- Escapes, regex y caracteres especiales dentro de cadenas → teal (especial)
hl("@string.escape",         { fg = syn.teal })
hl("@string.special",        { fg = syn.teal })
hl("@string.regex",          { fg = syn.teal })

-- Números y booleanos → peach
hl("@number",                { fg = syn.peach })
hl("@number.float",          { fg = syn.peach })
hl("@boolean",               { fg = syn.peach })

-- Tipos → gold
hl("@type",                  { fg = syn.gold })
hl("@type.builtin",          { fg = syn.gold })
hl("@type.definition",       { fg = syn.gold })

-- Comentarios: atenuado + cursiva (mismo que base Comment)
hl("@comment",               { fg = txt.dim, italic = true })
hl("@comment.documentation", { fg = txt.dim, italic = true })

-- Operadores y puntuación → gris secundario (invisible como puntuación tipográfica)
hl("@operator",              { fg = txt.secondary })
hl("@punctuation",           { fg = txt.secondary })
hl("@punctuation.delimiter", { fg = txt.secondary })
hl("@punctuation.bracket",   { fg = txt.secondary })
-- Puntuación especial (interpolación, escape de template) → teal
hl("@punctuation.special",   { fg = syn.teal })

-- Etiquetas HTML/XML → rose; atributos → gold
hl("@tag",                   { fg = syn.rose })
hl("@tag.attribute",         { fg = syn.gold })
hl("@tag.delimiter",         { fg = txt.secondary })

-- Atributos y anotaciones → gold (= tipos/clases)
hl("@attribute",             { fg = syn.gold })
hl("@attribute.builtin",     { fg = syn.gold })

-- Especiales y constantes → teal / peach
hl("@special",               { fg = syn.teal })
hl("@constant",              { fg = syn.peach })
hl("@constant.builtin",      { fg = syn.peach })
hl("@constant.macro",        { fg = syn.peach })

-- Campos y propiedades → texto primario (no distingo campo de variable)
hl("@field",                 { fg = txt.primary })
hl("@property",              { fg = txt.primary })

-- Marcado (Markdown)
hl("@markup.heading",        { fg = syn.blue, bold = true })
hl("@markup.bold",           { fg = syn.peach, bold = true })
hl("@markup.italic",         { fg = syn.teal, italic = true })
hl("@markup.link",           { fg = syn.blue, underline = true })
hl("@markup.link.url",       { fg = syn.blue, underline = true })
hl("@markup.raw",            { fg = syn.sage })
hl("@markup.raw.block",      { fg = syn.sage })
hl("@markup.list",           { fg = txt.secondary })
hl("@markup.list.checked",   { fg = syn.sage })
hl("@markup.list.unchecked", { fg = txt.dim })

-- Módulos y namespaces → gold (= tipos/clases a nivel de módulo)
hl("@module",                { fg = syn.gold })
hl("@namespace",             { fg = syn.gold })

-- ===========================================================================
-- Plugins
-- Se definen aunque el plugin no esté instalado; Neovim ignora grupos
-- no referenciados sin emitir error, así que la definición es siempre segura.
-- ===========================================================================

-- ── telescope.nvim ──────────────────────────────────────────────────────────
-- Superficies en ink._1 para flotar sobre el editor (ink._0).
-- Bordes en ink._3 (separación tonal sin línea dura).
-- Matches y elementos activos en teal (acento principal del tema).
hl("TelescopeNormal",         { bg = ink._1, fg = txt.primary })
hl("TelescopeBorder",         { fg = chr.border, bg = ink._1 })
hl("TelescopeSelection",      { bg = ink._3, fg = txt.primary })
hl("TelescopeSelectionCaret", { fg = syn.teal })
hl("TelescopeMatching",       { fg = syn.teal })
hl("TelescopePromptNormal",   { bg = ink._1, fg = txt.primary })
hl("TelescopePromptBorder",   { fg = chr.border, bg = ink._1 })
hl("TelescopePromptTitle",    { fg = syn.teal, bold = true })
hl("TelescopeResultsTitle",   { fg = txt.secondary })
hl("TelescopePreviewTitle",   { fg = txt.secondary })
hl("TelescopeResultsBorder",  { fg = chr.border, bg = ink._1 })
hl("TelescopePreviewBorder",  { fg = chr.border, bg = ink._1 })
hl("TelescopePreviewNormal",  { bg = ink._1 })

-- ── which-key.nvim ──────────────────────────────────────────────────────────
-- Teclas en blue (funciones/acciones); grupos en lilac (control/categoría);
-- separador en dim (puntuación invisible); descripciones en texto primario.
hl("WhichKey",                { fg = syn.blue })
hl("WhichKeyGroup",           { fg = syn.lilac })
hl("WhichKeySeparator",       { fg = txt.dim })
hl("WhichKeyDesc",            { fg = txt.primary })
hl("WhichKeyNormal",          { bg = ink._1 })
hl("WhichKeyBorder",          { fg = chr.border })
hl("WhichKeyFloat",           { bg = ink._1 })

-- ── neo-tree.nvim ───────────────────────────────────────────────────────────
-- Panel lateral en ink._1 (elevado sobre el editor ink._0).
-- Raíz en teal (acento de navegación); directorios en blue (funciones/rutas).
hl("NeoTreeNormal",           { bg = ink._1, fg = txt.primary })
hl("NeoTreeNormalNC",         { bg = ink._1, fg = txt.primary })
hl("NeoTreeDimText",          { fg = txt.dim })
hl("NeoTreeRootName",         { fg = syn.teal, bold = true })
hl("NeoTreeFileName",         { fg = txt.primary })
hl("NeoTreeFileIcon",         { fg = txt.secondary })
hl("NeoTreeDirectoryName",    { fg = syn.blue })
hl("NeoTreeDirectoryIcon",    { fg = syn.blue })
hl("NeoTreeIndentMarker",     { fg = chr.border })
hl("NeoTreeGitAdded",         { fg = syn.sage })
hl("NeoTreeGitModified",      { fg = syn.gold })
hl("NeoTreeGitDeleted",       { fg = syn.rose })
hl("NeoTreeGitUntracked",     { fg = syn.peach })

-- ── gitsigns.nvim ───────────────────────────────────────────────────────────
-- Mismos colores que Diff y delta: sage/gold/rose.
-- Los fondos de línea usan los mismos valores blended que DiffAdd/Change/Delete.
hl("GitSignsAdd",             { fg = syn.sage })
hl("GitSignsChange",          { fg = syn.gold })
hl("GitSignsDelete",          { fg = syn.rose })
hl("GitSignsAddNr",           { fg = syn.sage })
hl("GitSignsChangeNr",        { fg = syn.gold })
hl("GitSignsDeleteNr",        { fg = syn.rose })
hl("GitSignsAddLn",           { bg = "#2D332C" })  -- sage 18 % (= DiffAdd)
hl("GitSignsChangeLn",        { bg = "#383228" })  -- gold 18 % (= DiffChange)
hl("GitSignsDeleteLn",        { bg = "#382A2A" })  -- rose 18 % (= DiffDelete)

-- ── nvim-cmp ────────────────────────────────────────────────────────────────
-- CmpItemKind usa teal como acento genérico; los tipos específicos siguen
-- el mismo mapa que la sintaxis (function→blue, type→gold, keyword→lilac…).
hl("CmpItemKind",             { fg = syn.teal })
hl("CmpItemKindText",         { fg = txt.primary })
hl("CmpItemKindMethod",       { fg = syn.blue })
hl("CmpItemKindFunction",     { fg = syn.blue })
hl("CmpItemKindConstructor",  { fg = syn.gold })
hl("CmpItemKindField",        { fg = txt.primary })
hl("CmpItemKindVariable",     { fg = txt.primary })
hl("CmpItemKindClass",        { fg = syn.gold })
hl("CmpItemKindInterface",    { fg = syn.gold })
hl("CmpItemKindKeyword",      { fg = syn.lilac })
hl("CmpItemKindSnippet",      { fg = syn.teal })
hl("CmpItemKindColor",        { fg = syn.peach })
hl("CmpItemKindFile",         { fg = txt.secondary })
hl("CmpItemKindReference",    { fg = syn.blue })
hl("CmpItemKindFolder",       { fg = syn.blue })
hl("CmpItemKindModule",       { fg = syn.gold })
hl("CmpItemAbbrMatch",        { fg = syn.teal, bold = true })
hl("CmpItemAbbrMatchFuzzy",   { fg = syn.teal })
hl("CmpItemAbbr",             { fg = txt.primary })
hl("CmpItemMenu",             { fg = txt.dim })

-- ── nvim-notify ─────────────────────────────────────────────────────────────
hl("NotifyBackground",        { bg = ink._1 })
hl("NotifyERRORBorder",       { fg = syn.rose })
hl("NotifyWARNBorder",        { fg = syn.peach })
hl("NotifyINFOBorder",        { fg = syn.blue })
hl("NotifyDEBUGBorder",       { fg = txt.dim })
hl("NotifyTRACEBorder",       { fg = syn.lilac })
hl("NotifyERRORTitle",        { fg = syn.rose })
hl("NotifyWARNTitle",         { fg = syn.peach })
hl("NotifyINFOTitle",         { fg = syn.blue })
hl("NotifyDEBUGTitle",        { fg = txt.dim })
hl("NotifyTRACETitle",        { fg = syn.lilac })
hl("NotifyERRORBody",         { fg = txt.primary })
hl("NotifyWARNBody",          { fg = txt.primary })
hl("NotifyINFOBody",          { fg = txt.primary })
hl("NotifyDEBUGBody",         { fg = txt.primary })
hl("NotifyTRACEBody",         { fg = txt.primary })

-- ===========================================================================
-- Grupos MeshReview* — colores del sistema de revisión de código
--
-- Cada tipo tiene un fondo calculado como blend_hex(tipo.color, ink._0, 0.18),
-- equivalente a «rgba(tipo_color, 0.18) compuesto sobre ink._0» sin canal
-- alpha real (Neovim no admite alpha en highlight groups).
--
-- Se itera mesh_review.types para no copiar constantes a mano: la fuente de
-- verdad es la tabla de tipos, no este fichero. Si blend o types no están
-- disponibles en el rtp actual, se omiten los grupos graciosamente;
-- hl.lua (C10) los recalcula en runtime en cualquier caso.
--
-- Valores precalculados para referencia (blend_hex, round-half-up):
--   edita      #E59A9A 0.18 → #382A2A
--   sugerencia #E3C58A 0.18 → #383228
--   pregunta   #8FB4E3 0.18 → #292F38
--   verifica   #FFAA7A 0.18 → #3D2D25
--   nota       #6CB6B0 0.18 → #22302E
--   referencia #A8CBA0 0.18 → #2D332C
--   supuesto   #CBAACB 0.18 → #332D33
-- ===========================================================================

local ok_blend, blend = pcall(require, "dotmesh.blend")
local ok_types, types = pcall(require, "mesh_review.types")

if ok_blend and ok_types then
  for _, t in ipairs(types.list) do
    local bg = blend.blend_hex(t.color, ink._0, 0.18)
    -- Solo bg: el texto del rango hereda el fg del cursor/sintaxis activo.
    -- El fg del tipo (sign_hl_group, virt_text) lo gestiona hl.lua en runtime.
    hl(t.hl, { bg = bg })
  end
end

-- MeshReviewDetached — hilo sin ancla resuelta.
-- fg = text.dim (#6e6e6e): visible pero claramente atenuado; sin bg.
hl("MeshReviewDetached", { fg = txt.dim })

-- ===========================================================================
-- Colores de terminal (:terminal)
-- Coinciden exactamente con ghostty/.config/ghostty/themes/dotmesh para que
-- :terminal dentro de Neovim muestre la misma paleta que el terminal exterior.
-- Fuente: ghostty/.config/ghostty/themes/dotmesh (palette = N=#RRGGBB).
-- ===========================================================================

vim.g.terminal_color_foreground = txt.primary
vim.g.terminal_color_background = ink._0

for i, color in pairs(p.terminal) do
  vim.g["terminal_color_" .. i] = color
end

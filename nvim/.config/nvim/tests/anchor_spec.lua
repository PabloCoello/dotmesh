--- tests/anchor_spec.lua — Runner headless para mesh_review.anchor._place_extmarks
---
--- Verifica el comportamiento de los extmarks (rango, signo, virt_text) en los
--- cuatro casos definidos por C11: normal, cita ausente, incierta y detached.
---
--- No depende de plenary, del CLI de mesh-review ni de la red.
--- Los buffers se crean con nvim_buf_set_lines y los hilos son tablas de prueba.
--- Termina con cq (exit 1) si alguna aserción falla; exit 0 si todo pasa.
---
--- Cómo ejecutar (desde la raíz del repo):
---
---   SPEC=$(realpath nvim/.config/nvim/tests/anchor_spec.lua)
---   timeout 60 ~/.local/bin/nvim --headless -u NONE -c "luafile $SPEC" -c "qa!"

-- ---------------------------------------------------------------------------
-- Localizar módulos a partir de la ruta de este fichero.
-- ---------------------------------------------------------------------------
local src = debug.getinfo(1, "S").source:match("^@?(.+)$")
if not src or not src:match("^/") then
  io.stderr:write(
    "ERROR: ejecuta con ruta absoluta:\n" ..
    "  SPEC=$(realpath nvim/.config/nvim/tests/anchor_spec.lua)\n" ..
    "  timeout 60 ~/.local/bin/nvim --headless -u NONE -c \"luafile $SPEC\" -c \"qa!\"\n"
  )
  vim.cmd("cq")
  return
end

local test_dir = src:match("(.+)/[^/]+$")
local lua_dir  = vim.fn.fnamemodify(test_dir .. "/../lua/", ":p")
package.path   = lua_dir .. "?.lua;" .. lua_dir .. "?/init.lua;" .. package.path

-- ---------------------------------------------------------------------------
-- Cargar módulos
-- ---------------------------------------------------------------------------
local ok_hl, hl = pcall(require, "mesh_review.hl")
if not ok_hl then
  io.stderr:write("ERROR cargando mesh_review.hl: " .. tostring(hl) .. "\n")
  vim.cmd("cq")
  return
end

-- Definir los grupos de highlight antes de colocar extmarks; sin esto,
-- nvim_set_hl podría no tener Normal.bg pero hl.setup() ya contempla el respaldo.
hl.setup()

local ok_anchor, anchor = pcall(require, "mesh_review.anchor")
if not ok_anchor then
  io.stderr:write("ERROR cargando mesh_review.anchor: " .. tostring(anchor) .. "\n")
  vim.cmd("cq")
  return
end

-- ---------------------------------------------------------------------------
-- Mini-runner (mismo estilo que utf_spec.lua)
-- ---------------------------------------------------------------------------
local pass = 0
local fail = 0

local function eq(desc, got, expected)
  if got == expected then
    io.stderr:write("  ok  " .. desc .. "\n")
    pass = pass + 1
  else
    io.stderr:write(
      "  FAIL " .. desc ..
      "  got=" .. tostring(got) ..
      "  expected=" .. tostring(expected) .. "\n"
    )
    fail = fail + 1
  end
end

local function ok_check(desc, condition)
  if condition then
    io.stderr:write("  ok  " .. desc .. "\n")
    pass = pass + 1
  else
    io.stderr:write("  FAIL " .. desc .. "\n")
    fail = fail + 1
  end
end

--- Crea un buffer de scratch con el contenido dado.
--- @param lines string[]
--- @return number bufnr
local function make_buf(lines)
  local bufnr = vim.api.nvim_create_buf(false, true)
  vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
  return bufnr
end

--- Obtiene todos los extmarks del buffer con detalles.
--- @param bufnr number
--- @return table[]  {id, row, col, details}
local function get_marks(bufnr)
  local ns = vim.api.nvim_create_namespace("mesh_review")
  return vim.api.nvim_buf_get_extmarks(bufnr, ns, 0, -1, { details = true })
end

-- ---------------------------------------------------------------------------
-- Caso 1: cita resuelta — rango exacto, hl del tipo, signo y virt_text
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== Caso 1: cita resuelta (tipo nota) ===\n")

do
  local bufnr = make_buf({ "foo bar baz" })
  local threads = {
    {
      status      = "open",
      thread_id   = "tid-001",
      commentType = "nota",
      anchor      = { quote = "bar", char_offset = 4, line_hint = 0 },
    },
  }
  anchor._place_extmarks(bufnr, threads)
  local marks = get_marks(bufnr)

  eq("caso 1: un extmark", #marks, 1)
  if #marks >= 1 then
    local _, row, col, d = marks[1][1], marks[1][2], marks[1][3], marks[1][4]
    eq("caso 1: start_row",      row,             0)
    eq("caso 1: start_col",      col,             4)
    eq("caso 1: end_row",        d.end_row,       0)
    eq("caso 1: end_col",        d.end_col,       7)
    eq("caso 1: hl_group",       d.hl_group,      "MeshReviewNota")
    eq("caso 1: sign_text",      d.sign_text,     "n▎")
    eq("caso 1: sign_hl_group",  d.sign_hl_group, "MeshReviewNota")
    -- virt_text = { {"● nota", "MeshReviewNota"} }
    ok_check("caso 1: virt_text existe",       d.virt_text ~= nil and #d.virt_text >= 1)
    if d.virt_text and #d.virt_text >= 1 then
      eq("caso 1: virt_text texto",   d.virt_text[1][1], "● nota")
      eq("caso 1: virt_text hl",      d.virt_text[1][2], "MeshReviewNota")
    end
    eq("caso 1: virt_text_pos",  d.virt_text_pos, "eol")
  end
end

-- ---------------------------------------------------------------------------
-- Caso 2: cita no encontrada — extmark en line_hint sin rango
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== Caso 2: cita no encontrada ===\n")

do
  local bufnr = make_buf({ "foo bar baz" })
  local threads = {
    {
      status      = "open",
      thread_id   = "tid-002",
      commentType = "edita",
      anchor      = { quote = "xyz_no_existe", char_offset = 0, line_hint = 0 },
    },
  }
  anchor._place_extmarks(bufnr, threads)
  local marks = get_marks(bufnr)

  eq("caso 2: un extmark", #marks, 1)
  if #marks >= 1 then
    local _, row, col, d = marks[1][1], marks[1][2], marks[1][3], marks[1][4]
    eq("caso 2: row = line_hint", row, 0)
    eq("caso 2: col = 0",         col, 0)
    -- Sin rango: end_row y end_col no deben estar definidos.
    ok_check("caso 2: sin end_row", d.end_row == nil)
    ok_check("caso 2: sin end_col", d.end_col == nil)
    ok_check("caso 2: sin hl_group de rango", d.hl_group == nil)
    eq("caso 2: sign_text",     d.sign_text,     "e▎")
    eq("caso 2: sign_hl_group", d.sign_hl_group, "MeshReviewEdita")
    -- virt_text sigue presente (tipo conocido, aunque sin rango).
    ok_check("caso 2: virt_text existe", d.virt_text ~= nil and #d.virt_text >= 1)
    if d.virt_text and #d.virt_text >= 1 then
      eq("caso 2: virt_text texto", d.virt_text[1][1], "● edita")
    end
  end
end

-- ---------------------------------------------------------------------------
-- Caso 3: cita incierta — rango degradado a MeshReviewDetached
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== Caso 3: cita incierta (char_offset muy lejano) ===\n")

do
  local bufnr = make_buf({ "foo bar baz" })
  -- char_offset=500 hace que la distancia al match ("bar" está en ~4 UTF-16 units)
  -- supere el umbral de 200 → uncertain = true.
  local threads = {
    {
      status      = "open",
      thread_id   = "tid-003",
      commentType = "nota",
      anchor      = { quote = "bar", char_offset = 500, line_hint = 0 },
    },
  }
  anchor._place_extmarks(bufnr, threads)
  local marks = get_marks(bufnr)

  eq("caso 3: un extmark", #marks, 1)
  if #marks >= 1 then
    local _, row, col, d = marks[1][1], marks[1][2], marks[1][3], marks[1][4]
    -- La cita se encontró → posición del match, no line_hint.
    eq("caso 3: start_row = posición del match", row, 0)
    eq("caso 3: start_col = posición del match", col, 4)
    -- Rango degradado a Detached.
    eq("caso 3: hl_group = MeshReviewDetached", d.hl_group, "MeshReviewDetached")
    eq("caso 3: end_row existe",  d.end_row, 0)
    eq("caso 3: end_col existe",  d.end_col, 7)
    -- Signo mantiene el tipo.
    eq("caso 3: sign_text",      d.sign_text,     "n▎")
    eq("caso 3: sign_hl_group",  d.sign_hl_group, "MeshReviewNota")
    -- virt_text con color del tipo (no Detached).
    ok_check("caso 3: virt_text existe", d.virt_text ~= nil and #d.virt_text >= 1)
    if d.virt_text and #d.virt_text >= 1 then
      eq("caso 3: virt_text hl = MeshReviewNota", d.virt_text[1][2], "MeshReviewNota")
    end
  end
end

-- ---------------------------------------------------------------------------
-- Caso 4: hilo detached — signo "? " en gris, sin rango ni virt_text
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== Caso 4: hilo detached ===\n")

do
  local bufnr = make_buf({ "foo bar baz" })
  local threads = {
    {
      status      = "open",
      thread_id   = "tid-004",
      commentType = "sugerencia",
      anchor      = { detached = true, line_hint = 0 },
    },
  }
  anchor._place_extmarks(bufnr, threads)
  local marks = get_marks(bufnr)

  eq("caso 4: un extmark", #marks, 1)
  if #marks >= 1 then
    local _, row, col, d = marks[1][1], marks[1][2], marks[1][3], marks[1][4]
    eq("caso 4: row = 0",             row,             0)
    eq("caso 4: sign_text = '? '",    d.sign_text,     "? ")
    eq("caso 4: sign_hl = Detached",  d.sign_hl_group, "MeshReviewDetached")
    ok_check("caso 4: sin rango end_row", d.end_row == nil)
    -- virt_text no debe existir para hilos detached.
    ok_check("caso 4: sin virt_text",
      d.virt_text == nil or #d.virt_text == 0)
  end
end

-- ---------------------------------------------------------------------------
-- Caso extra: múltiples hilos en el mismo buffer
-- ---------------------------------------------------------------------------
io.stderr:write("\n=== Caso extra: dos hilos en el mismo buffer ===\n")

do
  local bufnr = make_buf({ "primera línea", "segunda línea con nota" })
  local threads = {
    {
      status      = "open",
      thread_id   = "tid-multi-1",
      commentType = "nota",
      anchor      = { quote = "nota", char_offset = 24, line_hint = 1 },
    },
    {
      status      = "open",
      thread_id   = "tid-multi-2",
      commentType = "edita",
      anchor      = { detached = true, line_hint = 0 },
    },
  }
  anchor._place_extmarks(bufnr, threads)
  local marks = get_marks(bufnr)

  eq("caso extra: dos extmarks", #marks, 2)
end

-- ---------------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------------
io.stderr:write(string.format("\n%d passed, %d failed\n", pass, fail))

if fail > 0 then
  vim.cmd("cq")  -- exit 1
end
-- Si llegamos aquí, el -c "qa!" exterior da exit 0.

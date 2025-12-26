-- BeTheme Dark inspired colors for Neovim
local M = {}

M.palette = {
  bg0 = "#1A191E",
  bg1 = "#23242A",
  bg2 = "#262830",
  fg0 = "#F2F4F5",
  fg1 = "#C5C9CE",
  fg2 = "#9BA0A6",
  accent = "#FFAA7A",
  red = "#FF7799",
  orange = "#FF8866",
  green = "#66D9B8",
  yellow = "#FFD666",
  blue = "#FFAA7A",
  magenta = "#C299FF",
  cyan = "#66CCFF",
  dark_gray = "#202129",
}

local p = M.palette

function M.setup()
  vim.opt.termguicolors = true
  vim.opt.background = "dark"

  local highlights = {
    -- UI
    Normal = { fg = p.fg0, bg = p.bg0 },
    NormalFloat = { fg = p.fg0, bg = p.bg1 },
    CursorLine = { bg = p.bg2 },
    CursorLineNr = { fg = p.accent },
    LineNr = { fg = p.fg2 },
    VertSplit = { fg = p.bg2 },
    WinSeparator = { fg = p.bg2 },
    Pmenu = { fg = p.fg0, bg = p.bg1 },
    PmenuSel = { fg = p.bg0, bg = p.accent },
    PmenuSbar = { bg = p.bg2 },
    PmenuThumb = { bg = p.fg2 },
    StatusLine = { fg = p.fg1, bg = p.bg1 },
    StatusLineNC = { fg = p.fg2, bg = p.bg1 },
    Visual = { bg = "#2A2B31", fg = nil },
    Search = { bg = "#23242A", fg = p.fg0 },
    IncSearch = { bg = p.accent, fg = p.bg0 },
    ColorColumn = { bg = p.bg2 },
    MatchParen = { bg = p.bg2, fg = p.accent, bold = true },
    DiagnosticUnderlineError = { undercurl = true, sp = p.red },
    DiagnosticUnderlineWarn = { undercurl = true, sp = p.yellow },
    DiagnosticUnderlineInfo = { undercurl = true, sp = p.blue },
    DiagnosticUnderlineHint = { undercurl = true, sp = p.cyan },

    -- Syntax
    Comment = { fg = "#B8BCC8", italic = true },
    Keyword = { fg = p.red },
    Conditional = { fg = p.red },
    Repeat = { fg = p.red },
    Operator = { fg = p.orange },
    String = { fg = p.green },
    Number = { fg = p.yellow },
    Boolean = { fg = p.yellow },
    Type = { fg = "#E27056" },
    Function = { fg = p.magenta },
    Identifier = { fg = p.fg0 },
    Constant = { fg = p.yellow },

    -- Treesitter
    ["@comment"] = { link = "Comment" },
    ["@keyword"] = { link = "Keyword" },
    ["@keyword.operator"] = { fg = p.orange },
    ["@operator"] = { fg = p.orange },
    ["@string"] = { link = "String" },
    ["@number"] = { link = "Number" },
    ["@boolean"] = { link = "Boolean" },
    ["@type"] = { link = "Type" },
    ["@type.builtin"] = { fg = "#E27056" },
    ["@function"] = { link = "Function" },
    ["@function.builtin"] = { fg = p.accent },
    ["@method"] = { fg = p.magenta },
    ["@parameter"] = { fg = p.cyan },
    ["@property"] = { fg = p.fg0 },
    ["@variable"] = { fg = p.fg0 },
    ["@variable.builtin"] = { fg = p.accent, italic = true },
    ["@field"] = { fg = p.fg0 },
    ["@namespace"] = { fg = p.green },
    ["@constant"] = { fg = p.yellow },
    ["@constant.builtin"] = { fg = p.accent },
    ["@label"] = { fg = "#FF99CC" },

    -- Telescope
    TelescopeBorder = { fg = p.bg2, bg = p.bg0 },
    TelescopePromptBorder = { fg = p.bg2, bg = p.bg1 },
    TelescopePromptNormal = { fg = p.fg0, bg = p.bg1 },
    TelescopePromptPrefix = { fg = p.accent, bg = p.bg1 },
    TelescopeNormal = { fg = p.fg0, bg = p.bg0 },
    TelescopePreviewTitle = { fg = p.bg0, bg = p.accent },
    TelescopePromptTitle = { fg = p.bg0, bg = p.accent },
    TelescopeResultsTitle = { fg = p.bg0, bg = p.bg2 },

    -- Lualine
    StatusLineMode = { fg = p.bg0, bg = p.accent, bold = true },

    -- Diagnostics signs
    DiagnosticSignError = { fg = p.red },
    DiagnosticSignWarn = { fg = p.yellow },
    DiagnosticSignInfo = { fg = p.blue },
    DiagnosticSignHint = { fg = p.cyan },
  }

  for group, opts in pairs(highlights) do
    vim.api.nvim_set_hl(0, group, opts)
  end
end

return M

#!/usr/bin/env python3
"""
Export Pandora theme palette to various formats
Supports: Ghostty, Neovim (Lua), Obsidian (CSS)
"""

import json
import sys
from pathlib import Path


def load_palette(palette_path: Path) -> dict:
    """Load the JSON palette file"""
    with open(palette_path, 'r') as f:
        return json.load(f)


def export_ghostty(palette: dict, output_path: Path):
    """Export theme for Ghostty terminal"""
    colors = palette['colors']
    
    config = f"""# Pandora Theme for Ghostty
# Generated from palette.json

# Background & Foreground
background = {colors['background']['primary']}
foreground = {colors['foreground']['primary']}

# Cursor
cursor-color = {colors['ui']['cursor']}
cursor-text = {colors['background']['primary']}

# Selection
selection-background = {colors['ui']['selection']}
selection-foreground = {colors['foreground']['primary']}

# Terminal Colors
palette = 0={colors['terminal']['black']}
palette = 1={colors['terminal']['red']}
palette = 2={colors['terminal']['green']}
palette = 3={colors['terminal']['yellow']}
palette = 4={colors['terminal']['blue']}
palette = 5={colors['terminal']['magenta']}
palette = 6={colors['terminal']['cyan']}
palette = 7={colors['terminal']['white']}
palette = 8={colors['terminal']['brightBlack']}
palette = 9={colors['terminal']['brightRed']}
palette = 10={colors['terminal']['brightGreen']}
palette = 11={colors['terminal']['brightYellow']}
palette = 12={colors['terminal']['brightBlue']}
palette = 13={colors['terminal']['brightMagenta']}
palette = 14={colors['terminal']['brightCyan']}
palette = 15={colors['terminal']['brightWhite']}
"""
    
    with open(output_path, 'w') as f:
        f.write(config)
    
    print(f"✅ Ghostty theme exported to: {output_path}")


def export_neovim(palette: dict, output_path: Path):
    """Export theme for Neovim (Lua table)"""
    colors = palette['colors']
    
    lua_config = f"""-- Pandora Theme for Neovim
-- Generated from palette.json

return {{
  -- Background
  bg0 = "{colors['background']['primary']}",
  bg1 = "{colors['background']['secondary']}",
  bg2 = "{colors['background']['tertiary']}",
  
  -- Foreground
  fg0 = "{colors['foreground']['primary']}",
  fg1 = "{colors['foreground']['secondary']}",
  fg2 = "{colors['foreground']['tertiary']}",
  
  -- Accent colors
  red = "{colors['accent']['red']}",
  green = "{colors['accent']['green']}",
  yellow = "{colors['accent']['yellow']}",
  blue = "{colors['accent']['blue']}",
  purple = "{colors['accent']['purple']}",
  cyan = "{colors['accent']['cyan']}",
  
  -- UI elements
  selection = "{colors['ui']['selection']}",
  cursor = "{colors['ui']['cursor']}",
  cursorLine = "{colors['ui']['cursorLine']}",
  lineNumber = "{colors['ui']['lineNumber']}",
  border = "{colors['ui']['border']}",
  
  -- Git
  git_add = "{colors['git']['added']}",
  git_change = "{colors['git']['modified']}",
  git_delete = "{colors['git']['deleted']}",
  
  -- Diagnostics
  error = "{colors['diagnostic']['error']}",
  warning = "{colors['diagnostic']['warning']}",
  info = "{colors['diagnostic']['info']}",
  hint = "{colors['diagnostic']['hint']}",
}}
"""
    
    with open(output_path, 'w') as f:
        f.write(lua_config)
    
    print(f"✅ Neovim theme exported to: {output_path}")


def export_obsidian(palette: dict, output_path: Path):
    """Export theme for Obsidian (CSS variables)"""
    colors = palette['colors']
    
    css_config = f"""/* Pandora Theme for Obsidian */
/* Generated from palette.json */

.theme-dark {{
  /* Background */
  --background-primary: {colors['background']['primary']};
  --background-secondary: {colors['background']['secondary']};
  --background-tertiary: {colors['background']['tertiary']};
  
  /* Foreground */
  --text-normal: {colors['foreground']['primary']};
  --text-muted: {colors['foreground']['secondary']};
  --text-faint: {colors['foreground']['tertiary']};
  
  /* Accent colors */
  --color-red: {colors['accent']['red']};
  --color-green: {colors['accent']['green']};
  --color-yellow: {colors['accent']['yellow']};
  --color-blue: {colors['accent']['blue']};
  --color-purple: {colors['accent']['purple']};
  --color-cyan: {colors['accent']['cyan']};
  
  /* Interactive */
  --interactive-accent: {colors['accent']['blue']};
  --interactive-accent-hover: {colors['accent']['cyan']};
  
  /* Selection */
  --text-selection: {colors['ui']['selection']};
  
  /* Links */
  --link-color: {colors['accent']['blue']};
  --link-color-hover: {colors['accent']['cyan']};
  
  /* Tags */
  --tag-color: {colors['accent']['green']};
  --tag-background: {colors['background']['secondary']};
  
  /* Code */
  --code-background: {colors['background']['secondary']};
  --code-normal: {colors['syntax']['string']};
  --code-comment: {colors['syntax']['comment']};
  --code-function: {colors['syntax']['function']};
  --code-keyword: {colors['syntax']['keyword']};
  --code-string: {colors['syntax']['string']};
}}
"""
    
    with open(output_path, 'w') as f:
        f.write(css_config)
    
    print(f"✅ Obsidian theme exported to: {output_path}")


def main():
    # Paths
    script_dir = Path(__file__).parent
    palette_path = script_dir / "palette.json"
    
    # Load palette
    palette = load_palette(palette_path)
    
    # Export all formats
    export_ghostty(palette, script_dir / "pandora.conf")
    export_neovim(palette, script_dir / "pandora.lua")
    export_obsidian(palette, script_dir / "pandora.css")
    
    print("\n🎨 All theme exports completed!")


if __name__ == "__main__":
    main()

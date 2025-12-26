# MCP Setup (OpenCode)

Este repo incluye una configuración base para MCP en `opencode/mcp/config.json` con dos servidores:

- `obsidian-vault`: filesystem sobre `~/Documents/Pandora` (read-only en la plantilla; puedes poner `"writable": true` si quieres escribir).
- `zotero-bbt`: archivo `~/Documents/Zotero/betterbibtex.bib` (read-only).

## Ruta de configuración

- OpenCode suele mirar `~/.config/opencode/`.
- Codex (CLI) suele mirar `~/.config/codex/` (ajusta si tu instalación usa otra ruta).
- Copia o symlink:
  ```bash
  mkdir -p ~/.config/opencode ~/.config/codex
  ln -sf ~/Documents/GitHub/dotfiles/opencode/mcp/config.json ~/.config/opencode/mcp.json
  ln -sf ~/Documents/GitHub/dotfiles/ai/mcp/codex.json ~/.config/codex/mcp.json
  ```

Ejemplo:
```bash
mkdir -p ~/.config/opencode
ln -sf ~/Documents/GitHub/dotfiles/opencode/mcp/config.json ~/.config/opencode/mcp.json
```

## Ajustes rápidos

- Para permitir escritura en el vault, cambia `"writable": true` en `obsidian-vault`.
- Si tu BetterBibTeX está en otra ruta, actualiza `"path"` y, si quieres, usa `ZOTERO_BBT_PATH`.

## Pendientes

- Confirmar el esquema exacto que espera tu cliente MCP/OpenCode; adapta campos si difiere.
- Añadir más recursos/plantillas (p.ej., vistas filtradas del vault o colecciones Zotero).

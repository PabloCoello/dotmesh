# Secretos y tokens

Los tokens viven en `~/.zsh.secrets`, **fuera** del repo (nunca commiteado), y se cargan automáticamente desde [shell/.config/shell/env.zsh](../shell/.config/shell/env.zsh).

## Crear el fichero

```bash
touch ~/.zsh.secrets
chmod 600 ~/.zsh.secrets
```

## Plantilla

```sh
# ~/.zsh.secrets — NO COMMIT, NO STOW

# Notion: integración interna creada en https://www.notion.so/my-integrations
export NOTION_TOKEN="secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# GitHub: PAT (fine-grained) en https://github.com/settings/tokens
# Permisos mínimos para el MCP server: Contents (read), Metadata (read), Pull
# requests (read/write) y Issues (read/write) sobre los repos que uses.
#
# IMPORTANTE: el nombre de la variable es DOTMESH_GITHUB_PAT, no GITHUB_TOKEN
# ni GH_TOKEN. La razón es que la CLI `gh` da prioridad a esas dos variables
# por encima del token de su keyring; exportar GITHUB_TOKEN aquí rompería
# `gh pr create` para todos los agentes que hereden este entorno (Claude Code,
# OpenCode, Codex, etc.). Con un nombre neutro, el PAT no se inyecta por
# nombre en los MCP: el bloque `env`/`environment` de cada servidor lo mapea
# explícitamente de DOTMESH_GITHUB_PAT al nombre estándar que espera el MCP.
export DOTMESH_GITHUB_PAT="github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Codex no renombra variables al heredarlas con `env_vars`, así que el MCP de
# GitHub necesita esta variable derivada. No interfiere con `gh`; evita
# `GH_TOKEN` y `GITHUB_TOKEN`.
export GITHUB_PERSONAL_ACCESS_TOKEN="$DOTMESH_GITHUB_PAT"

# Tavily: web search para agentes en https://tavily.com
export TAVILY_API_KEY="tvly-xxxxxxxxxxxxxxxxxxxxxxxx"
```

## Tras editar

```bash
exec zsh                 # recarga el shell para que opencode los vea
```

## Notas

- **OpenAlex** (búsqueda de papers) no necesita token.
- **Zotero** se conecta vía la API local del cliente standalone (`localhost:23119`); requiere que la app esté abierta. No necesita token.
- Si `~/.zsh.secrets` no existe, el resto del setup funciona igual; solo los MCPs que dependen de un token se quedan sin auth.
- Permisos `0600` aseguran que solo el usuario lo lea.
- **`GITHUB_PERSONAL_ACCESS_TOKEN` y `NOTION_TOKEN` se exportan al entorno global de la shell**, no solo al proceso de su MCP. Eso significa que cualquier proceso hijo (otros MCPs en OpenCode o Claude, scripts que corren en la sesión) también los hereda. Codex filtra el entorno al lanzar sus MCP y solo pasa las variables declaradas en `env_vars`, por lo que la exposición cruzada allí es menor. En OpenCode y Claude Code, todos los MCP comparten el entorno del proceso padre. Ten en cuenta esta superficie al decidir qué tokens expones y cuándo.

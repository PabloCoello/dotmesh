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
# Scopes mínimos: repo, read:org, read:user
export GITHUB_TOKEN="github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

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

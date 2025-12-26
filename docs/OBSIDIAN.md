# Obsidian Vault - Pandora

Config para el vault de conocimiento en `~/Documents/Pandora` (se puede cambiar con `OBSIDIAN_VAULT`).

## Estructura recomendada

- Inbox/
- Daily/
- Templates/
- Projects/
- Areas/
- Resources/
- Archive/
- Assets/Images/

### Lineamientos del vault existente (Pandora)

- Carpeta actual en `~/Documents/Pandora` con subcarpetas `diary/`, `ideas/`, `study-topics/`, `projects/`.
- Commit tags obligatorios en ese repo: `[diary]`, `[meeting]`, `[idea]`, `[task]`, `[study]`, `[configuration]`.
- Formato de commit: `[<tag>] Descripción corta`.
- No sobrescribas el README del vault (contiene estas reglas); el script de bootstrap no toca archivos existentes.

## Bootstrap rápido

```bash
# opcional: define un path distinto
export OBSIDIAN_VAULT="$HOME/Documents/Pandora"

# crea carpetas y copia templates base
scripts/setup-obsidian-vault.sh
```

Luego abre Obsidian y añade ese path como vault.

### Git hook para forzar tags en commits

El vault actual usa tags obligatorias en los mensajes de commit:
`[diary] [meeting] [idea] [task] [study] [configuration]`.

Instala el hook `commit-msg` en el vault:

```bash
# si tu vault está en otra ruta, ajusta OBSIDIAN_VAULT o pasa el path como arg
scripts/install-obsidian-hooks.sh
```

Esto copia `obsidian/hooks/commit-msg` a `.git/hooks/commit-msg` del vault y valida el prefijo del mensaje. Merge/Revert se permiten.

### Obsidian Git (plugin)

1. Configura git en el vault (si no está):
   ```bash
   scripts/setup-obsidian-git.sh  # usa OBSIDIAN_VAULT si no es ~/Documents/Pandora
   ```
2. En Obsidian, instala y habilita el plugin **Obsidian Git**.
3. Opciones recomendadas:
   - Auto-commit enabled.
   - Mensaje de commit con tus tags (o manualmente usar los tags en commits manuales).
   - Intervalo de auto-commit/push a conveniencia.
4. .gitignore básico creado por el script (ignora workspace y data del plugin).

## Templates incluidos

- `Daily.md`: foco del día, log, inbox rápido.
- `Project.md`: estructura PARA para proyectos.
- `Note.md`: nota genérica.
- `Research.md`: pregunta, hipótesis, hallazgos y próximos pasos.
- `Meeting.md`: agenda, notas, decisiones y acciones.
- `Citation.md`: nota de referencia con citekey y extractos.

Los templates viven en `obsidian/Templates/` y se copian al vault en `Templates/`.

## Neovim (obsidian.nvim)

- El plugin usa `OBSIDIAN_VAULT` si está seteado; de lo contrario, `~/Documents/Pandora`.
- Comandos clave:
  - `<leader>oo` Quick switch
  - `<leader>on` Nueva nota
  - `<leader>ot` Nota diaria
  - `<leader>oy` Nota de ayer
  - `<leader>os` Buscar en vault
  - `<leader>ob` Backlinks
  - `<leader>ol` Links
  - `<leader>oc` TOC
  - `<leader>op` Pegar imagen en `Assets/Images`
  - `<leader>od` Listar dailies

## Plugins de Obsidian sugeridos

- Dataview
- Templater
- Advanced Tables
- Obsidian Git
- Excalidraw
- Zotero Integration (cuando conectes BetterBibTeX)

## Integración Zotero (borrador)

1. Instala BetterBibTeX en Zotero y crea un **auto-export .bib** (Better BibLaTeX) en `~/Documents/Zotero/betterbibtex.bib` (o la ruta que uses).
2. Exporta con las opciones de citekeys que prefieras.
3. Define la ruta en el entorno:
   ```bash
   export ZOTERO_BBT_PATH="$HOME/Documents/Zotero/betterbibtex.bib"
   ```
4. En Obsidian, instala el plugin **Zotero Integration** y apúntalo al mismo archivo.
5. En Neovim, usa `<leader>fz` (`:Telescope bibtex`) para buscar y pegar citas (`@citekey`).
   - `<leader>fi` inserta la cita directamente en el buffer actual.
6. Opcional: mantener la exportación en un repo aparte o sincronizado por iCloud/Drive.
7. Si solo tienes export JSON, conviértelo a .bib con `obsidian/hooks/post-export-convert.sh input.json output.bib` (requiere pandoc).

## Siguientes pasos

- Añadir más templates (Research, Meeting).
- Conectar script de sync con Obsidian Git.
- Definir MCP server para Zotero/Obsidian.

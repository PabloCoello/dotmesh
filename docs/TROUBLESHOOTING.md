# Troubleshooting

## Stow

### "WARNING! stowing X would cause conflicts"

Ya existe un fichero real (no symlink) en la ruta de destino. Resuélvelo con:

```bash
mv ~/<ruta-en-conflicto> ~/dotfiles-backup/manual-$(date +%Y%m%d).bak
make stow
```

### He añadido o quitado ficheros del repo y los symlinks no reflejan el cambio

```bash
make restow                # equivale a unstow + stow
```

### Stow no ha tocado un subdirectorio

Si en `~/<dir>` ya existe un directorio real, Stow no lo sobreescribe — entra y
enlaza fichero a fichero. Esto es el comportamiento esperado para
`~/.config/opencode/`, `~/.codex/`, `~/.claude/` (que contienen estado además de
config). Si quieres que un subdirectorio entero sea un symlink, vacíalo primero.

## Shell

### `~/.zshrc` no carga los módulos

```bash
ls -la ~/.zshrc                            # debe ser symlink al repo
ls -la ~/.config/shell/                    # idem
exec zsh
```

Si los symlinks no están creados:

```bash
cd ~/Documents/GitHub/dotmesh
make stow
```

### Cambios en `aliases.zsh`, `functions.zsh`… no se aplican

```bash
exec zsh                                   # recarga la shell entera
```

`source ~/.zshrc` puede dejar variables stale; `exec zsh` es más fiable.

## OpenCode

### `~/.config/opencode/agents/` aparece vacío

Lo más probable: Stow no ha enlazado todavía o el directorio es real (no
symlink) y Stow no se atreve a cruzarlo. Comprueba:

```bash
ls -la ~/.config/opencode/agents
```

Si no es symlink y el repo tiene contenido en `opencode/.config/opencode/agents/`:

```bash
rmdir ~/.config/opencode/agents 2>/dev/null    # solo si está vacío
make restow                                    # vuelve a enlazar
```

### `opencode agent list` no muestra todos los agentes

```bash
ls -la ~/.config/opencode/agents/              # comprueba symlinks
opencode --version
```

Si falta alguno: revisa que los `.md` tengan el frontmatter correcto (ver
ejemplos en [opencode/.config/opencode/agents/](../opencode/.config/opencode/agents/)).

## Codex

### `~/.codex/config.toml` se modifica con churn al usar Codex

Codex puede escribir entradas como `[projects."<ruta>"] trust_level = ...` en su
propio `config.toml`. Si quieres evitar que git vea esos cambios:

```bash
git update-index --skip-worktree codex/.codex/config.toml
```

Y para revertirlo:

```bash
git update-index --no-skip-worktree codex/.codex/config.toml
```

## Claude Code

### Plugins no se cargan

Comprueba que [claude/.claude/settings.json](../claude/.claude/settings.json)
contiene tus marketplaces y plugins. Tras editar:

```bash
make restow                                    # solo si has cambiado el repo
# Reinicia Claude Code.
```

## Backups

```bash
ls -1 ~/dotfiles-backup/                       # listar timestamps
cp -R ~/dotfiles-backup/<timestamp>/. ~/       # restaurar
```

## Reset completo

```bash
cd ~/Documents/GitHub/dotmesh
make unstow
# Tus configs vuelven al estado pre-stow del último backup si lo restauras:
cp -R ~/dotfiles-backup/<timestamp>/. ~/
```

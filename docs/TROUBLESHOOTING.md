# Troubleshooting - Dotfiles

Soluciones a problemas comunes durante la instalación y uso.

## Errores de Neovim

### Error: "Plugin pandora-theme is not installed"

**Síntoma:**
```
Plugin pandora-theme is not installed
Local plugin does not exist at `/Users/pablocoello/.config/nvim/colors`
```

**Solución:**
Este error fue corregido en la última versión. El tema Pandora ahora usa `tokyonight.nvim` como base y aplica los colores directamente con `vim.api.nvim_set_hl()`.

**Acción:**
```bash
cd ~/Documents/GitHub/dotfiles
git pull  # Si estás usando git
nvim      # Lazy.nvim sincronizará automáticamente
```

### Error: "ruff_lsp is deprecated"

**Síntoma:**
```
ruff_lsp is deprecated, use ruff instead.
Feature will be removed in lspconfig 0.2.1
```

**Solución:**
El LSP de Ruff fue renombrado de `ruff_lsp` a `ruff`. Ya está actualizado en la configuración.

**Verificar:**
```vim
:Mason
" Buscar 'ruff' en la lista
```

### Error: "markdown-preview.nvim build failed"

**Síntoma:**
```
markdown-preview.nvim build failed
Vim:E117: Unknown function: mkdp#util#install
```

**Solución:**
El comando de build fue actualizado. Ahora usa `cd app && npm install`.

**Requisitos:**
- Node.js y npm instalados
- Si no tienes npm: `brew install node`

**Reinstalar manualmente:**
```bash
cd ~/.local/share/nvim/lazy/markdown-preview.nvim
cd app && npm install
```

## Errores de LSP

### LSP no funciona para Python

**Verificar instalación:**
```vim
:Mason
:LspInfo
:checkhealth
```

**Reinstalar pyright:**
```vim
:Mason
" Buscar pyright, presionar 'i' para instalar
```

### Ruff no proporciona diagnósticos

**Configuración:**
Asegúrate de tener un `pyproject.toml` o `ruff.toml` en tu proyecto:

```toml
# ruff.toml
[lint]
select = ["E", "F", "I"]
ignore = []
```

### R Language Server no funciona

**Instalar en R:**
```r
install.packages("languageserver")
```

**Verificar en Neovim:**
```vim
:LspInfo
```

## Errores de Plugins

### Plugins no se instalan

**Solución 1: Sincronizar Lazy.nvim**
```vim
:Lazy sync
```

**Solución 2: Limpiar caché**
```bash
rm -rf ~/.local/share/nvim/lazy
nvim  # Reinstalará todo
```

**Solución 3: Verificar internet**
```bash
curl -I https://github.com
```

### Error de compilación de Telescope fzf-native

**Síntoma:**
```
telescope-fzf-native.nvim build failed
```

**Solución:**
```bash
brew install cmake
cd ~/.local/share/nvim/lazy/telescope-fzf-native.nvim
make
```

### nvim-treesitter parser errors

**Síntoma:**
```
Error executing parser
```

**Solución:**
```vim
:TSUpdate
:TSInstall python r lua markdown
```

## Errores de Configuración

### Symlinks no creados

**Verificar stow:**
```bash
which stow
# Si no existe: brew install stow
```

**Recrear symlinks:**
```bash
cd ~/Documents/GitHub/dotfiles
make unstow
make stow
```

**Verificar symlinks:**
```bash
ls -la ~/.config/nvim
ls -la ~/.zshrc
```

### Shell no carga módulos

**Verificar .zshrc:**
```bash
cat ~/.zshrc
# Debe tener source de los módulos
```

**Recargar shell:**
```bash
source ~/.zshrc
# o
exec zsh
```

## Errores de Ollama/AI

### No puede conectar a Ollama / OpenCode

**Verificar servidor Ollama:**
```bash
curl "${OLLAMA_HOST:-http://localhost:11434}/api/tags"
```

**Verificar API OpenCode/OpenAI:**
```bash
echo "$OPENCODE_BASE_URL"
echo "$OPENCODE_API_KEY" | sed 's/./*/g'
```

**Reiniciar plugin:**
```vim
:Lazy reload opencode.nvim
```

## Errores de Quarto

### molten-nvim no funciona

**Requisitos:**
```bash
# Python
pip install jupyter pynvim

# R
install.packages(c("IRkernel", "languageserver"))
IRkernel::installspec()
```

**Verificar kernels:**
```bash
jupyter kernelspec list
```

### Image.nvim no muestra imágenes

**Requisitos:**
- Terminal con soporte de imágenes (Kitty, WezTerm, etc.)
- Ghostty actualmente no soporta imágenes inline

**Alternativa:**
```vim
:MarkdownPreview  " Para ver imágenes en navegador
```

## Errores de Performance

### Neovim lento al abrir

**Medir tiempo de inicio:**
```bash
nvim --startuptime startup.log
less startup.log
```

**Deshabilitar plugins problemáticos:**
Editar el plugin específico en `nvim/.config/nvim/lua/plugins/` y agregar:
```lua
enabled = false,
```

**Lazy loading:**
Agregar a plugins pesados:
```lua
lazy = true,
event = "VeryLazy",
```

### LSP consume mucha CPU

**Deshabilitar diagnósticos en tiempo real:**
```lua
-- En lua/plugins/lsp.lua
vim.diagnostic.config({
  update_in_insert = false,
})
```

## Comandos Útiles de Diagnóstico

### Neovim
```vim
:checkhealth          " Healthcheck completo
:Lazy                 " Estado de plugins
:Mason                " LSP servers instalados
:LspInfo              " Info de LSP activo
:TSUpdate             " Actualizar parsers
:messages             " Ver mensajes de error
```

### Shell
```bash
make health           # Verificar dependencias
which nvim            # Verificar instalación
nvim --version        # Ver versión
```

### Git
```bash
git -C ~/Documents/GitHub/dotfiles status
git -C ~/Documents/GitHub/dotfiles log --oneline -5
```

## Restaurar Backups

### Restaurar configuración anterior

**Backup completo:**
```bash
# Ver backups disponibles
ls -la ~/dotfiles-backup/

# Restaurar todo
cp -r ~/dotfiles-backup/FECHA/* ~/
```

**Restaurar solo Neovim:**
```bash
rm -rf ~/.config/nvim
cp -r ~/dotfiles-backup/FECHA/.config/nvim ~/.config/
```

**Restaurar solo shell:**
```bash
cp ~/dotfiles-backup/FECHA/.zshrc ~/
```

## Obtener Ayuda

### Logs útiles para reportar issues

```bash
# Información del sistema
neofetch

# Versiones
nvim --version
zsh --version
git --version

# Healthcheck de Neovim
nvim --headless "+checkhealth" +qa > health.log

# Estructura de dotfiles
tree -L 3 ~/Documents/GitHub/dotfiles/
```

### Reportar un issue

1. Crear issue en: https://github.com/pablocoello/dotfiles/issues
2. Incluir:
   - Sistema operativo y versión
   - Output de `:checkhealth`
   - Pasos para reproducir
   - Logs relevantes

## Reset Completo

**¡CUIDADO! Esto borrará toda la configuración de Neovim**

```bash
# Backup previo
cp -r ~/.config/nvim ~/.config/nvim.backup

# Limpiar todo
rm -rf ~/.config/nvim
rm -rf ~/.local/share/nvim
rm -rf ~/.local/state/nvim
rm -rf ~/.cache/nvim

# Reinstalar
cd ~/Documents/GitHub/dotfiles
make stow
nvim  # Instalará todo de nuevo
```

## Preguntas Frecuentes

### ¿Por qué Lazy.nvim tarda en la primera carga?

Es normal. Está instalando y compilando todos los plugins. Toma 2-5 minutos.

### ¿Puedo usar mi antigua config de Neovim?

Sí, pero está respaldada en `~/dotfiles-backup/`. Los symlinks apuntan a la nueva config.

### ¿Cómo desinstalo todo?

```bash
cd ~/Documents/GitHub/dotfiles
make unstow
# Opcional: restaurar backup
cp -r ~/dotfiles-backup/FECHA/* ~/
```

### ¿Necesito reiniciar Neovim después de cambios?

Para cambios en plugins: sí, o usa `:Lazy reload PLUGIN`
Para cambios en opciones: no, `:source %` es suficiente

---

**Más ayuda:** Abre un issue en GitHub o consulta la documentación de cada plugin en sus repositorios.

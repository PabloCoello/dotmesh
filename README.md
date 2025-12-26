# Dotfiles - Setup Unificado para Análisis de Datos

> Setup modular y extensible para trabajar con Python, R y Quarto en Neovim, con integración profunda de IA (local + remota) y gestión de conocimiento.

---

## Quick Start

```bash
# Clonar el repositorio
git clone https://github.com/pablocoello/dotmesh.git ~/.dotmesh
cd ~/.dotmesh

# Instalación completa (cuando esté lista)
make install

# O instalación manual por componentes
make backup          # Respaldar configs actuales
make stow           # Aplicar symlinks con GNU Stow
make health         # Verificar instalación
```

---

## Estructura del Repositorio

```
dotmesh/
├── nvim/              # Configuración Neovim completa
│   └── .config/nvim/
│       ├── init.lua
│       └── lua/
│           ├── core/          # Opciones, keymaps, autocommands
│           └── plugins/       # Configuración de plugins
├── shell/             # Configuración Zsh modularizada
├── ghostty/           # Terminal Ghostty + tema Pandora
├── git/               # Git config con delta
├── starship/          # Prompt personalizado
├── themes/            # Sistema de temas centralizado
│   └── pandora/       # Palette + exporters
├── vscode/            # Configuración VS Code + temas
├── scripts/           # Scripts de automatización
└── docs/              # Documentación completa
```

---

## Stack Tecnologico

| Componente | Herramienta | Estado |
|------------|-------------|--------|
| **Shell** | Zsh + Oh-My-Zsh + Starship | Configurado |
| **Terminal** | Ghostty 1.2.3 | Configurado |
| **IDE** | Neovim 0.11.4 | Configurado |
| **Editor alternativo** | VS Code | Configurado |
| **Git** | Git + Delta | Configurado |
| **Dotfiles** | GNU Stow | Configurado |
| **LSP** | Python, R, Lua, Markdown | Configurado |
| **IA (Chat)** | opencode.nvim (OpenCode) + Ollama | Configurado |
| **IA (Local)** | Ollama (RTX 3090) | Conectado |
| **Quarto** | quarto-nvim + molten.nvim | Configurado |
| **Knowledge** | Obsidian + Zotero | Fase 3 |

---

## Documentacion

- **[Plan Maestro](PLAN.md)** - Visión completa y arquitectura del setup
- **[Instalación](docs/INSTALL.md)** - Guía paso a paso de instalación
- **[Atajos](docs/KEYBINDINGS.md)** - Cheatsheet de keybindings
- **[Workflows](docs/WORKFLOWS.md)** - Flujos de trabajo documentados
- **[Extensibilidad](docs/EXTENDING-SETUP.md)** - Cómo extender el setup
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Solución de problemas

---

## Comandos Utiles (Makefile)

```bash
make install        # Instalación completa
make backup         # Backup de configs actuales
make stow          # Aplicar symlinks (GNU Stow)
make unstow        # Eliminar symlinks
make health        # Healthcheck del sistema
make clean         # Limpiar caches de Neovim
```

---

## Filosofia del Setup

### Principios de Diseño

1. **Reproducibilidad Primero** - Todo versionado y automatizable
2. **Modularidad** - Componentes independientes y reutilizables
3. **Git-Friendly** - Evitar notebooks `.ipynb`, usar scripts
4. **Extensibilidad** - Fácil añadir agentes, temas, workflows
5. **Documentación** - Decisiones técnicas siempre documentadas

### Stack Unificado

Este setup busca **un único entorno** para:
- Python (ETL, data engineering)
- R (analisis estadistico)
- Quarto (informes tecnicos)
- IA (local + remota)
- Conocimiento (Obsidian + Zotero)

---

## FAQ

### ¿Por qué no usar VSCode como principal?

VSCode es excelente, pero este setup busca:
1. **Unificación** - Mismo entorno para Python/R/Quarto
2. **IA en terminal** - Acceso a IA desde cualquier contexto
3. **Personalización** - Control total sobre el entorno
4. **Terminal-first** - Workflow optimizado para terminal

**Nota:** VSCode se mantiene como fallback para casos específicos.

### ¿Funciona en Linux/Windows?

Este setup está optimizado para **macOS**, pero puede adaptarse:
- **Linux**: Cambiar paths de Homebrew, ajustar algunos scripts
- **Windows**: Requiere WSL2, adaptación significativa

### ¿Necesito el servidor RTX 3090?

No es imprescindible. Puedes:
- Usar solo IA remota (Copilot, Codex)
- Instalar Ollama en tu Mac (modelos más pequeños)

### ¿Cómo actualizo los dotfiles?

```bash
cd ~/Documents/GitHub/dotfiles
git pull
make stow  # Re-aplicar symlinks si es necesario
```

---

## Solucion de Problemas

Ver [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) para más ayuda.

---

## Agradecimientos

- [jmbuhr/quarto-nvim-kickstarter](https://github.com/jmbuhr/quarto-nvim-kickstarter) - Base de la configuración de Quarto
- [LazyVim](https://github.com/LazyVim/LazyVim) - Inspiración para estructura de plugins
- Comunidad de Neovim - Por los increíbles plugins

---

**Feliz coding**

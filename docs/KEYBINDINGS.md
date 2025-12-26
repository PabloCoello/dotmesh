# Atajos de Teclado y Comandos Rápidos (sin Neovim)

Guía rápida basada en la configuración incluida en este repo para terminal, tmux y CLI asociadas.

## Terminal (Zsh/Ghostty)

- Búsqueda en historial: `Ctrl + r` (incremental).
- Autosuggestions (`zsh-autosuggestions`): tecla → acepta la sugerencia; `Ctrl + g` o `Esc` la descarta.
- Movimiento rápido: `Ctrl + a` inicio de línea, `Ctrl + e` fin, `Esc` luego `b` / `Esc` luego `f` mueve palabra.
- Edición de línea: `Ctrl + w` borra palabra previa, `Ctrl + u` borra toda la línea, `Ctrl + l` limpia pantalla.
- Historial: `↑ / ↓` navega; `!!` repite último comando; `Esc` luego `.` repite último argumento.
- Aliases/funciones disponibles: ver `shell/.config/shell/aliases.zsh` y `shell/.config/shell/functions.zsh`.

## tmux

- Prefijo: `Ctrl + a` (remapeado desde `Ctrl + b`).
- Recargar config: `<prefijo> r` → `source ~/.tmux.conf`.
- Splits: `<prefijo> v` vertical (lado a lado), `<prefijo> s` horizontal (arriba/abajo).
- Navegación panes: `<prefijo> h/j/k/l` mueve foco izquierda/abajo/arriba/derecha.
- Copiar a portapapeles (macOS): `set-clipboard on` (copia al portapapeles del sistema desde copy-mode).
- Otros defaults útiles: `<prefijo> c` nueva ventana, `<prefijo> ,` renombra ventana, `<prefijo> d` detach de la sesión.

## Git (aliases principales)

- `gst` estado; `gdiff` diff; `gshow` último commit.
- `gco` checkout; `gbranch <nombre>` crea y cambia de rama.
- `gaa` add .; `gcmsg "msg"` commit; `gps` push; `gpl` pull.
- `grhh` reset --hard HEAD; `gstash` / `gpop` stash/pull.
- Log gráfico: `gl` (`--oneline --graph --all --decorate`).

## Docker (aliases)

- `dcu` compose up; `dcd` compose down; `dcb` compose build.
- `dps` contenedores; `dimg` imágenes; `dex <nombre> bash` exec interactivo.
- `dlogs <nombre>` logs con follow.

## Quarto / Documentos

- `qr <f.qmd>` render (alias de `quarto render`).
- `qp <f.qmd>` preview; `qq` alias base a `quarto`.
- `qrender <f.qmd>` (función) renderiza y abre el HTML.
- `qnew <template> <archivo>` crea documento desde plantilla en `templates/quarto/`.

## Python / R (workflows CLI)

- `qpy <f.py>` abre en Neovim con REPL Python (función `IronRepl python`).
- `qr <f.R>` abre en Neovim con REPL R (función `IronRepl R`).
- `pyproject <nombre>` genera estructura inicial `src/tests/docs/data`.
- En Neovim (toggleterm REPL simple): en Python `<Shift+Enter>` envía línea/selección a `ipython` (fallback: `<leader><Enter>` si Shift+Enter no funciona en tu terminal/tmux); en R `<Ctrl+Enter>` (fallback `<leader><Enter>`) envía a `radian`/`R`.

## Utilidades de terminal

- Limpieza de historial: `histclean` (dup), `histold` (deja 5000), `histclear` (vacía todo).
- Navegación rápida: `..`, `...`, `....`, `.....`.
- Puertos/red: `ports` (LISTEN), `localip`, `myip`.
- Sistema: `diskusage` (du + sort), `meminfo`, `cpuinfo`.
- Búsqueda: `find_in_files "<patrón>"` (usa `rg` si existe), `find_file "<nombre>"` (usa `fd`).

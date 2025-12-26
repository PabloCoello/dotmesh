# Tmux Setup

- Config: `tmux/.tmux.conf` (paleta Material/BeTheme).
- Instalación vía stow:
  ```bash
  make stow   # incluye tmux
  # o solo tmux
  stow -t ~ tmux
  ```
- Uso:
  - `tmux new -s work` para iniciar.
  - `Ctrl+b %` split vertical, `Ctrl+b "` split horizontal.
  - `Ctrl+b r` recarga `~/.tmux.conf`.
- Colores: fondo #1A191E, acento #FFAA7A, texto #C5C9CE.

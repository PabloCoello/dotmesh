# windows-terminal

Paquete de dotmesh para Windows Terminal. Contiene el esquema de color **dotmesh** (Paper · Ink · Syntax) y el script de instalación.

## Qué incluye

- `themes/dotmesh.json` — esquema de color para Windows Terminal. Los 16 colores ANSI y los valores de fondo, primer plano, cursor y selección provienen del tema canónico de Ghostty (`ghostty/.config/ghostty/themes/dotmesh`). La fuente de verdad de la paleta es `docs/DESIGN.md`.
- `scripts/install.sh` — script de instalación que inserta o reemplaza el esquema `dotmesh` en el `settings.json` de Windows Terminal de forma idempotente.

## Cómo se aplica

Desde una sesión WSL2:

```bash
# Opción A: mediante el Makefile (recomendado)
make wsl-terminal

# Opción B: ejecutando el script directamente
bash windows-terminal/scripts/install.sh
```

Tras la instalación, activa el esquema en Windows Terminal:
**Configuración → Perfiles → Apariencia → Esquema de colores → dotmesh**

## Por qué no entra en PACKAGES

Este paquete modifica un fichero del lado Windows (`%LOCALAPPDATA%\Packages\Microsoft.WindowsTerminal_*\LocalState\settings.json`) y no puede gestionarse con GNU Stow, que trabaja sobre el sistema de ficheros Linux. Se aplica manualmente con `make wsl-terminal` o con el script directo.

## Requisitos

- WSL2 con `/mnt/c/` accesible.
- `jq` instalado en la distro WSL (`sudo apt install jq`).
- Windows Terminal instalado en el lado Windows (Microsoft Store).

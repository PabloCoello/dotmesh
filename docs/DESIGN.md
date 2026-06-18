# Sistema de diseño dotmesh — Paper · Ink · Syntax

Este documento es la fuente de verdad del lenguaje visual que comparten las
herramientas de este repositorio. Nace del sistema de diseño personal `dotmesh`
(prototipado en [claude.ai/design](https://claude.ai/design)) y aquí queda
traducido a configuración real: tema de VS Code, tema de Warp, paleta de
Starship y colores de delta/Git.

La idea es una sola voz, tranquila y coherente, desde el prompt de la shell
hasta el editor: **monocromo primero** (en la línea del blanco y negro que está
sacando Microsoft) con **acentos de sintaxis muteados** usados solo donde el
color tiene significado: código, estado de Git, estado de build. El color es el
trabajo; el cromo se aparta.

## Los tres registros

- **Paper** — superficies claras (blanco y casi blanco). Para contextos de luz.
- **Ink** — lienzo casi negro (`#16171B`) para terminal y editor.
- **Graphite** — rampa de grises neutros que hace todo el trabajo estructural:
  texto, bordes, segmentos del prompt, cromo. El cromo se mantiene monocromo a
  propósito.
- **Syntax** — siete acentos muteados. Tres elegidos a mano (peach, lilac, teal)
  y cuatro compañeros armonizados en el mismo registro de baja saturación. Solo
  aparecen como **señal**, nunca como decoración.

## Paleta

### Ink (superficies oscuras)

| Token | Hex | Uso |
|---|---|---|
| `ink-0` | `#16171B` | lienzo base (fondo de editor y terminal) |
| `ink-1` | `#1C1D22` | panel elevado (sidebar, barra de título) |
| `ink-2` | `#24252B` | overlay / hover |
| `ink-3` | `#2D2F36` | línea sobre oscuro |

### Graphite (rampa neutra)

`#16181D` · `#1F2127` · `#2A2C33` · `#3C3F47` · `#565A63` · `#71757E` ·
`#9A9EA6` · `#C2C5CB` · `#DCDEE2` · `#EBECEF` · `#F5F6F7`

Texto sobre Ink: primario `#E9EAEC`, secundario `#9A9DA4`, atenuado `#6A6D74`.

### Syntax (los siete acentos)

| Token | Hex | Significado |
|---|---|---|
| peach | `#FFAA7A` | números, constantes; cambios sin guardar |
| lilac | `#CBAACB` | palabras clave, decoradores |
| teal | `#6CB6B0` | especial, regex, escape, cursor |
| blue | `#8FB4E3` | funciones, métodos |
| sage | `#A8CBA0` | cadenas; adiciones; prompt correcto |
| gold | `#E3C58A` | tipos, clases |
| rose | `#E59A9A` | errores, etiquetas, eliminaciones |

Sobre Paper, las señales usan hermanos algo más profundos (`signal-*`) para que
contrasten en blanco; sobre Ink se usan los pasteles directamente.

## Tipografía

- **Hanken Grotesk** para interfaz y display (neutra, ligeramente cálida).
- **JetBrains Mono** para todo lo que es código: editor, prompt, metadatos y
  números. **Ligaduras activadas.**

> Sustitución: el sistema de diseño usa Hanken Grotesk como sustituto de una
> grotesca tipo Segoe (propietaria). En las herramientas reales la voz mono es
> JetBrains Mono.

## Mapa de sintaxis (canónico)

Esta es la asignación que siguen tanto el tema de VS Code como delta y la paleta
del prompt. Cualquier ajuste de color empieza aquí.

| Categoría | Color |
|---|---|
| comentarios | `#6A6D74` (cursiva) |
| texto / variables | `#E9EAEC` |
| palabras clave, control, `storage` | lilac `#CBAACB` |
| funciones, métodos | blue `#8FB4E3` |
| cadenas | sage `#A8CBA0` |
| números, booleanos | peach `#FFAA7A` |
| tipos, clases | gold `#E3C58A` |
| especial, `self`, regex, escape | teal `#6CB6B0` |
| operadores, puntuación | `#9A9DA4` |
| etiquetas HTML/XML | rose `#E59A9A` |
| atributos | gold `#E3C58A` |
| inválido / error | rose `#E59A9A` (subrayado) |

## Cómo lo consume cada herramienta

| Superficie | Fichero | Qué aplica |
|---|---|---|
| Editor | [`vscode/themes/dotmesh-color-theme.json`](../vscode/themes/dotmesh-color-theme.json) | tema `dotmesh` (cromo Ink monocromo + sintaxis) |
| Editor | [`vscode/Library/Application Support/Code/User/settings.json`](../vscode/Library/Application%20Support/Code/User/settings.json) | activa el tema `dotmesh` y la fuente JetBrains Mono |
| Terminal | [`warp/.warp/themes/dotmesh.yaml`](../warp/.warp/themes/dotmesh.yaml) | tema de Warp (fondo Ink + ANSI de sintaxis) |
| Prompt | [`starship/.config/starship.toml`](../starship/.config/starship.toml) | paleta `dotmesh`: segmentos grafito + iconos de sintaxis |
| VCS | [`git/.gitconfig`](../git/.gitconfig) | colores de delta y de Git (sage/rose/gold/blue) |

El cromo es monocromo en todas: en VS Code los bordes duros desaparecen y los
paneles se separan solo por tono (Ink-1 sidebar sobre Ink-0 editor); en el prompt
los segmentos forman un degradado grafito y solo los iconos llevan color.

## Activar y revertir

Los temas se añaden **junto a los anteriores**, no los reemplazan:

- **VS Code**: ya queda activo vía `settings.json` (`workbench.colorTheme:
  "dotmesh"`). Para volver atrás, elige otro tema en la paleta de comandos.
- **Warp**: selecciona el tema `dotmesh` en los ajustes de Warp. Ajusta también
  la fuente a JetBrains Mono allí (Warp no toma la fuente de este repo).
- **Starship**: activo vía `palette = 'dotmesh'`. Para revertir, cámbialo a
  `palette = 'gruvbox_dark'` (la paleta antigua se conserva en el fichero).
- **delta/Git**: el cambio de colores es directo; revertir es un `git checkout`
  de `git/.gitconfig`.

Tras editar cualquier paquete, aplica con `make restow <paquete>` y recarga
(`exec zsh` para el prompt; recargar ventana en VS Code).

## Iconografía

Las herramientas reales usan **Nerd Fonts** (glifos powerline en Starship,
MesloLGS/JetBrainsMono Nerd Font en el terminal) y el **Material Icon Theme** en
el árbol de VS Code. Esos glifos se conservan tal cual; el tema solo cambia su
color. No se usan emoji: el estado se expresa con glifos del propio tipo
(`✓ ✗ ●`) y con los iconos de línea ya presentes.

## Limitaciones conocidas

- **Fuente de Warp**: no se versiona en este repo; hay que fijar JetBrains Mono
  (Nerd Font) en los ajustes de Warp a mano.
- **`syntax-theme` de delta**: se mantiene `Pandora` para no romper el resaltado
  de bat dentro de los diffs; lo que se ajusta a dotmesh son las decoraciones de
  `+/-`, cabeceras de hunk y números de línea.
- El sistema de diseño completo (tokens, componentes, kits de UI) vive fuera de
  este repo, en el proyecto de Claude Design. Aquí solo se integra la capa de
  configuración real.

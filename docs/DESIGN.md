# Sistema de diseño dotmesh — Paper · Ink · Syntax

Este documento es la fuente de verdad del lenguaje visual que comparten las
herramientas de este repositorio. Nace del sistema de diseño personal `dotmesh`
(prototipado en [claude.ai/design](https://claude.ai/design)) y aquí queda
traducido a configuración real: tema de VS Code, tema de Warp, paleta de
Starship, colores de delta/Git, el retint del escritorio GNOME y la esfera del
reloj (Connect IQ, repo hermano [`dotmesh-watch`](../../dotmesh-watch)).

La idea es una sola voz, tranquila y coherente, desde el prompt de la shell
hasta el editor: **monocromo primero** (en la línea del blanco y negro que está
sacando Microsoft) con **acentos de sintaxis muteados** usados solo donde el
color tiene significado: código, estado de Git, estado de build. El color es el
trabajo; el cromo se aparta.

## Los tres registros

- **Paper** — superficies claras (blanco y casi blanco). Para contextos de luz.
- **Ink** — lienzo casi negro (`#121212`) para terminal y editor. Gris neutro,
  sin tinte azul, y un paso más profundo que la primera versión para una lectura
  más larga sin que el texto claro «brille» contra el fondo.
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
| `ink-0` | `#121212` | lienzo base (fondo de editor y terminal) |
| `ink-1` | `#181818` | panel elevado (sidebar, barra de título) |
| `ink-2` | `#202020` | overlay / hover |
| `ink-3` | `#2a2a2a` | línea sobre oscuro |

### Graphite (rampa neutra)

`#181818` · `#212121` · `#2e2e2e` · `#424242` · `#5c5c5c` · `#767676` ·
`#9e9e9e` · `#c6c6c6` · `#dedede` · `#ececec` · `#f6f6f6`

Texto sobre Ink: primario `#cecece`, secundario `#9e9e9e`, atenuado `#6e6e6e`.
El primario baja desde `#e9eaec`: sobre el lienzo más profundo un casi-blanco
rondaba ~15:1 y cansaba la vista; aquí queda en ~11:1, tranquilo pero muy por
encima de AA. Para los segmentos del prompt de Starship el texto sube a
`#eaeaea` (mantiene AA en cada segmento del degradado grafito).

### Chrome (powerline)

Rampa de grafito puro para los segmentos tipo powerline (prompt de Starship y la
powerline de la esfera del reloj). Cada escalón es más claro que el anterior para
que se lean las costuras; el texto va en un gris claro fijo que mantiene contraste
sobre todos:

`#2e2e2e` (os / usuario) · `#383838` (directorio) · `#424242` (git) ·
`#4D4D4D` (lenguajes / batería) · `#545454` (docker / conda) · `#5c5c5c` (hora) ·
texto `#EAEAEA`.

VS Code usa `#474747` para los números de línea (valor propio del tema, fuera de
la rampa powerline).

El **blanco de prompt** `#F0F1F3` es el tono más brillante de la voz oscura: el
valor vivo del prompt (p. ej. la hora en la esfera). El cromo sigue siendo
monocromo; el color solo entra en los iconos de cada segmento.

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
| comentarios | `#6e6e6e` (cursiva) |
| texto / variables | `#cecece` |
| palabras clave, control, `storage` | lilac `#CBAACB` |
| funciones, métodos | blue `#8FB4E3` |
| cadenas | sage `#A8CBA0` |
| números, booleanos | peach `#FFAA7A` |
| tipos, clases | gold `#E3C58A` |
| especial, `self`, regex, escape | teal `#6CB6B0` |
| operadores, puntuación | `#9e9e9e` |
| etiquetas HTML/XML | rose `#E59A9A` |
| atributos | gold `#E3C58A` |
| inválido / error | rose `#E59A9A` (subrayado) |

## Cómo lo consume cada herramienta

| Superficie | Fichero | Qué aplica |
|---|---|---|
| Editor | [`vscode/themes/dotmesh-color-theme.json`](../vscode/themes/dotmesh-color-theme.json) | tema `dotmesh` (cromo Ink monocromo + sintaxis) |
| Editor | [`vscode/Library/Application Support/Code/User/settings.json`](../vscode/Library/Application%20Support/Code/User/settings.json) | activa el tema `dotmesh` y la fuente JetBrains Mono |
| Revisión | [`vscode/review-extension/`](../vscode/review-extension/) | fondo `rgba(108,182,176,0.18)` (teal con alpha, compatible con tema claro) en el rango anclado; etiqueta de prioridad al final de línea (rose `#E59A9A` alta · gold `#E3C58A` media · teal `#6CB6B0` baja); `#6e6e6e` en comentarios resueltos |
| Terminal | [`warp/.warp/themes/dotmesh.yaml`](../warp/.warp/themes/dotmesh.yaml) | tema de Warp (fondo Ink + ANSI de sintaxis) |
| Prompt | [`starship/.config/starship.toml`](../starship/.config/starship.toml) | paleta `dotmesh`: segmentos grafito + iconos de sintaxis |
| VCS | [`git/.gitconfig`](../git/.gitconfig) | colores de delta y de Git (sage/rose/gold/blue) |
| Escritorio | [`gnome/`](../gnome/) | retint GNOME sobre Yaru: superficies Ink en apps (gtk.css), fondo de malla Ink (teal · sage · rose como señales), tipografía y tinte Ink del dock |
| Esfera | [`../dotmesh-watch`](../../dotmesh-watch) | esfera Connect IQ (Epix Pro): hora-prompt blanca, powerline grafito, sintaxis como señal (peach = Claude) |

El cromo es monocromo en todas: en VS Code los bordes duros desaparecen y los
paneles se separan solo por tono (Ink-1 sidebar sobre Ink-0 editor); en el prompt
los segmentos forman un degradado grafito y solo los iconos llevan color.

## Activar y revertir

Los temas se añaden **junto a los anteriores**, no los reemplazan:

- **VS Code**: ya queda activo vía `settings.json` (`workbench.colorTheme:
  "dotmesh"`). Para volver atrás, elige otro tema en la paleta de comandos. El
  tema se instala como extensión empaquetada, o sea una copia: editar su JSON en
  el repo no llega a VS Code con solo recargar la ventana. Vuelve a ejecutar
  `vscode/scripts/install.sh` (refresca la copia instalada sin depender de la
  red) y recarga la ventana.
- **Warp**: selecciona el tema `dotmesh` en los ajustes de Warp. Ajusta también
  la fuente a JetBrains Mono allí (Warp no toma la fuente de este repo).
- **Starship**: activo vía `palette = 'dotmesh'`. Para revertir, cámbialo a
  `palette = 'legacy'` (paleta heredada; conserva los colores del esquema
  anterior y ya incluye todas las claves de icono que los módulos necesitan).
- **delta/Git**: el cambio de colores es directo; revertir es un `git checkout`
  de `git/.gitconfig`.
- **Escritorio (GNOME, solo Linux)**: `make gnome-rice` enlaza los `gtk.css` y
  el fondo, y aplica la capa dconf (acento, tipografía, dock, fondo). Para
  revertir, `stow -D -t ~ gnome` quita los `gtk.css` y el fondo, y se restaura el
  volcado dconf previo (detalle en [`gnome/README.md`](../gnome/README.md)). Es
  un retint sobre Yaru, no un tema a medida; el Shell se queda en Yaru-dark con
  el blur de `blur-my-shell`.

Tras editar cualquier paquete, aplica con `make restow <paquete>` y recarga
(`exec zsh` para el prompt; recargar ventana en VS Code). El tema de VS Code es
la excepción: como es una extensión empaquetada, recargar no basta; hay que
volver a ejecutar `vscode/scripts/install.sh` (ver «Activar y revertir»).

## Iconografía

Las herramientas reales usan **Nerd Fonts** (glifos powerline en Starship,
MesloLGS/JetBrainsMono Nerd Font en el terminal) y el **Material Icon Theme** en
el árbol de VS Code. Esos glifos se conservan tal cual; el tema solo cambia su
color. No se usan emoji: el estado se expresa con glifos del propio tipo
(`✓ ✗ ●`) y con los iconos de línea ya presentes.

## Tokens adicionales por superficie

### GTK (libadwaita / GTK4)

Libadwaita distingue dos roles del acento:

| Token | Hex | Rol |
|---|---|---|
| `accent_bg_color` | `#6CB6B0` | relleno de botones y selecciones (teal canónico) |
| `accent_fg_color` | `#121212` | texto sobre relleno teal |
| `accent_color`    | `#84C4BF` | acento como texto / icono sobre fondo oscuro (variante más clara de teal) |

GTK3 usa los mismos tres tokens. `theme_bg_color` se fija en `#181818` (ink-1) en
lugar de `#121212` (ink-0) de forma intencionada: en GTK3 ese color rige las
superficies elevadas (toolbars, sidebars, diálogos), donde el escalón de elevación
ink-1 es semánticamente correcto; el lienzo de contenido (`theme_base_color`) sí
va en ink-0.

## Limitaciones conocidas

- **Fuente de Warp**: no se versiona en este repo; hay que fijar JetBrains Mono
  (Nerd Font) en los ajustes de Warp a mano.
- **`syntax-theme` de delta**: se usa `ansi`, que delega en la paleta ANSI del
  terminal (Warp dotmesh la define alineada con la sintaxis). Las decoraciones de
  `+/-`, cabeceras de hunk y números de línea van siempre en colores foreground
  dotmesh explícitos, independientes del tema de bat.
- El sistema de diseño completo (tokens, componentes, kits de UI) vive fuera de
  este repo, en el proyecto de Claude Design. Aquí solo se integra la capa de
  configuración real.

# Estilo: la capa dotmesh

Traduce la paleta de dotmesh a tokens de página. La fuente es `docs/DESIGN.md`.
Siete valores no están en él y salen de
`agents/.agents/skills/dotmesh-design/tokens/colors.css`, que lo deriva:
`--ground` y `--inset` de Paper (`paper-1` y `paper-2`), las cuatro señales de
Paper (`signal-*`) y `--rule-strong` de Ink (`border-strong`). Si cualquiera de
los dos cambia, este fichero cambia con él; no inventes colores fuera de la
paleta.

`artifact-design` dice que el sistema del proyecto va por delante de sus
elecciones. Este es ese sistema: con él no hace falta un plan de paleta propio,
solo decidir la jerarquía de la página concreta.

## Principios

- **Monocromo primero.** Superficies, texto, bordes y botones van en la rampa de
  grises. El color entra solo como señal: estado, delta, error.
  Nunca como decoración ni como acento de marca.
- **La señal marca, el texto informa.** El color de señal va en el punto, el
  borde o la franja de un chip; el texto del chip va en `--ink`. Varias señales
  sobre Paper no llegan a 4,5:1 como texto pequeño.
- **Líneas finas.** Separa con bordes de 1 px en `--rule`. La sombra es para el
  único elemento que tiene que despegarse (la barra de envío fija, por ejemplo),
  no para cada tarjeta.
- **Radios modestos**, de 4 a 6 px. Nada de píldoras gigantes.
- **Tipografía.** Hanken Grotesk para interfaz y títulos. JetBrains Mono para
  todo lo que tenga forma de código: identificadores, rutas, hashes, cifras en
  tabla, horas.
- **Copia sobria.** Sin emoji, sin exclamaciones. Los botones dicen lo que hacen
  («Enviar respuestas», no «¡Listo!»).

## Tokens

Pégalos tal cual. Los tres bloques cubren los tres estados del visor: sin marca
(sigue al sistema), `data-theme="light"` y `data-theme="dark"`.

```html
<link rel="stylesheet" id="fuentes" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
```

```css
:root {
  /* Paper */
  color-scheme: light;
  --ground: #fafafa;
  --surface: #ffffff;
  --inset: #f4f4f4;
  --ink: #181818;
  --ink-2: #5c5c5c;
  --ink-3: #767676;
  --rule: #dedede;
  --rule-strong: #c6c6c6;
  --ok: #3f8a5c;
  --warn: #b9772f;
  --bad: #bd4f4f;
  --info: #4f6fb8;
  --shadow: 0 1px 2px rgb(0 0 0 / .05), 0 4px 14px rgb(0 0 0 / .05);
  --sans: "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* Ink */
    color-scheme: dark;
    --ground: #121212;
    --surface: #181818;
    --inset: #202020;
    --ink: #cecece;
    --ink-2: #9e9e9e;
    --ink-3: #6e6e6e;
    --rule: #2a2a2a;
    --rule-strong: #404040;
    --ok: #a8cba0;
    --warn: #e3c58a;
    --bad: #e59a9a;
    --info: #8fb4e3;
    --shadow: 0 1px 2px rgb(0 0 0 / .4), 0 4px 14px rgb(0 0 0 / .3);
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --ground: #121212;
  --surface: #181818;
  --inset: #202020;
  --ink: #cecece;
  --ink-2: #9e9e9e;
  --ink-3: #6e6e6e;
  --rule: #2a2a2a;
  --rule-strong: #404040;
  --ok: #a8cba0;
  --warn: #e3c58a;
  --bad: #e59a9a;
  --info: #8fb4e3;
  --shadow: 0 1px 2px rgb(0 0 0 / .4), 0 4px 14px rgb(0 0 0 / .3);
}

body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  accent-color: var(--ink);
  font: 400 15.5px/1.55 var(--sans);
  padding-inline: 16px;
}
code, .mono { font-family: var(--mono); font-size: .92em; }
.num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
```

`body` repite el margen y la fuente aunque el esqueleto de publicación ya los
ponga: una página que se publica a sí misma sustituye el documento entero y
pierde ese esqueleto. `color-scheme` hace que los controles nativos (radios,
barras de desplazamiento) sigan al tema, y `accent-color` los deja en la rampa
de grises.

En Ink, `--warn` es gold y no el peach que `colors.css` pone en `--warning`: en
DESIGN.md gold es el estado intermedio (herdr «working», Git) y peach ya
significa Claude.

Los fondos suaves de señal se derivan, no se inventan:
`background: color-mix(in srgb, var(--ok) 14%, var(--surface))`. Así funcionan
en los dos temas sin un hex más.

## Contraste

- `--ink-3` es para lo prescindible (marcas de ronda, pies). Sobre `--ground`
  no llega a 4,5:1 en ningún tema (4,35:1 en Paper, 3,67:1 en Ink); sobre el
  `--surface` blanco de Paper lo roza (4,54:1). Nada que haya que leer para
  decidir va en `--ink-3`.
- El foco de teclado, visible siempre: `outline: 2px solid var(--info)` con
  `outline-offset: 2px`.

## Composición

- **Lo esencial arriba, el detalle plegado.** Cada bloque largo abre con dos o
  tres frases en lenguaje llano (`.resumen`) y guarda debajo, en un
  `<details class="detalle">`, el texto completo, las cifras o la jerga. La
  persona decide cuánto lee; lo que hay que leer para decidir no va plegado.

  ```css
  .resumen { font-size: 1.02rem; }
  .detalle { margin-top: .9rem; border: 1px solid var(--rule); border-radius: 6px; background: var(--surface); }
  .detalle > summary { padding: .5rem .85rem; cursor: pointer; font-size: .86rem; font-weight: 600; color: var(--ink-2); }
  .detalle > summary:hover { color: var(--ink); }
  .detalle[open] > summary { border-bottom: 1px solid var(--rule); }
  .detalle-in { padding: .1rem .95rem .7rem; }
  ```

  El `summary` dice qué hay dentro («Texto de la spec», «Cifras por caso»), no
  «Ver más».
- Anchura de lectura en torno a 70 caracteres; tablas y código en su propio
  contenedor con `overflow-x: auto`.
- La acción de la página (enviar, aprobar) vive en una barra fija abajo. Es el
  elemento que lleva sombra. Si hay varias preguntas, la barra lleva el
  recuento de las contestadas.
- Los estados van en chips con punto de color y texto: «pendiente», «hecha»,
  «fallida», «cambiado en la versión N». La forma del chip dice lo mismo que el
  color, para quien no distinga el color.

# Revisión de spec

Para una spec de más de una pantalla que pide aprobación antes de pasar al
plan. La spec en disco sigue siendo la fuente; la página es la vista para
revisarla.

## Contenido

- La spec en el `<template>`, con una `<section data-id="…">` por cada apartado
  de segundo nivel. El `data-id` sale del título («objetivo», «limites»), no
  cambia entre versiones y sirve para marcar el apartado. No lleva respuesta.
- Cada apartado largo abre con un resumen de dos o tres frases en lenguaje llano
  (`<p class="resumen">`) y guarda el texto de la spec plegado debajo, con el
  patrón de `estilo.md`. Los cortos, como los límites o la lista de ficheros,
  van desplegados.
- Cabecera: nombre de la spec, ruta relativa al repositorio y número de
  apartados.
- Una línea bajo la cabecera dice cómo se contesta: para cambiar o preguntar
  algo, comentar sobre la frase y enviarlo a Claude; cuando todo valga, marcar
  «Apruebo la spec» y enviar.
- Las tablas y el código, en su contenedor con desplazamiento horizontal.

## Controles

- Uno solo: la casilla «Apruebo la spec» (`data-id="aprobada"`), con el botón
  «Enviar» en la barra fija. El botón está desactivado hasta que la casilla se
  marca.
- La casilla no se guarda en el borrador y se pinta desmarcada en cada carga:
  aprobar vale para la versión que se tiene delante, y un comentario puede
  haberla cambiado sin subir la ronda.
- Ni veredicto por apartado ni campo de nota: lo que haya que cambiar va en un
  comentario sobre la frase.

## Estado

```json
{
  "ronda": 1,
  "pendiente": false,
  "cerrada": false,
  "respuestas": { "aprobada": false },
  "cambiadas": { "limites": 3 }
}
```

`cambiadas` apunta, por apartado, la versión del artifact en que cambió por
última vez, y la página la pinta como «cambiado en la versión 3». Es la versión
del artifact, no la ronda: los cambios llegan por comentario, y un comentario no
sube la ronda.

## Al procesar

- Cada comentario sigue el ciclo de `circuito.md`: aplica el cambio en la spec
  del disco, reescribe el apartado en el `<template>`, pon el apartado en
  `cambiadas` con la versión que va a salir (la última publicada más uno),
  republica, contesta en el hilo con lo que cambiaste y resuélvelo. Si la
  publicación choca con una versión más nueva, recalcula el número a partir de
  esa.
- Con `respuestas.aprobada` a `true` y ningún hilo abierto que discuta la spec,
  está aprobada: apúntalo en la spec y en el plan, republica con `cerrada: true`
  y pasa a planificar. Si queda un hilo abierto, contéstalo antes y pregunta en
  el chat si la aprobación sigue en pie.
- Los hilos que no están enviados a Claude se nombran al cerrar.

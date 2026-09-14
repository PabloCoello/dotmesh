# Grill

Para una ronda de tres o más preguntas cerradas. Con una o dos, pregunta en el
chat. La postura la pone `grilling` (converger, no cerrar antes de tiempo); este
fichero solo dice cómo se ve y cómo se contesta.

`grilling` pregunta de una en una. Esta página es la excepción, y solo para
preguntas que no dependen unas de otras: contestarlas juntas no cambia ninguna
respuesta. Una pregunta cuya forma depende de otra no entra en la ronda.

## Contenido

- Cabecera: qué se está decidiendo, en una frase, y el número de ronda.
- Una tarjeta por pregunta. Enunciado de una línea y contexto de tres líneas
  como mucho. Lo que no quepa va plegado debajo, con el patrón de `estilo.md`,
  no delante del enunciado.
- Cuatro preguntas por ronda como mucho. Todas independientes entre sí: si la
  respuesta de una cambia otra, la segunda espera a la ronda siguiente.
- Una línea bajo la cabecera dice que lo que no encaje en ninguna opción se
  comenta sobre la pregunta y se envía a Claude.

## Controles

- Opciones en radio. La recomendada primero, con la etiqueta «recomendada» y una
  línea con el porqué. Los radios de una pregunta comparten `name` (si no, no
  se excluyen) y el `data-id` de la pregunta, y llevan la opción en `value`.
- Sin opción «otra» ni campo libre. Si ninguna opción vale, la persona lo dice
  en un comentario sobre la pregunta. Si el comentario decide, la decisión va a
  `historial` y la pregunta sale del template; si no, la pregunta se reformula.
- Un único botón, «Enviar respuestas», en la barra fija, con el recuento («3 de
  4 contestadas»). Se puede enviar con preguntas sin contestar: vuelven en la
  siguiente ronda.

## Estado

```json
{
  "ronda": 2,
  "pendiente": false,
  "cerrada": false,
  "respuestas": { "p-umbral": "300", "p-base": "fija" },
  "historial": [ { "ronda": 1, "id": "p-sandbox", "pregunta": "...", "respuesta": "..." } ]
}
```

Las preguntas van en el `<template>`; las respuestas, en el estado, con el
`value` de la opción elegida.

## Al procesar la ronda

- Los comentarios sobre una pregunta se contestan en su hilo y se publican en
  el acto, como dice `circuito.md`. Si cambian la pregunta, se reescribe con un
  `data-id` nuevo (`p-umbral` pasa a `p-umbral-2`): la ronda no sube, y con el
  mismo `data-id` el borrador de la pestaña traería la respuesta a la pregunta
  vieja.
- Apunta cada decisión donde viva (spec, plan, ADR) antes de republicar.
- Las contestadas pasan a `historial` y salen del template y de `respuestas`.
  La página las muestra plegadas en un `<details>` al final, con la ronda en que
  se decidieron.
- Cuando no quedan preguntas, la última ronda dice qué se decidió y qué fichero
  lo recoge, y se publica con `cerrada: true`.

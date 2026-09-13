# Grill

Para una ronda de tres o más preguntas cerradas. Con una o dos, pregunta en el
chat. La postura la pone `grilling` (converger, no cerrar antes de tiempo); este
fichero solo dice cómo se ve y cómo se contesta.

`grilling` pregunta de una en una. Esta página es la excepción, y solo para
preguntas que no dependen unas de otras: contestarlas juntas no cambia ninguna
respuesta. Una pregunta cuya forma depende de otra no entra en la ronda.

## Contenido

- Cabecera: qué se está decidiendo, en una frase, y el número de ronda.
- Una tarjeta por pregunta. Enunciado de una línea, contexto de tres líneas como
  mucho. Si el contexto no cabe, resume y enlaza el fichero del repositorio.
- Cuatro preguntas por ronda como mucho. Todas independientes entre sí: si la
  respuesta de una cambia otra, la segunda espera a la ronda siguiente.

## Controles

- Opciones en radio. La recomendada primero, con la etiqueta «recomendada» y una
  línea con el porqué.
- Una opción «otra» que abre un campo de texto. Si la persona la usa y la
  respuesta no deja clara la decisión, la pregunta vuelve reformulada en la
  ronda siguiente.
- Un único botón, «Enviar respuestas», en la barra fija, con el recuento («3 de
  4 contestadas»). Se puede enviar con preguntas sin contestar: vuelven en la
  siguiente ronda.

## Estado

```json
{
  "ronda": 2,
  "pendiente": false,
  "cerrada": false,
  "respuestas": { "p-umbral": { "opcion": "300" }, "p-base": { "opcion": "otra", "texto": "..." } },
  "historial": [ { "ronda": 1, "id": "p-sandbox", "pregunta": "...", "respuesta": "..." } ]
}
```

Las preguntas van en el `<template>` con `data-id`; las respuestas, en el estado.

## Al procesar la ronda

- Apunta cada decisión donde viva (spec, plan, ADR) antes de republicar.
- Las contestadas pasan a `historial` y salen del template y de `respuestas`.
  La página las muestra plegadas en un `<details>` al final, con la ronda en que
  se decidieron.
- Cuando no quedan preguntas, la última ronda dice qué se decidió y qué fichero
  lo recoge, y se publica con `cerrada: true`.

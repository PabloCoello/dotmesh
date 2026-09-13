# Revisión de spec

Para una spec de más de una pantalla que pide aprobación antes de pasar al
plan. La spec en disco sigue siendo la fuente; la página es la vista para
revisarla.

## Contenido

- La spec entera en el `<template>`, con una `<section data-id="…">` por cada
  apartado de segundo nivel. El `data-id` sale del título («objetivo»,
  «limites») y no cambia entre rondas.
- Cabecera: nombre de la spec, ruta relativa al repositorio, ronda, y el
  recuento «5 de 9 apartados revisados».
- Las tablas y el código, en su contenedor con desplazamiento horizontal.

## Controles

- Por apartado, tres radios en línea: `vale`, `cambia`, `duda`. Con `cambia` o
  `duda`, un campo de nota que pide qué cambiar o qué no está claro.
- Una casilla global, «Apruebo la spec» (`data-id="aprobada"`), que solo se
  activa cuando todos los apartados están en `vale`.
- Un único botón, «Enviar revisión», en la barra fija.
- Una línea bajo la cabecera recuerda que para una frase concreta sirven los
  comentarios anclados de la página.

## Estado

```json
{
  "ronda": 1,
  "pendiente": false,
  "cerrada": false,
  "respuestas": { "objetivo": { "veredicto": "vale" }, "limites": { "veredicto": "cambia", "nota": "..." }, "aprobada": false },
  "replicas": { "limites": "Cambiado: ..." },
  "cambiadas": { "limites": 2 }
}
```

## Al procesar la ronda

- Aplica cada `cambia` en la spec del disco y deja en `replicas` una línea con
  lo que cambiaste. Cada `duda` se contesta en `replicas` y, si la duda revela
  un hueco, también se corrige la spec.
- Reescribe el `<template>` desde la spec corregida, con el escapado que pide
  el paso 6 de `circuito.md`. Los apartados que cambian entran en `cambiadas`
  con la ronda, la página los marca («cambiado en la ronda 2») y su veredicto
  sale de `respuestas`. Los que no cambian conservan el suyo.
- Con `respuestas.aprobada` a `true` y todos los apartados en `vale`, la spec
  está aprobada: apúntalo en la spec y en el plan, republica con `cerrada: true`
  y pasa a planificar. La casilla la desactiva la página, no la lectura: si
  `aprobada` llega a `true` con algún apartado sin `vale`, no la des por buena,
  quítala del estado y dilo en la réplica de ese apartado.
- Los hilos de comentarios que atendiste se contestan y se resuelven; los que no
  están enviados a Claude se nombran al cerrar la ronda.

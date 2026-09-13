# Informe de resultados

Para cerrar una medición o una tarea con cifras que alguien va a discutir. La
prosa del informe sigue `anti-ai-style` y, en español, `castellano-peninsular`:
cárgalas antes de redactar.

Un subagente puede publicar un informe de una vez. Si el informe recoge
respuesta, lo publica la sesión principal.

## Contenido

- **La respuesta arriba**, en una a tres frases: qué se midió y qué salió. Sin
  titular de efecto delante.
- Debajo, las cifras. Cada una con su origen: medición propia (con la ruta del
  resultado, relativa al repositorio), transcript o informe externo. Una cifra
  sin origen no entra.
- Intervalos, no puntos, cuando hay réplicas. Con una sola corrida, se dice
  que es una sola.
- Tablas con cifras en mono y `tabular-nums`, alineadas a la derecha.
- Un gráfico solo si compara más de tres valores o muestra una evolución.
  Dibujado a escala: una sola escala coloca marcas, ejes y etiquetas, y el eje
  empieza en cero salvo que se diga lo contrario.
- Lo que falló o no se pudo medir, con el mismo peso que lo que salió bien.
- Al final, qué decisión permite el resultado y qué la reabriría.

## Controles (solo si recoge respuesta)

- Por conclusión, dos radios: «de acuerdo», «lo discuto», con nota en el
  segundo.
- «Siguiente paso» en un `select` con `data-id="siguiente"` y las opciones que
  propones, la recomendada primero.
- Un único botón, «Enviar», en la barra fija.

## Estado

```json
{
  "ronda": 1,
  "pendiente": false,
  "cerrada": false,
  "respuestas": { "c-coste": { "acuerdo": false, "nota": "..." }, "siguiente": "ampliar-corpus" }
}
```

## Al procesar

Una conclusión discutida se contesta en la página. Si la discusión cambia la
conclusión, se corrige también el resultado escrito en el repositorio. Cuando
no queda ninguna en discusión y el siguiente paso está elegido, se apunta en el
plan y se publica con `cerrada: true`.

# Informe de resultados

Para cerrar una medición o una tarea con cifras que alguien va a discutir. La
prosa del informe sigue `anti-ai-style` y, en español, `castellano-peninsular`:
cárgalas antes de redactar.

Un subagente puede publicar un informe de una vez. Si el informe espera
respuesta, lo publica la sesión principal, que es la que recibe los avisos.

## Contenido

- **La respuesta arriba**, en una a tres frases de lenguaje llano: qué se
  midió, qué salió y qué decisión permite. Sin titular de efecto delante. Si
  algo falló o no se pudo medir y eso cambia la lectura, se dice aquí.
- **El detalle, plegado debajo**, uno por conclusión o por medición, con el
  patrón de `estilo.md`: las cifras, el método y lo que reabriría la decisión.
  Quien quiera comprobar lo despliega.
- Cada cifra con su origen: medición propia (con la ruta del resultado,
  relativa al repositorio), transcript o informe externo. Una cifra sin origen
  no entra.
- Intervalos, no puntos, cuando hay réplicas. Con una sola corrida, se dice
  que es una sola.
- Tablas con cifras en mono y `tabular-nums`, alineadas a la derecha.
- Un gráfico solo si compara más de tres valores o muestra una evolución.
  Dibujado a escala: una sola escala coloca marcas, ejes y etiquetas, y el eje
  empieza en cero salvo que se diga lo contrario.
- Lo que falló o no se pudo medir, con el mismo peso que lo que salió bien.

## Respuesta

- Una conclusión se discute con un comentario sobre ella, enviado a Claude. No
  lleva control.
- Si el informe pide elegir el siguiente paso, un `select` con
  `data-id="siguiente"` y las opciones que propones, la recomendada primero, y
  un único botón, «Enviar», en la barra fija. Es el único control.

## Estado (solo con el `select`)

```json
{
  "ronda": 1,
  "pendiente": false,
  "cerrada": false,
  "respuestas": { "siguiente": "ampliar-corpus" }
}
```

## Al procesar

Cada conclusión discutida se contesta en su hilo. Si la discusión cambia la
conclusión, se corrige el resultado escrito en el repositorio y el informe se
republica con el cambio. Con el siguiente paso elegido y ningún hilo abierto que
lo cuestione, se apunta en el plan y se publica con `cerrada: true`.

# Progreso

Para seguir una tanda larga (una corrida del banco, una migración por fases) sin
mirar la terminal. Solo lectura en esta versión.

## Coste y granularidad

Cada avance es una republicación, o sea una llamada a `Artifact` desde la sesión
principal. Por eso la granularidad es por fase o por hito («brazo A arrancado»,
«12 de 20 casos»), nunca una barra continua. Si el proceso corre en otro pane,
la sesión espera el hito (con `herdr agent wait` o una espera en segundo plano) y
republica al llegar.

Existe una vía más barata que no está probada: declarar `db` y escribir el
avance con `write_db`, que la página pinta con `onSnapshot` sin republicar el
HTML. Declarar `db` se pregunta antes (ver `SKILL.md`), y hasta verificarla la
vía por defecto es republicar.

## Contenido

- Arriba, qué corre, desde cuándo y cuál es el tope (de coste, de tiempo).
- Una fila por fase o brazo con un chip de estado (`pendiente`, `en curso`,
  `hecha`, `fallida`), la hora de inicio y fin en mono y con zona horaria, y el
  coste si se conoce.
- Si hay un contador, se escribe como texto («12 de 20») y, si ayuda, con una
  barra estática del último valor.
- Una fase fallida lleva el error en una línea y dónde está el log, con ruta
  relativa al repositorio.
- Al terminar, la página pasa a informe: enlaza el informe de resultados o se
  convierte en él siguiendo `informe.md`.

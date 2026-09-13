# 0002. El flujo de fases sigue siendo obligatorio

- **Estado:** aceptada el 12-09-2026.
- **Punto del backlog:** K-3, que responde a la recomendación E2 de la auditoría
  externa.

## Contexto

`AGENTS.md` obliga a cargar la skill dueña de cada fase en todo cambio no
trivial: el flujo es opt-out, no opt-in. La auditoría (E2) propone quitar el
mandato o dejarlo en opt-in para tareas medianas. Se apoya en SkillsBench, donde
13 de 87 tareas empeoran con skills y la guía rígida desplaza el razonamiento en
tareas simples.

El mandato se puso porque las skills no se cargaban cuando tocaba. Lo medido en
esta máquina:

- Experimento headless del 28-06-2026: con la persona `maker`, 3 de 3 sesiones
  delegaron y cargaron skills; sin ella, 0 de 3. Una segunda corrida dio 22
  delegaciones y 19 cargas de skill, frente a 0 y 0.
- Estudio maker contra vanilla, cerrado el 12-09-2026: el resultado que el
  informe da por firme es el alcance del encargo del revisor,
  +34,6 pp con IC 90 % [+18,8, +48,1]. El estudio no midió vanilla: sus brazos
  A0 y A2 no llegaron a correr.
- Bloque I2 del examen del flujo, 02-09-2026: 31/31 en los dos brazos, con la
  orquestación a 4,87 veces el coste y 6,66 veces el tiempo. Con ese dato ya se
  subió el umbral de delegación; la carga de skills por fase no se tocó.

## Decisión

El mandato se queda: en todo cambio no trivial se carga la skill dueña de cada
fase.

## Alternativas

- **Opt-in para tareas medianas, como propone E2.** Devuelve la situación que
  motivó el mandato, en la que las skills no se cargaban. La evidencia a favor
  es de SkillsBench, sobre tareas y skills que no son las de este repositorio, y
  no hay medición propia de que el mandato empeore el resultado.

## Consecuencias

- Cada fase paga en contexto la carga de su skill.
- El riesgo que señala la auditoría en tareas simples queda acotado por el
  umbral de esfuerzo de `AGENTS.md`: una edición trivial de un solo fichero se
  salta el flujo.
- Mientras no corra un brazo vanilla, no hay dato propio de que el flujo mejore
  el resultado frente a no tenerlo.

## Qué la reabriría

- Una corrida headless en la que el brazo sin persona cargue de forma fiable la
  skill dueña de cada fase.
- Que la ablación por skill (T16) dé a una skill de fase un delta por debajo de
  +2 pp, el umbral de retirada fijado antes de correrla.
- Un brazo vanilla en el banco de T15 que iguale el resultado del flujo con
  menos coste.

## Fuentes

- Experimento headless del 28-06-2026: notas de sesión, fuera del repositorio.
- Informe del estudio, `.ai/tasks/2026-09-10-estudio-maker-vs-vanilla/informe.md`:
  línea 164 (efecto), 271 (sin vanilla) y 314 (resultado firme).
- `AGENTS.md`, apartado «Long implementations and context» (bloque I2).
- Umbral de la ablación: `.ai/tasks/2026-09-12-pendientes-estudios/plan.md`,
  líneas 44-45.
- Auditoría externa, líneas 43 y 100 (recomendación E2).

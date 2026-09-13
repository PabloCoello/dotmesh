# 0003. Los hooks de Bash no se fusionan

- **Estado:** aceptada el 12-09-2026.
- **Punto del backlog:** H-1, que responde a la recomendación S3 de la auditoría
  externa.

## Contexto

Antes de cada llamada a Bash corren tres hooks de `PreToolUse`, cada uno en su
proceso. `block-dangerous-git.sh` bloquea el git destructivo y la atribución de
LLM en los commits. `remind-review-gate.sh` y `remind-load-skills.sh` solo
añaden un recordatorio. La auditoría propone juntarlos en un dispatcher para
ahorrar el arranque de dos procesos por llamada.

Medido el 12-09-2026 con el binario 2.1.263, como media de diez invocaciones por
hook con una carga de Bash real:

| Hook | Media |
|---|---|
| `block-dangerous-git.sh` | 49 ms |
| `remind-review-gate.sh` | 9 ms |
| `remind-load-skills.sh` | 12 ms |
| Total por llamada | 70 ms |

En una sesión de 500 llamadas a Bash son unos 35 s. Fusionar ahorra como mucho lo
que cuestan hoy los dos hooks pequeños, unos 20 ms por llamada. Los 49 ms del
guardarraíl son su trabajo y siguen ahí con dispatcher o sin él.

## Decisión

Los tres hooks siguen separados.

## Alternativas

- **Un dispatcher único.** Ahorra unos 20 ms por llamada, unos 10 s en una
  sesión de 500, a cambio de meter en el mismo fichero un guardarraíl que
  bloquea y dos avisos que no bloquean. Un error en el dispatcher dejaría sin
  guardarraíl todas las llamadas a Bash.

## Consecuencias

- Cada llamada a Bash paga unos 70 ms de hooks.
- Si esa latencia llega a notarse, lo que hay que perfilar es
  `block-dangerous-git.sh`, que se lleva el 70 % del coste.

## Qué la reabriría

- Un remedido con el mismo método en el que el arranque de procesos pase a ser
  la mayor parte del coste, y no el guardarraíl.
- Más hooks sobre Bash: el ahorro de fusionarlos crece con cada uno.

## Fuentes

- Medición del 12-09-2026: ficha H-1 del backlog de mejoras,
  `.ai/tasks/2026-09-12-pendientes-estudios/mejoras-auditoria.html`.
- Registro de los hooks: `claude/.claude/settings.json`, entrada de
  `hooks.PreToolUse` con `matcher: "Bash"`.
- Auditoría externa, recomendación S3.

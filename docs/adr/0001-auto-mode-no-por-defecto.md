# 0001. Auto mode no es el modo de permisos por defecto

- **Estado:** aceptada el 12-09-2026.
- **Punto del backlog:** S-2, que responde a la recomendación S1 de la auditoría
  externa.

## Contexto

En esta máquina `permissions.defaultMode` es `bypassPermissions`: no hay
diálogos de permiso y los hooks eran el único freno. La auditoría (S1) ofrece
dos salidas: (a) el sandbox nativo de Bash con `allowUnsandboxedCommands: false`
o (b) auto mode, donde un clasificador evalúa cada acción antes de ejecutarla.

La opción (a) se adoptó el 13-09-2026 en el commit `8f8632d`, con una diferencia:
`allowUnsandboxedCommands` queda en `true` para que un comando concreto pueda
salir de la caja tras un fallo con evidencia. Quedaba por decidir si (b) pasa a
ser el modo por defecto.

`claude auto-mode defaults` lista las reglas del clasificador: 70 de denegación
blanda, 1 de denegación dura y 17 de permiso, iguales en los binarios 2.1.263 y
2.1.270. Cuatro familias saltarían en el trabajo diario de este repositorio:

- **Local Operations**, porque el alcance de trabajo de dotmesh es `~/`.
- **Self-Modification/Persistence**, porque el repositorio edita la propia
  configuración de Claude Code.
- **Credential Exploration/Materialization**, por el symlink de
  `medir/out/*/config/` que montan los medidores.
- **Git Destructive**, que se solapa con `block-dangerous-git.sh`. El hook
  además comprueba la atribución de LLM en los commits, y el clasificador no.

El riesgo que motivó la pregunta es real. El 12-09-2026 un medidor dejó un
agente sin permisos, cuarenta minutos y sin supervisión, junto a la instalación
viva de Stow. No pasó nada, pero el agente podía haber ejecutado `stow -R`.

## Decisión

El modo por defecto sigue siendo `bypassPermissions`, con el sandbox de Bash
activo. Auto mode se usa por sesión, cuando conviene, con
`claude --permission-mode auto`.

## Alternativas

- **Auto mode por defecto.** Con esas cuatro familias, la mayor parte del
  trabajo en `~/` acabaría en diálogo. Un diálogo frecuente termina aprobándose
  sin leer, y entonces el freno deja de serlo.

## Consecuencias

- Edit, Write y las herramientas MCP no pasan por ningún clasificador. Las
  cubren las reglas de `permissions.deny` y los hooks.
- `stow` corre fuera de la caja y `block-dangerous-git.sh` solo cubre Git, así
  que un `stow -D` destructivo tiene como único freno la prosa de `AGENTS.md`.
  Es candidato a hook en la semana de uso del sandbox (T5b).

## Qué la reabriría

- Que auto mode admita declarar `~/` como alcance de confianza, o que cambie la
  familia Local Operations.
- Un incidente con Edit, Write o MCP que un clasificador habría parado.

## Fuentes

- `claude auto-mode defaults`, en los binarios 2.1.263 y 2.1.270.
- Ficha S-2 del artifact de mejoras,
  `.ai/tasks/2026-09-12-pendientes-estudios/mejoras-auditoria.html`.
- El hueco de `stow -D`: `.ai/tasks/2026-09-12-pendientes-estudios/plan.md`,
  líneas 323-325.
- El incidente del 12-09: `.ai/tasks/2026-09-12-pendientes-estudios/pendientes.md`,
  líneas 37-41.
- Auditoría externa, línea 104 (recomendación S1).

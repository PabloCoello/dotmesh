---
description: Snapshot estructurado del estado de trabajo.
agent: build
---

Escribe o actualiza un checkpoint bajo el directorio de tarea activo:

```
.ai/tasks/YYYY-MM-DD-<slug>/checkpoint.md
```

Si no hay tarea activa, usa `.ai/tasks/session-<fecha>/checkpoint.md`.
**No crees nunca `CHECKPOINT.md` en la raíz del proyecto** — va contra la política
de artefactos del repo.

El checkpoint debe incluir:

- **Fecha y rama**.
- **Hecho en esta sesión**: lista concreta de cambios.
- **Pendiente**: qué queda y dónde está cada pieza.
- **Decisiones tomadas**: con justificación breve.
- **Próximos pasos**: qué hacer al retomar.

Alternativamente, si la sesión va a continuar en otro agente, delega en la skill
`handoff` en lugar de escribir el checkpoint manualmente.

Cuando escribas en español, aplica `anti-ai-style` y `castellano-peninsular`. Sin
relleno.

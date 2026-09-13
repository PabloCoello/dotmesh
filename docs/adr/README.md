# Registro de decisiones

Decisiones de configuración que alguien podría querer revisar: qué se mantuvo o
se descartó, por qué y qué la reabriría.

| ADR | Decisión | Fecha |
|---|---|---|
| [0001](0001-auto-mode-no-por-defecto.md) | Auto mode no es el modo de permisos por defecto | 12-09-2026 |
| [0002](0002-flujo-de-fases-obligatorio.md) | El flujo de fases sigue siendo obligatorio | 12-09-2026 |
| [0003](0003-hooks-de-bash-separados.md) | Los hooks de Bash no se fusionan | 12-09-2026 |

Las reservas a la auditoría externa que no son decisiones están en
[`../RESERVAS-AUDITORIA.md`](../RESERVAS-AUDITORIA.md).

## Convenciones

- Este repositorio no versiona `.ai/`: una fuente con esa ruta solo existe en la
  máquina donde se midió. La auditoría externa, «Auditoría Crítica de la
  Configuración de Claude Code de dotmesh_.md», tampoco está versionada.
- Una cifra que se puede reproducir lleva el comando que la produce.
- Cada ADR lleva Estado, Contexto, Decisión, Alternativas, Consecuencias, Qué la
  reabriría y Fuentes.

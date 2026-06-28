# Agent skills

Fuente de verdad de las skills personales:

```text
agents/.agents/skills/
```

Cada skill vive en `agents/.agents/skills/<skill-name>/SKILL.md` y debe tener frontmatter con `name` y `description`. La descripción es importante: los agentes la usan para decidir cuándo cargar la skill.

## Criterio de adaptación

Estas skills están adaptadas para trabajo diario con agentes en distintos repositorios. No son una copia literal de ningún pack externo.

Al incorporar o actualizar una skill:

- conserva procesos, límites operativos, señales de alerta y verificación;
- elimina ejemplos demasiado ligados a una pila concreta si no aportan comportamiento;
- adapta ejemplos para que sirvan en código, scripts, CLIs, documentación y configuración;
- evita duplicar reglas que ya cubre otra skill;
- ajusta el `description` para que se active solo cuando aporte valor;
- prefiere texto corto y accionable frente a explicaciones largas.

## Core pack diario

Estas 14 skills forman el conjunto base de ingeniería:

| Skill | Cuándo usarla |
|---|---|
| `idea-refine` | Para convertir una idea vaga en opciones, criterios y siguiente paso. |
| `spec-driven-development` | Para definir requisitos antes de cambios no triviales. |
| `planning-and-task-breakdown` | Para partir una spec o tarea grande en unidades verificables. |
| `context-engineering` | Para preparar contexto al iniciar sesión, cambiar de proyecto o detectar deriva. |
| `source-driven-development` | Para decisiones que dependen de documentación o versiones actuales. |
| `api-and-interface-design` | Para contratos, CLIs, APIs, módulos, formatos y límites entre componentes. |
| `incremental-implementation` | Para implementar en slices pequeñas y verificables. |
| `test-driven-development` | Para lógica, bugs o cambios de comportamiento que deben probarse. |
| `debugging-and-error-recovery` | Para fallos de tests, build, ejecución o comportamiento inesperado. |
| `code-review-and-quality` | Para revisar cambios antes de darlos por buenos. |
| `code-simplification` | Para simplificar código que funciona pero es más complejo de lo necesario. |
| `security-and-hardening` | Para secretos, inputs externos, permisos, dependencias, logs o datos sensibles. |
| `git-workflow-and-versioning` | Para commits, ramas, staging, conflictos y organización de cambios. |
| `documentation-and-adrs` | Para registrar decisiones, interfaces, reglas de proyecto y contexto duradero. |

## Skills locales adicionales

Estas skills se mantienen como parte del setup personal, aunque no forman parte del core pack de ingeniería:

| Skill | Cuándo usarla |
|---|---|
| `anti-ai-style` | Para revisar o redactar textos evitando estilo genérico de IA. |
| `castellano-peninsular` | Para textos en español peninsular formal. |
| `dotmesh-design` | Para generar interfaces y assets con el sistema de diseño dotmesh (Paper · Ink · Syntax). Solo a petición: se invoca con `/dotmesh-design` y no se auto-aplica (`disable-model-invocation`). `docs/DESIGN.md` sigue siendo la fuente de verdad. |

## Interrogatorio, dominio y traspaso

Adaptadas de [mattpocock/skills](https://github.com/mattpocock/skills) (MIT). Complementan al agente `debate` (exploración divergente); no lo sustituyen.

| Skill | Cuándo usarla |
|---|---|
| `grilling` | Para interrogar un plan o diseño hasta resolver cada rama del árbol de decisiones. |
| `grill-me` | Disparador de cara al usuario para iniciar una sesión de interrogatorio. |
| `grill-with-docs` | Como `grilling`, pero además construye el glosario (`CONTEXT.md`) y registra ADRs sobre la marcha. |
| `domain-modeling` | Para fijar la terminología del dominio (lenguaje ubicuo) y mantener `CONTEXT.md`. |
| `handoff` | Para compactar la sesión en un traspaso entre OpenCode, Claude Code y Codex, o al pausar con trabajo en curso. |

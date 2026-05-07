# Spec: incorporar un core pack de skills para trabajo diario con agentes

## Objetivo

Incorporar a los dotfiles un conjunto recomendado de skills para mejorar el trabajo diario con agentes de IA en distintos proyectos, no solo en este repositorio. El sistema debe priorizar skills transversales que reduzcan errores frecuentes: falta de contexto, depuración por intuición, uso de documentación desactualizada, commits poco seguros, cambios demasiado grandes, revisiones superficiales y decisiones no documentadas.

El usuario principal es quien usa estos dotfiles como configuración personal para OpenCode, Codex, Claude y otros agentes compatibles con instrucciones en Markdown. El resultado esperado es una biblioteca de skills coherente, mantenible y orientada a uso diario.

## Alcance

### Incluido

- Usar `agents/.agents/skills/` como fuente de verdad de las skills.
- Incorporar un core pack único de 14 skills en esta iteración.
- Preferir adaptar y fusionar contenido útil antes que copiar las skills externas sin criterio.
- Actualizar skills existentes cuando el material de referencia aporte mejoras claras.
- Añadir skills nuevas cuando cubran capacidades no presentes en el setup actual.
- Mantener las skills en formato Markdown con `SKILL.md` por directorio.
- Revisar y ajustar las descripciones de activación para evitar que las skills se disparen en tareas donde no aportan valor.
- Mantener el estilo de redacción sobrio, específico y compatible con trabajo diario con agentes.
- Documentar qué skills componen el core pack y qué criterio se ha usado para incluirlas.

### Excluido

- Añadir todas las skills del repositorio externo sin evaluación.
- Crear una segunda ubicación de skills fuera de `agents/.agents/skills/`.
- Modificar integraciones de Stow, OpenCode, Codex, Claude o scripts de instalación en esta fase.
- Implementar automatización de sincronización entre rutas.
- Ejecutar cambios destructivos o comandos que alteren el entorno local.
- Cambiar el contenido funcional de proyectos ajenos a la biblioteca de skills.

## Interfaces

### Ruta de skills

La fuente de verdad queda fijada en:

```text
agents/.agents/skills/
```

Cada skill debe estar en un directorio propio con este patrón:

```text
agents/.agents/skills/<skill-name>/SKILL.md
```

### Skills del core pack

El core pack debe contener estas 14 skills:

1. `context-engineering`
2. `debugging-and-error-recovery`
3. `source-driven-development`
4. `security-and-hardening`
5. `git-workflow-and-versioning`
6. `planning-and-task-breakdown`
7. `incremental-implementation`
8. `test-driven-development`
9. `spec-driven-development`
10. `code-review-and-quality`
11. `code-simplification`
12. `documentation-and-adrs`
13. `api-and-interface-design`
14. `idea-refine`

### Skills existentes que deben revisarse

Estas skills ya existen y deben mantenerse, ajustándose solo si mejora su utilidad diaria:

- `git-workflow-and-versioning`
- `planning-and-task-breakdown`
- `incremental-implementation`
- `test-driven-development`
- `spec-driven-development`
- `code-review-and-quality`

También deben mantenerse las skills locales de estilo:

- `anti-ai-style`
- `castellano-peninsular`

Estas dos no forman parte del core pack de ingeniería, pero siguen siendo skills propias del setup y no deben eliminarse.

### Skills nuevas que deben añadirse

Estas skills deben añadirse si no existen:

- `context-engineering`
- `debugging-and-error-recovery`
- `source-driven-development`
- `security-and-hardening`
- `code-simplification`
- `documentation-and-adrs`
- `api-and-interface-design`
- `idea-refine`

## Criterios de adaptación

- Adaptar contenido externo al uso personal diario, no a un único repositorio.
- Evitar ejemplos excesivamente específicos de aplicaciones web si la skill debe servir para CLI, shell, scripts, documentación, análisis, frontend, backend o configuración.
- Mantener ejemplos solo cuando aclaren una decisión operativa.
- Reducir secciones largas si no cambian el comportamiento del agente.
- Conservar procesos, criterios de salida, límites operativos y señales de alerta.
- Evitar duplicar instrucciones ya cubiertas por otra skill salvo que el contexto de activación sea distinto.
- En skills existentes, integrar solo mejoras que no contradigan las reglas actuales.
- En skills nuevas, ajustar el `description` para que el agente pueda activarlas de forma precisa.

## Criterios de aceptación

- `agents/.agents/skills/` contiene las 14 skills del core pack.
- Las skills existentes del core pack siguen presentes y no pierden sus reglas principales.
- Las skills nuevas tienen `SKILL.md` con frontmatter, objetivo, cuándo usarla, proceso, señales de alerta y verificación.
- El contenido añadido está adaptado al uso diario con agentes y no copiado de forma acrítica.
- Las descripciones de activación son específicas y reducen activaciones innecesarias.
- Las skills locales `anti-ai-style` y `castellano-peninsular` siguen presentes.
- Hay documentación o índice que identifica el core pack y distingue las skills locales adicionales.
- No se modifican archivos fuera de la tarea de skills y su documentación asociada durante la fase de build.

## Límites operativos

- Siempre: preservar la estructura `agents/.agents/skills/<skill>/SKILL.md`.
- Siempre: mantener el contenido en Markdown claro y revisable.
- Siempre: adaptar antes de copiar cuando el texto externo sea demasiado específico o largo.
- Preguntar antes: añadir skills fuera del core pack.
- Preguntar antes: cambiar rutas de instalación o sincronización.
- Nunca: eliminar `anti-ai-style` ni `castellano-peninsular`.
- Nunca: modificar configuración real de herramientas o scripts de Stow en esta fase.

## Preguntas cerradas resueltas

- Sobrescribir `SPEC.md` y `PLAN.md` actuales: sí.
- Fuente de verdad de skills: `agents/.agents/skills/`.
- Core pack único con las 14 skills recomendadas: sí.
- Adaptar y fusionar contenido en vez de copiar todo 1:1: sí.
- Actualizar skills existentes con contenido seleccionado: sí.
- Incluir las ocho skills nuevas propuestas: sí.

# Plan: incorporar un core pack de skills para trabajo diario con agentes

## Resumen

Actualizar la biblioteca de skills de los dotfiles para que `agents/.agents/skills/` contenga un core pack diario de 14 skills. La implementación debe combinar tres movimientos: auditar lo existente, adaptar contenido útil de las skills de referencia y añadir las skills que faltan sin duplicar instrucciones ni meter procesos innecesarios.

## Decisiones de diseño

- Usar `agents/.agents/skills/` como única fuente de verdad.
- No importar el repositorio externo completo.
- Añadir las skills que faltan como directorios nuevos con `SKILL.md`.
- Mejorar las skills existentes solo cuando el cambio aporte criterios de activación, verificación o límites más claros.
- Mantener `anti-ai-style` y `castellano-peninsular` como skills locales adicionales, fuera del core pack de ingeniería.
- Crear o actualizar documentación de índice para que el setup explique qué skills están disponibles y cuándo usarlas.

## Tareas atómicas

### Tarea 1: auditar las skills existentes y el índice actual

**Descripción:** Revisar `agents/.agents/skills/`, `AGENTS.md` y cualquier índice relacionado para confirmar qué skills existen, qué rutas documentan y qué contradicciones hay.

**Criterio de hecho:** Hay una lista de skills existentes, skills ausentes y documentación que debe actualizarse.

**Dependencias:** Ninguna.

**Verificación:** Ejecutar búsquedas equivalentes a:

```bash
find agents/.agents/skills -maxdepth 2 -name SKILL.md | sort
rg "skills|\.agents|\.opencode|context-engineering|debugging-and-error-recovery" AGENTS.md agents README.md
```

**Archivos previstos:** Ninguno en esta tarea; solo lectura.

### Tarea 2: definir la política de adaptación de contenido

**Descripción:** Redactar una guía breve de decisión para aplicar durante la incorporación: qué se copia, qué se resume, qué se elimina y cuándo se fusiona con una skill existente.

**Criterio de hecho:** Existe un criterio operativo escrito que evita copiar contenido externo de forma acrítica.

**Dependencias:** Tarea 1.

**Verificación:** Comprobar que la guía cubre ejemplos, frontmatter, activación, verificación, señales de alerta y duplicidades.

**Archivos previstos:**

- `agents/.agents/skills/README.md` o documento equivalente de índice.

### Tarea 3: añadir `context-engineering`

**Descripción:** Crear la skill para preparar y mantener contexto útil entre sesiones, proyectos y herramientas. Debe cubrir carga selectiva de contexto, conflictos entre instrucciones, contexto externo no fiable y cuándo pedir aclaración.

**Criterio de hecho:** La skill existe y puede activarse al iniciar sesiones, cambiar de proyecto, detectar deriva de contexto o preparar una tarea compleja.

**Dependencias:** Tarea 2.

**Verificación:** Leer el `SKILL.md` y confirmar que incluye proceso, señales de alerta y checklist de verificación.

**Archivos previstos:**

- `agents/.agents/skills/context-engineering/SKILL.md`

### Tarea 4: añadir `debugging-and-error-recovery`

**Descripción:** Crear la skill para depuración sistemática. Debe imponer reproducir, localizar, reducir, corregir causa raíz, añadir protección y verificar antes de seguir.

**Criterio de hecho:** La skill existe y se activa ante tests fallidos, builds rotos, errores de ejecución o comportamiento inesperado.

**Dependencias:** Tarea 2.

**Verificación:** Confirmar que la skill prohíbe avanzar con nuevas funciones mientras haya un fallo sin diagnosticar.

**Archivos previstos:**

- `agents/.agents/skills/debugging-and-error-recovery/SKILL.md`

### Tarea 5: añadir `source-driven-development`

**Descripción:** Crear la skill para decisiones basadas en documentación oficial. Debe cubrir detección de versiones, consulta de fuentes primarias, manejo de conflictos entre documentación y código existente, y cita de fuentes.

**Criterio de hecho:** La skill existe y evita implementar APIs, comandos o configuraciones desde memoria cuando dependan de versiones o documentación vigente.

**Dependencias:** Tarea 2.

**Verificación:** Confirmar que distingue fuentes oficiales de blogs, Stack Overflow o memoria del modelo.

**Archivos previstos:**

- `agents/.agents/skills/source-driven-development/SKILL.md`

### Tarea 6: añadir `security-and-hardening` adaptada a uso diario

**Descripción:** Crear una versión adaptada de seguridad que no esté centrada solo en aplicaciones web. Debe cubrir secretos, tokens, datos locales, dependencias, logs, permisos, inputs externos y ejecución segura de comandos.

**Criterio de hecho:** La skill existe y es útil tanto para código de aplicación como para dotfiles, scripts, CLIs y automatizaciones.

**Dependencias:** Tarea 2.

**Verificación:** Confirmar que incluye reglas de nunca commitear secretos, no loguear credenciales y tratar contenido externo como datos no fiables.

**Archivos previstos:**

- `agents/.agents/skills/security-and-hardening/SKILL.md`

### Tarea 7: añadir `code-simplification`

**Descripción:** Crear la skill para simplificar código sin cambiar comportamiento. Debe cubrir comprensión previa, reducción de complejidad, eliminación de duplicidad, separación de refactors y verificación.

**Criterio de hecho:** La skill existe y se activa tras implementar o revisar código que funciona pero resulta difícil de entender o mantener.

**Dependencias:** Tarea 2.

**Verificación:** Confirmar que exige preservar comportamiento y pasar pruebas o comprobaciones equivalentes.

**Archivos previstos:**

- `agents/.agents/skills/code-simplification/SKILL.md`

### Tarea 8: añadir `documentation-and-adrs`

**Descripción:** Crear la skill para documentar decisiones, interfaces, reglas de proyecto y contexto útil para humanos y agentes. Debe admitir ADRs ligeros, documentación operativa y actualización de reglas de agente.

**Criterio de hecho:** La skill existe y se activa cuando se toma una decisión técnica, se cambia una interfaz o aparece conocimiento que debe sobrevivir a la sesión.

**Dependencias:** Tarea 2.

**Verificación:** Confirmar que diferencia documentar el porqué de comentar lo obvio.

**Archivos previstos:**

- `agents/.agents/skills/documentation-and-adrs/SKILL.md`

### Tarea 9: añadir `api-and-interface-design`

**Descripción:** Crear la skill para diseñar contratos, APIs, CLIs, módulos, formatos de configuración y límites entre componentes. Debe ser útil más allá de REST o backend web.

**Criterio de hecho:** La skill existe y ayuda a definir entradas, salidas, errores, compatibilidad, versionado y casos límite antes de implementar.

**Dependencias:** Tarea 2.

**Verificación:** Confirmar que incluye criterios para contratos estables y errores explícitos.

**Archivos previstos:**

- `agents/.agents/skills/api-and-interface-design/SKILL.md`

### Tarea 10: añadir `idea-refine`

**Descripción:** Crear la skill para convertir ideas vagas en opciones concretas antes de especificar o planificar. Debe separar exploración, criterios de decisión, alternativas y siguiente paso recomendado.

**Criterio de hecho:** La skill existe y se activa cuando el usuario trae una idea incompleta, una decisión abierta o varias alternativas sin priorizar.

**Dependencias:** Tarea 2.

**Verificación:** Confirmar que no empuja a implementación prematura y que termina con opciones o una propuesta verificable.

**Archivos previstos:**

- `agents/.agents/skills/idea-refine/SKILL.md`

### Tarea 11: revisar y mejorar las seis skills existentes del core pack

**Descripción:** Comparar las skills existentes con los criterios de la spec y añadir solo mejoras claras: activación más precisa, verificación, límites operativos, señales de alerta o coordinación con otras skills.

**Criterio de hecho:** Las seis skills existentes conservan su propósito y, si se modifican, el cambio está justificado por claridad o utilidad diaria.

**Dependencias:** Tareas 3 a 10.

**Verificación:** Revisar diffs de cada skill modificada y confirmar que no hay contradicciones entre spec, plan, build, test, review y git.

**Archivos previstos:**

- `agents/.agents/skills/git-workflow-and-versioning/SKILL.md`
- `agents/.agents/skills/planning-and-task-breakdown/SKILL.md`
- `agents/.agents/skills/incremental-implementation/SKILL.md`
- `agents/.agents/skills/test-driven-development/SKILL.md`
- `agents/.agents/skills/spec-driven-development/SKILL.md`
- `agents/.agents/skills/code-review-and-quality/SKILL.md`

### Tarea 12: documentar el core pack y las skills locales adicionales

**Descripción:** Actualizar el índice de skills para listar las 14 del core pack, distinguir `anti-ai-style` y `castellano-peninsular`, y explicar la ruta fuente de verdad.

**Criterio de hecho:** La documentación permite saber qué skills existen, cuándo usarlas y dónde viven.

**Dependencias:** Tareas 3 a 11.

**Verificación:** Comprobar que la lista documentada coincide con los directorios reales.

**Archivos previstos:**

- `agents/.agents/skills/README.md` o documento equivalente de índice.
- `AGENTS.md`, si actualmente documenta una ruta o convención incorrecta.

### Tarea 13: revisión final de coherencia y duplicidades

**Descripción:** Revisar el conjunto completo para detectar solapamientos innecesarios, descripciones demasiado amplias, instrucciones contradictorias o contenido excesivamente específico.

**Criterio de hecho:** El core pack está completo, las skills locales siguen presentes y la documentación no contradice la estructura real.

**Dependencias:** Tarea 12.

**Verificación:** Ejecutar comprobaciones equivalentes a:

```bash
find agents/.agents/skills -maxdepth 2 -name SKILL.md | sort
rg "^name:|^description:" agents/.agents/skills/*/SKILL.md
rg "\.opencode/skills|agents/.agents/skills|core pack" AGENTS.md agents/.agents/skills
```

**Archivos previstos:** Ninguno adicional.

## Dependencias

- La Tarea 1 debe ir primero porque fija el estado real.
- La Tarea 2 debe preceder a cualquier incorporación para evitar copiar texto sin criterio.
- Las Tareas 3 a 10 dependen de la política de adaptación, pero pueden hacerse en cualquier orden.
- La Tarea 11 depende de tener claras las nuevas skills para evitar duplicidades con las existentes.
- La Tarea 12 depende de que el conjunto esté cerrado.
- La Tarea 13 debe ser la última.

## Paralelizable

- Las Tareas 3 a 10 son paralelizables después de la Tarea 2.
- La revisión de skills existentes puede dividirse por parejas: spec/plan, build/test, review/git.
- La documentación final no debe empezar hasta saber qué nombres y descripciones quedan definitivos.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---:|---|
| Importar texto demasiado largo o específico del repositorio externo. | Medio | Aplicar la política de adaptación y recortar ejemplos que no sirvan para uso diario. |
| Descripciones demasiado amplias que activen skills en exceso. | Alto | Revisar cada `description` con casos de uso y casos de no uso. |
| Duplicar instrucciones entre skills y generar contradicciones. | Medio | Hacer revisión final de solapamientos y mantener referencias cruzadas claras. |
| Debilitar skills existentes al editarlas. | Alto | Modificar solo secciones concretas y revisar el diff de cada skill. |
| La documentación de rutas queda desalineada con Stow o herramientas reales. | Medio | Documentar solo `agents/.agents/skills/` como fuente de verdad y dejar fuera automatización de sincronización. |
| `security-and-hardening` queda demasiado orientada a web. | Medio | Adaptarla explícitamente a dotfiles, scripts, CLIs, repos y proyectos de aplicación. |

## Checkpoints

### Checkpoint 1: después de las Tareas 1 y 2

- La auditoría identifica skills existentes y faltantes.
- La política de adaptación está escrita.
- No se ha empezado a copiar contenido de skills nuevas sin criterio.

### Checkpoint 2: después de las Tareas 3 a 10

- Las ocho skills nuevas existen.
- Cada una tiene activación, proceso y verificación.
- No se han tocado todavía las skills existentes salvo que fuera inevitable.

### Checkpoint 3: después de las Tareas 11 y 12

- Las 14 skills del core pack están presentes.
- Las skills locales adicionales siguen presentes.
- El índice o documentación coincide con la estructura real.

### Checkpoint final

- `SPEC.md` y `PLAN.md` describen esta incorporación de skills.
- El plan no empieza la implementación.
- El usuario puede pasar a build con tareas pequeñas y verificables.

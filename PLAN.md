# Plan: adaptar /super-git para commits atómicos desde cambios grandes

## Resumen

Actualizar `/super-git` para que pase de commitear el staging existente a guiar una serie de commits atómicos desde todo el working tree. La implementación debe vivir en el archivo del comando y, si procede, actualizar la documentación que menciona el comportamiento anterior.

## Decisiones de diseño

- Mantener el nombre `/super-git` porque sustituye al flujo actual.
- Analizar staged, unstaged y untracked antes de proponer commits.
- Confirmar cada commit antes de prepararlo.
- Usar `git add -p` cuando un archivo mezcle hunks de distintos grupos. Es más seguro que generar patches temporales no interactivos en repositorios con cambios locales sensibles o heterogéneos.
- Usar `git diff --check --cached` como verificación mínima antes de cada commit.
- Usar `git commit -m "<mensaje>"` para evitar bloquear sesiones no interactivas con un editor.
- No ejecutar push ni comandos destructivos.

## Tareas atómicas

### Tarea 1: localizar referencias actuales al comportamiento staged-only

**Descripción:** Revisar los archivos de configuración y documentación que mencionan `/super-git` para identificar dónde se afirma que requiere staging previo.

**Criterio de hecho:** Hay una lista de archivos y líneas que deben actualizarse o mantenerse.

**Dependencias:** Ninguna.

**Verificación:** Ejecutar búsquedas equivalentes a:

```bash
rg "super-git|requiere algo en staging|staged diff|git diff --staged" opencode agents CHECKPOINT.md README.md
```

**Archivos previstos:** Ninguno en esta tarea; solo lectura.

### Tarea 2: reescribir el contrato operativo de `/super-git`

**Descripción:** Actualizar `opencode/.config/opencode/commands/super-git.md` para describir el nuevo flujo: inspección del working tree, propuesta de grupos, confirmación por commit, preparación selectiva, verificación y commit editable.

**Criterio de hecho:** El comando ya no dice que se detenga si `git diff --staged` está vacío. Describe qué hacer si no hay ningún cambio en el working tree.

**Dependencias:** Tarea 1.

**Verificación:** Leer el archivo y comprobar que los pasos coinciden con `SPEC.md`.

**Archivos previstos:**

- `opencode/.config/opencode/commands/super-git.md`

### Tarea 3: definir reglas de agrupación y preparación de cambios

**Descripción:** Añadir al comando criterios concretos para agrupar cambios: por intención, tipo Conventional Commits, scope, rutas relacionadas y separabilidad de hunks. Incluir el uso de `git add -p` para archivos con cambios mixtos.

**Criterio de hecho:** El comando indica cómo decidir el siguiente commit y cómo actuar ante archivos con cambios mezclados.

**Dependencias:** Tarea 2.

**Verificación:** Revisar que el flujo cubre staged, unstaged y untracked, y que no depende de preparar todo un archivo si solo procede un hunk.

**Archivos previstos:**

- `opencode/.config/opencode/commands/super-git.md`

### Tarea 4: incorporar la verificación previa a cada commit

**Descripción:** Añadir la obligación de ejecutar `git diff --check --cached` después de preparar cada grupo y antes de `git commit`.

**Criterio de hecho:** El comando especifica que, si la verificación falla, se detiene y no crea el commit.

**Dependencias:** Tarea 2.

**Verificación:** Buscar en el comando `git diff --check --cached` y revisar el manejo de fallo.

**Archivos previstos:**

- `opencode/.config/opencode/commands/super-git.md`

### Tarea 5: mantener y ajustar las reglas de Conventional Commits

**Descripción:** Conservar los tipos y reglas actuales, y ajustar el texto para aplicarlas a cada grupo de cambios en vez de a un único staged diff.

**Criterio de hecho:** Las reglas de tipo, scope, longitud, breaking changes y body siguen presentes y se aplican por commit propuesto.

**Dependencias:** Tarea 2.

**Verificación:** Comparar la sección de convención con la spec y confirmar que no se han perdido tipos.

**Archivos previstos:**

- `opencode/.config/opencode/commands/super-git.md`

### Tarea 6: documentar el nuevo comportamiento en README

**Descripción:** Actualizar la documentación de OpenCode que indica que `/super-git` requiere algo en staging.

**Criterio de hecho:** El README describe `/super-git` como comando para dividir cambios del working tree en commits semánticos.

**Dependencias:** Tarea 2.

**Verificación:** Buscar menciones a staging previo y confirmar que no queda documentación obsoleta.

**Archivos previstos:**

- `opencode/.config/opencode/README.md`

### Tarea 7: revisar coherencia final del diff

**Descripción:** Revisar que el cambio completo no introduce instrucciones contradictorias y que mantiene un comportamiento genérico, sin acoplar `/super-git` a este repo concreto.

**Criterio de hecho:** El diff final solo toca los archivos previstos y no contiene referencias al flujo antiguo salvo para explicar que queda sustituido.

**Dependencias:** Tareas 2 a 6.

**Verificación:** Ejecutar:

```bash
git diff -- opencode/.config/opencode/commands/super-git.md opencode/.config/opencode/README.md
rg "requiere algo en staging|If empty, stop and report nothing is staged|staged diff" opencode/.config/opencode
```

**Archivos previstos:** Ninguno adicional.

## Dependencias

- Tarea 1 debe ir primero porque determina el alcance documental.
- Tarea 2 desbloquea el resto porque cambia el contrato principal del comando.
- Tareas 3, 4 y 5 pueden hacerse después de la Tarea 2 en cualquier orden, aunque es más claro hacerlas en secuencia dentro del mismo archivo.
- Tarea 6 depende de que el nuevo comportamiento del comando esté definido.
- Tarea 7 debe ser la última.

## Paralelizable

- Tras la Tarea 2, una persona puede revisar reglas de agrupación y otra puede revisar documentación.
- La Tarea 6 puede hacerse en paralelo con la revisión de reglas Conventional Commits si ya está cerrado el texto base del comando.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---:|---|
| `git add -p` requiere interacción y puede ser incómodo en algunas sesiones de agente. | Medio | Mantenerlo solo para archivos con cambios mixtos; usar staging por archivo cuando el grupo sea claro. |
| El agente puede proponer commits demasiado amplios. | Medio | Exigir que muestre intención, archivos/hunks incluidos y cambios excluidos antes de confirmar. |
| Untracked files pueden incluir secretos o archivos locales. | Alto | Obligar a revisar archivos untracked antes de incluirlos y mantener la regla de no commitear secretos. |
| La documentación puede quedar contradictoria entre comando y README. | Bajo | Ejecutar búsqueda final de frases antiguas sobre staging previo. |
| `git diff --check --cached` solo detecta problemas de whitespace, no fallos funcionales. | Bajo | Dejar claro que es verificación mínima y que comandos más largos requieren confirmación. |

## Checkpoint final

- `SPEC.md` existe y recoge las decisiones cerradas.
- `PLAN.md` existe y descompone el trabajo sin empezar la implementación.
- El usuario revisa el plan antes de pasar a build.

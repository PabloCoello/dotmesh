---
name: argos-traza
description: Flujo de trabajo para proyectos argos/traza en faro con el preset taller de dsh.
whenToUse: Cuando el agente trabaje con REQs, VERs o el gate de faro desde una sesión de dsh.
user-invocable: true
---

# argos-traza

Guía operativa para trabajar con proyectos gobernados por **argos 0.0.5** desde dsh,
usando el preset `taller`. Todos los verbos están verificados contra `argos --help`
y contra los requisitos reales de faro. No te fíes del manual oficial: está desactualizado.

---

## Verbos de argos que funcionan

```sh
# Estado del proyecto: conteos, IDs disponibles, convenciones, HUMAN GATES
argos context

# Árbol de requisitos
argos tree

# Entidad concreta (sin --state: solo metadatos)
argos get REQ-00001-1 --json
argos get VER-00001-1 --json

# Con estado derivado (derived_state, evidence — siempre code_classes: [])
argos get REQ-00001-1 --state --json

# Listar: sin argumentos muestra buckets; con bucket lista entidades
argos list
argos list requirements

# Buscar por cualquier campo (insensible a mayúsculas)
argos search "url_origen"

# Ver qué artefactos referencian un ID dado
argos linked REQ-00001-1

# Diagnóstico del repositorio
argos diagnose                  # todos los hallazgos
argos diagnose --new            # solo los nuevos respecto a main (solo útil en rama de trabajo)

# Clasificar un texto como REQ / CST / BOK_GUIDE / RATIONALE
argos classify "El sistema deberá rechazar..."

# Crear artefactos en DRAFT
argos new req
argos new ver
argos new cst
```

---

## Enlace REQ ↔ código: búsqueda manual por grep

**`argos-implementation-python` no está instalado** en faro. Por eso:

- `argos get REQ-XXXXX-N --state --json` devuelve siempre `"code_classes": []`.
- `argos task-context REQ-XXXXX-N` responde `{"error": "No matching process; specify process_hint"}`.
- `argos process match "<descripción>"` responde "No processes match above the threshold."

El único enlace REQ↔código disponible son las menciones textuales en comentarios y docstrings.
En faro aparecen en tres formas:

```
# REQ-00001-1: la URL exacta (con query) se captura como procedencia.
[REQ-00018-1]
(REQ-00036-1)
"""Tests del conector INE (REQ-00001-1)."""
```

**Grep exacto para localizar menciones de un REQ concreto:**

```sh
grep -rn 'REQ-00001-1' src/ tests/
```

**Para explorar todos los REQs referenciados en el código:**

```sh
grep -rn 'REQ-[0-9][0-9][0-9][0-9][0-9]-[0-9]' src/ tests/
```

Delega este paso a `subagent_localizador` — devuelve solo rutas y líneas, nunca el cuerpo.

---

## Ciclo de trabajo

```
1. argos context              → entender el estado y los HUMAN GATES
2. argos get REQ-XXXXX-N --state --json
                              → leer el requisito y su derived_state
3. subagent_localizador       → localizar el código vinculado (grep)
4. [si el REQ está en DRAFT]
   → ESPERAR aprobación humana antes de implementar
   → Un agente nunca pone status: APPROVED en un proyecto QM
5. subagent_implementador     → escribir el cambio mínimo
6. subagent_gate              → make gate + argos diagnose --new
7. subagent_redactor          → redactar VER en DRAFT si no existe
8. Abrir PR y parar           → el Owner humano aprueba y hace merge
```

**Nunca** pases al paso 5 si el REQ está en DRAFT. El campo `status: APPROVED`
es una decisión humana; si un agente lo escribe, invalida el proceso QM.

### `argos diagnose --new` solo tiene efecto en rama de trabajo

Si estás en `main`, el comando avisa "Already on main — --new has no effect."
Para filtrar solo los hallazgos nuevos, trabaja siempre en una rama de feature.

### Hallazgos preexistentes en faro

Faro arrastra hallazgos de diagnóstico preexistentes. Usa `--new` para ver
únicamente los que introdujo el cambio actual; no intentes corregir hallazgos
anteriores a menos que el Owner lo pida explícitamente.

---

## Handoff

Cuando pares con trabajo en vuelo, crea un documento de traspaso con estas secciones
(mismo formato que la skill `handoff` de dotmesh, compatible con Claude Code, OpenCode y Codex):

```markdown
# Handoff: <slug del task>

## Goal
Qué se intenta conseguir.

## State
- Done: qué está completado y commiteado.
- In flight: qué está empezado pero no cerrado.
- Blocked: qué no puede avanzar y por qué.

## Decisions
Decisiones tomadas y por qué. Referencia commits, PRs, REQs y paths
por nombre; no los dupliques aquí.

## Next steps
Acciones concretas que la siguiente sesión debe ejecutar en orden.

## Suggested skills
Skills que el siguiente agente debería cargar (p. ej. `argos-traza`, `incremental-implementation`).
```

Guarda el fichero en `.ai/tasks/<slug>/handoff.md` del proyecto activo.

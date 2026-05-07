# OpenCode — Configuración del sistema de agentes

Configuración global para opencode con tres agentes principales, cinco subagentes, cuatro comandos y skills compartidas.

## Estructura

```
~/.config/opencode/
├── agents/
│   ├── debate.md         # openai/gpt-5.5 (temp 0.8), exploración de ideas, sin escritura
│   ├── design.md         # openai/gpt-5.5, escribe SPEC.md y PLAN.md
│   ├── build.md          # openai/gpt-5.5, implementación con acceso completo
│   ├── write.md          # openai/gpt-5.5 (temp 0.5), redacción de docs de investigación (.md/.qmd/.tex/.bib)
│   ├── review.md         # github-copilot/claude-haiku-4.5, revisa diffs
│   ├── editor.md         # github-copilot/claude-haiku-4.5, revisa drafts (formato MD + claridad + voz)
│   ├── security.md       # openai/gpt-5.5, auditoría de seguridad
│   ├── docs.md           # github-copilot/claude-haiku-4.5, actualiza documentación
│   ├── maths.md          # openai/gpt-5.5, verificación con SymPy
│   └── state.md          # github-copilot/claude-haiku-4.5, snapshot del workspace
└── commands/
    ├── setup.md          # Inicializa proyecto con autoskills
    ├── super-git.md      # Commits atómicos con Conventional Commits
    ├── checkpoint.md     # Snapshot estructurado de sesión
    └── check-last.md     # review + security en paralelo

# Skills (incluida castellano-peninsular) viven en ~/.agents/skills/
# (paquete `agents/` del repo dotmesh)
```

## Instalación

Este directorio se enlaza a `~/.config/opencode/` con `make stow` desde la raíz del repo dotmesh. Las skills viven en `~/.agents/skills/` (paquete `agents/`).

Para verificar identificadores de modelo: `opencode models`. Ajusta el campo `model` en cada agente si algún nombre no coincide.

Para skills locales del stack del proyecto, ejecuta `npx autoskills` en cada repo (o `/setup`).

## Verificación

```bash
opencode agent list
```

Debe mostrar los ocho agentes definidos.

```bash
# Dentro de opencode
/setup       # debe inicializar AGENTS.md y skills del stack
/super-git   # agrupa cambios del working tree en commits semánticos
/checkpoint  # genera CHECKPOINT.md
/check-last  # review + security sobre git diff
```

## Flujo de trabajo

```
debate → design → build                       (flujo de código)
              └── review (por slice)
              └── docs (paralelo, no bloquea)
              └── maths (si aplica)
              └── state (al retomar sesión)
                            ↓
                    /check-last (gate de commit)
                      ├── review
                      └── security

debate → write                                (flujo de redacción)
            └── editor (formato MD + claridad + voz)
            └── state (al retomar sesión)
```

## Skills externas

Este setup asume que las skills de Addy Osmani (`spec-driven-development`, `planning-and-task-breakdown`, `incremental-implementation`, etc.) están disponibles en el proyecto. Se instalan por repo con:

```bash
npx autoskills
```

O manualmente clonando https://github.com/addyosmani/agent-skills y referenciando el directorio `skills/`.

## Idiomas

- System prompts y skills técnicas: inglés (más eficiente en tokens).
- Output dirigido al usuario (specs, planes, docs, checkpoints): idioma del proyecto.
- Para proyectos en castellano: la skill `castellano-peninsular` (en `~/.agents/skills/`) se carga automáticamente desde `debate`, `design` y `docs`.

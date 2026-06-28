# OpenCode — Configuración del sistema de agentes

Configuración global para opencode con dos agentes principales (personas), seis subagentes, cuatro comandos y skills compartidas.

## Estructura

```
~/.config/opencode/
├── agents/
│   ├── maker.md          # primary · github-copilot/claude-sonnet-4.5 (temp 0.2), persona de código: orquesta y delega
│   ├── scribe.md         # primary · openai/gpt-5.5 (temp 0.5), persona de prosa/research (.md/.qmd/.tex/.bib)
│   ├── build.md          # subagent · github-copilot/claude-sonnet-4.5, implementación con acceso completo
│   ├── plan.md           # subagent · github-copilot/claude-sonnet-4.5, escribe spec.md y plan.md
│   ├── review.md         # subagent · github-copilot/claude-haiku-4.5, revisa diffs
│   ├── editor.md         # subagent · github-copilot/claude-haiku-4.5, revisa drafts (formato MD + claridad + voz)
│   ├── security.md       # subagent · openai/gpt-5.5, auditoría de seguridad (gate de commit)
│   └── maths.md          # subagent · openai/gpt-5.5, verificación con SymPy
└── commands/
    ├── setup.md          # Inicializa proyecto con skills compartidas
    ├── super-git.md      # Flujo Git autónomo: rama, slices, commits, push y PR
    ├── checkpoint.md     # Snapshot estructurado de sesión
    └── check-last.md     # review + security en paralelo

# Skills (incluida castellano-peninsular) viven en ~/.agents/skills/
# (paquete `agents/` del repo dotmesh)
```

Las dos personas son agentes `primary`: se alternan con el selector nativo de opencode. `maker` para código, `scribe` para prosa. El resto son `subagent`: no se eligen a mano, se disparan por delegación cuando la situación encaja con su `description`.

## Instalación

Este directorio se enlaza a `~/.config/opencode/` con `make stow` desde la raíz del repo dotmesh. Las skills viven en `~/.agents/skills/` (paquete `agents/`).

Para verificar identificadores de modelo: `opencode models`. Ajusta el campo `model` en cada agente si algún nombre no coincide.

Las skills compartidas viven en `~/.agents/skills/`. No crees una segunda fuente como `.opencode/skills/` salvo que el proyecto lo requiera explícitamente y quede documentado cómo se sincroniza.

## Verificación

```bash
opencode agent list
```

Debe mostrar los ocho agentes: dos principales (`maker`, `scribe`) y seis subagentes.

```bash
# Dentro de opencode
/setup       # debe inicializar AGENTS.md y skills del stack
/super-git   # sincroniza, crea rama, hace commits por slices, hace push y abre PR
/checkpoint  # genera CHECKPOINT.md
/check-last  # review + security sobre git diff
```

## Flujo de trabajo

```
maker (persona de código)
  ├── plan      (spec + plan, antes de escribir código)
  ├── build     (una fase por subagente, commit por slice)
  ├── review    (tras cada slice)
  ├── maths     (si aplica)
  └── /check-last → review + security   (gate de commit)

scribe (persona de prosa)
  ├── editor    (formato MD + claridad + voz, por sección)
  └── maths     (si aplica)
```

## Convención de artefactos de trabajo

Los agentes siguen una política global para gestionar documentos de planificación:

- **No crear `SPEC.md`, `PLAN.md`, `TODO.md`, `NOTES.md`, `CHECKPOINT.md` en la raíz** salvo petición explícita.
- **Por defecto, trabajar en conversación**. Solo crear archivos persistentes si el usuario lo pide, si la tarea es larga o si hay riesgo de perder contexto.
- **Artefactos persistentes** van en `.ai/tasks/YYYY-MM-DD-slug/{spec.md,plan.md}`.
- **Scratch temporal** va en `.ai/tmp/`.
- **Git ignore**: solo `.ai/tmp/` se ignora por defecto. Cada proyecto decide si versiona `.ai/tasks/`.

Esta convención está integrada en las instrucciones de los agentes `plan` y `build`, y en el comando `/setup`.

## Skills compartidas

Este setup asume que las skills compartidas están disponibles en `~/.agents/skills/`, enlazadas desde el paquete `agents/` de dotmesh. El core pack está documentado en `agents/.agents/skills/README.md`.

Si un proyecto necesita skills específicas adicionales, documenta antes dónde viven y cómo se sincronizan con la fuente de verdad.

## Idiomas

- System prompts y skills técnicas: inglés (más eficiente en tokens).
- Output dirigido al usuario (specs, planes, docs, checkpoints): idioma del proyecto.
- Para proyectos en castellano: la skill `castellano-peninsular` (en `~/.agents/skills/`) se carga desde las personas `maker` y `scribe` y desde `plan`.

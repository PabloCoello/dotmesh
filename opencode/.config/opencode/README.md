# OpenCode — Configuración del sistema de agentes

Configuración global para opencode con dos agentes principales (personas), siete subagentes, cuatro comandos y skills compartidas.

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
│   ├── maths.md          # subagent · openai/gpt-5.5, verificación con SymPy
│   └── reviser.md        # subagent · github-copilot/claude-haiku-4.5, responde hilos de revisión documental
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
make opencode-doctor
opencode agent list
```

`make opencode-doctor` valida la configuración versionada sin arrancar OpenCode ni
servidores MCP: JSON, agentes, comandos, MCP, skills y symlinks locales. El comando
`opencode agent list` debe mostrar los agentes instalados.

La matriz de permisos se comprueba sin arrancar MCP ni ejecutar herramientas remotas:

```bash
node scripts/test-opencode-agent-capabilities.mjs
```

## Matriz de capacidades

OpenCode evalúa las reglas de permisos por patrón y gana la última coincidencia.
Por eso las reglas anchas (`"*": deny`) aparecen antes de las excepciones.
La configuración usa `permission`, no el campo antiguo `tools`.

| Agente | Lectura/búsqueda | Edición | Bash | Task | Skill | Web | MCP |
|---|---|---|---|---|---|---|---|
| `maker` | Permitida | Permitida | Permitido, con operaciones destructivas de Git en `ask` por reglas posteriores | Cualquier subagente | Permitida | `webfetch` y `websearch` permitidos | Sin restricción adicional |
| `build` | Permitida | Permitida | Permitido, con operaciones destructivas de Git en `ask` por reglas posteriores | Cualquier subagente | Permitida | `webfetch` y `websearch` permitidos | Sin restricción adicional |
| `scribe` | Permitida | Solo `.md`, `.qmd`, `.tex`, `.bib`, `.ai/review/**` y `.ai/backlog/**` | Solo `pandoc*`, `git diff*`, `git log*` y `git status*` | Solo `editor`, `reviser` y `maths` | Solo `anti-ai-style`, `castellano-peninsular` y `doc-review` | `webfetch` permitido | Denegado para los servidores configurados |
| `plan` | Permitida | Solo `.ai/tasks/**` | Denegado | Denegado | Solo planificación, source-driven y skills de castellano | `webfetch` permitido | Denegado para los servidores configurados |
| `review` | Permitida | Denegada | Denegado | Denegado | Solo `code-review-and-quality` | Denegado | Denegado para los servidores configurados |
| `editor` | Permitida | Denegada | Denegado | Denegado | Solo `anti-ai-style` y `castellano-peninsular` | Denegado | Denegado para los servidores configurados |
| `security` | Permitida | Denegada | Solo `git diff*`, `git log*`, `npm audit*`, `pip-audit*` y `pip list*` | Denegado | Solo `security-and-hardening` | `webfetch` permitido | Denegado para los servidores configurados |
| `maths` | Solo lectura | Denegada | Solo `python -c *` y `python3 -c *` | Denegado | Denegado | Denegado | Denegado para los servidores configurados |
| `reviser` | Permitida | Solo `.ai/review/**` | Denegado | Denegado | Solo `doc-review` | Denegado | Denegado para los servidores configurados |

Los patrones MCP (`notion_*`, `github_*`, `tavily_*`, `openalex_*`, `zotero_*`) siguen la documentación oficial: las claves de `permission` también se comparan con nombres de herramientas MCP.
La garantía cubre esos servidores por nombre.
No hay un control fiable para servidores MCP futuros si se añaden con otro prefijo y no se actualiza esta matriz; en ese caso hay que añadir el patrón explícito correspondiente, no simular aislamiento por prompt.

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

## Fuentes de OpenCode consultadas

- Esquema JSON oficial: <https://opencode.ai/config.json>.
- Permisos: <https://opencode.ai/docs/permissions>.
- Agentes: <https://opencode.ai/docs/agents>.
- Skills: <https://opencode.ai/docs/skills>.
- Herramientas y MCP: <https://opencode.ai/docs/tools/> y <https://opencode.ai/docs/mcp-servers/>.

## Idiomas

- System prompts y skills técnicas: inglés (más eficiente en tokens).
- Output dirigido al usuario (specs, planes, docs, checkpoints): idioma del proyecto.
- Para proyectos en castellano: la skill `castellano-peninsular` (en `~/.agents/skills/`) se carga desde las personas `maker` y `scribe` y desde `plan`.

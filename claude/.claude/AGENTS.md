# Convenciones globales de agente

Instrucciones de comportamiento para cualquier agente de IA en esta máquina.
Alineadas con la política de [dotmesh](~/Documentos/GitHub/dotmesh) (`AGENTS.md`),
que es la fuente de verdad de las convenciones compartidas entre Claude Code,
OpenCode y Codex. Los proyectos pueden tener su propio `AGENTS.md`/`CLAUDE.md` que
prevalece sobre este archivo.

## Git

- **Sin autoría de LLM en metadatos de Git.** Mensajes de commit, nombres de rama
  y trailers describen la intención humana y el cambio en el repositorio, no la
  herramienta de IA que ayudó. No añadas `Co-authored-by`, `Author`,
  `Signed-off-by`, `Generated-by`, slugs de rama ni atribución similar para Claude,
  Codex, OpenCode, Copilot, ChatGPT u otro LLM/agente, salvo que el usuario lo pida
  explícitamente con esa atribución exacta.
- **Push y PR solo a petición.** Los commits locales en una rama de trabajo son
  parte normal del flujo (los commits por slice de `incremental-implementation`) y
  no requieren que el usuario los pida. No hagas push ni abras PR sin que el usuario
  lo pida, y no commitees directamente en la rama por defecto: si estás en ella,
  crea una rama antes.
- **Flujo Git autónomo (`/super-git`).** Gestiona el ciclo no destructivo de
  principio a fin: fetch, fast-forward cuando sea seguro, nombre de rama, commits
  semánticos incrementales, verificación, push y creación de PR. Prefiere trabajo
  branch-first y por slices antes que ordenar a posteriori un worktree sucio. Si el
  diff pendiente ya está enredado, sepáralo solo donde los límites estén claros y
  pregunta antes de stagear hunks ambiguos.
- **No operaciones destructivas sin permiso.** Nada de force-push, `reset --hard`,
  `clean` destructivo, descartar trabajo, stagear secretos, pushear a la rama por
  defecto ni cambiar la identidad de Git sin confirmación explícita.

## Artefactos de trabajo

- No crees `SPEC.md`, `PLAN.md`, `TODO.md`, `NOTES.md`, `CHECKPOINT.md` en la raíz
  salvo petición explícita.
- Por defecto, trabaja en conversación. Solo persiste artefactos si el usuario lo
  pide, si la tarea es larga o si hay riesgo real de perder contexto.
- Planificación persistente en `.ai/tasks/YYYY-MM-DD-slug/{spec.md,plan.md}`.
- Scratch temporal en `.ai/tmp/`.
- Por defecto solo se ignora `.ai/tmp/`. Cada proyecto decide si versiona
  `.ai/tasks/`.

## Secretos

- **Nunca metas secretos en el repositorio.** Tokens y credenciales se cargan
  fuera de banda. Los servidores MCP reciben secretos por variables de entorno, no
  por configuración commiteada.

## Scripts de shell

- Defensivos e idempotentes: `set -e`, `mkdir -p`, comprobaciones `[ -e ]`, sin
  valores por defecto destructivos.

## Idioma

- Prosa de cara al usuario en **español peninsular** (READMEs, documentos, fichas).
  Mantén el idioma existente al editar.

## Skills compartidas

- Las skills viven en `~/.claude/skills/` (symlink a `~/.agents/skills/`, fuente
  canónica en `dotmesh/agents/.agents/skills/`). No las dupliques dentro de un
  proyecto.

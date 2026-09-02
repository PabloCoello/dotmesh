# Convenciones globales de agente

Instrucciones de comportamiento para cualquier agente de IA en esta máquina.

> **Fuente de verdad:** `~/Documentos/GitHub/dotmesh/AGENTS.md`. Este fichero
> es un resumen de las convenciones más comunes; cuando hay conflicto entre
> ambos, prevalece el `AGENTS.md` del repo. Si editas convenciones globales,
> hazlo en el repo y actualiza este fichero para mantener la sincronía.

Los proyectos pueden tener su propio `AGENTS.md`/`CLAUDE.md` que prevalece
sobre este archivo.

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

## Recuperación de errores de herramientas

- Carga `tool-error-recovery` antes de reintentar una herramienta fallida. Como
  máximo hay un reintento y solo para lecturas claramente idempotentes.
- No reintentes escrituras, Git/Stow destructivo, red autenticada ni MCP mutables.
  Conserva el exit/status y un resumen de stderr sin datos sensibles; si el fallo se repite,
  para.
- Usa permisos nativos, sandbox y aprobaciones antes que plugins o hooks. No
  dependas de `wait-for-user` ni de `reflect`.

## Scripts de shell

- Defensivos e idempotentes: `set -e`, `mkdir -p`, comprobaciones `[ -e ]`, sin
  valores por defecto destructivos.

## Comunicación

- **Concisión al reportar.** Cuando me reportes información directamente, sé
  extremadamente conciso: sacrifica la gramática si hace falta para ganar
  concisión.
- **Explicaciones en lenguaje de negocio.** Cuando te pida que me expliques algo
  en el chat, hazlo en términos de negocio: qué hace, qué implica y qué cambia.
  El detalle técnico acompaña, no abre la respuesta.

## Esperar intervención humana

- Si el siguiente paso seguro depende de una persona, carga `wait-for-user`.
- Si no hay pregunta nativa bloqueante, emite una sola línea
  `WAIT_FOR_USER: <decisión concreta>` y detente. No uses más herramientas hasta
  que la persona responda.
- Si actúas como subagente, usa siempre la señal textual y devuelve el bloqueo al
  agente principal u orquestador.
- Pide una decisión cerrada y no solicites secretos en el chat.

## Idioma

- Prosa de cara al usuario en **español peninsular** (READMEs, documentos, fichas).
  Mantén el idioma existente al editar.
- Las skills `castellano-peninsular` y `anti-ai-style` se cargan al redactar
  prosa de documento, no al responder en el chat.

## Skills compartidas

- Las skills viven en `~/.claude/skills/` (symlink a `~/.agents/skills/`, fuente
  canónica en `dotmesh/agents/.agents/skills/`). No las dupliques dentro de un
  proyecto.

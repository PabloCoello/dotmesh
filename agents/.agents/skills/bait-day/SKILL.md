---
name: bait-day
description: Cierre de jornada asistido — reconcilia el día (o los días pendientes) contra Jira. Recoge señales objetivas (git en repos BAIT, actividad en Jira, calendario de Outlook, backup local de Super Productivity), propone una tabla de reparto de tiempo por ticket BAIT-XXX y, tras una única confirmación, registra los worklogs en lote y barre el inbox. Úsala cuando el usuario diga "cerrar el día", "cierre de jornada", "registrar el tiempo de hoy", "ponerme al día con los worklogs" o invoque /bait-day.
---

# Cierre de jornada (/bait-day)

## Principios

- **Nunca en silencio.** Los worklogs se aplican solo tras confirmación explícita de la tabla final. Una sola confirmación cubre el lote del día; no pidas permiso fila a fila.
- **Escritor único.** /bait-day es el único punto que escribe worklogs. Durante la jornada no se registra tiempo en el momento — ni en sesiones de Claude Code, ni a mano en Jira, ni con `#time` en smart commits (duplicaría contra el cierre). Durante el día solo se dejan señales: claves `BAIT-XXX` en commits y ramas, tareas ad-hoc en SP.
- **Worklog al issue operativo** (task, fase de POC, workstream), nunca a la Epic. Hereda las convenciones de `bait-jira-workflow`.
- **Señales objetivas primero, memoria después.** El usuario solo rellena los huecos que las señales no cubren. Si no puede dar una cifra para un bloque, ese bloque no se loguea.
- **Reparto de responsabilidades fijado por el usuario:** Jira es la única interfaz de la operativa planificada; Super Productivity queda limitado a tareas ad-hoc y reuniones (entran solas por ICAL de Outlook); Slack Later queda fuera del sistema (no tiene API y así se decidió).
- **Las reuniones HOY NO se loguean en Jira** (convención de equipo pendiente). Aparecen en la tabla como filas informativas clasificadas por cliente; el día que haya convención, activar su volcado es trivial.
- **Solo lectura fuera de Jira.** El backup de Super Productivity es un snapshot: jamás escribas ni borres nada en sus datos.

## Estado

- Fichero de estado: `~/.local/state/bait-day/last-close` (una línea, fecha `YYYY-MM-DD` del último día cerrado).
- Días a cerrar: desde el siguiente a `last-close` hasta hoy. Si el fichero no existe, pregunta desde qué fecha cerrar y créalo al terminar.
- Modo catch-up: procesa cada día pendiente con su propia tabla (los worklogs admiten `started` retroactivo). Salta días sin ninguna señal (fines de semana, vacaciones) avisando de que se omiten.

## Paso 1 — Recolectar señales (por día D)

Lanza en paralelo lo que puedas. Si un MCP necesario no está conectado, dilo y para esa fuente — no adivines.

**1. Git (mapeo directo a tickets).** Commits del día en los repos locales:

```bash
for g in ~/Documents/BAIT/*/.git ~/Documents/GitHub/*/.git; do
  r=${g%/.git}
  out=$(git -C "$r" log --all --since="D 00:00" --until="D 23:59" \
    --author="$(git -C "$r" config user.email)" \
    --format="%h %ad %s" --date=format:"%H:%M" 2>/dev/null)
  [ -n "$out" ] && printf "== %s\n%s\n" "${r##*/}" "$out"
done
```

Extrae las claves `BAIT-XXX` de mensajes y ramas: son la asignación más fiable. Las horas de los commits delimitan bloques de trabajo.

**2. Super Productivity (tareas ad-hoc y contraste).** Backup más reciente (se escribe cada ~5 min, siempre fresco):

```bash
BACKUP=$(ls -t "$HOME/Library/Application Support/superProductivity/backups/"*.json | head -1)
# Tareas con tiempo el día D (revisa también .archiveYoung.task.entities si archivó al cerrar)
jq --arg d "D" '[.task.entities[] | select(.timeSpentOnDay[$d]) |
  {title, projectId, tagIds, ms: .timeSpentOnDay[$d]}]' "$BACKUP"
# Tareas tocadas el día D sin tiempo registrado (hechas o creadas ese día; S/E = epoch ms de inicio/fin de D)
jq --argjson s S --argjson e E '[.task.entities[] |
  select(.timeSpentOnDay == {} or .timeSpentOnDay == null) |
  select(((.doneOn // 0) >= $s and (.doneOn // 0) < $e) or (.created >= $s and .created < $e)) |
  {title, projectId, tagIds, isDone}]' "$BACKUP"
# Diccionarios id→título para proyectos y tags
jq '[.project.entities[] | {id, title}], [.tag.entities[] | {id, title}]' "$BACKUP"
# Ventanas horarias por proyecto/tag (s/e en ms epoch)
jq --arg d "D" '.timeTracking | {project, tag} | map_values(map_values(.[$d] // empty))' "$BACKUP"
```

Claves de proyecto: `INBOX_PROJECT` es el Inbox; `REUNIONES-BEWAY` recibe las reuniones del ICAL. Los tags (`AMA`, `CE`, `DN`, `GESTION`, `BC`, `BeTruth`, `CONSULTORIA`…) clasifican por cliente/área.

Cronometrar en SP es **opcional**: si una tarea tiene `timeSpentOnDay`, su cifra va directa a la tabla; si solo existe (creada o hecha ese día), entra como fila `¿?` para que el usuario ponga el tiempo o la descarte. Las reuniones nunca necesitan cronómetro: su duración sale del calendario.

**3. Calendario Outlook (MCP M365).** `outlook_calendar_search` para el día D: título, horario y asistentes de cada reunión. Es la fuente de verdad de la duración; la tarea ICAL de SP solo aporta tags si el usuario la etiquetó. Una reunión cuenta una sola vez.

**4. Jira (MCP Atlassian).** Issues tocados por el usuario en D, con JQL pequeño y filtrado:

```text
assignee = currentUser() AND updated >= "D" AND updated < "D+1"
```

**5. Worklogs ya existentes (anti-duplicados, OBLIGATORIO antes de proponer).** Comprueba qué hay ya registrado en D:

```text
worklogAuthor = currentUser() AND worklogDate = "D"
```

La búsqueda solo devuelve las issues, no las entradas: pide el detalle issue a issue con `getJiraIssue` y `fields=["worklog"]`, delegado en un subagente (el payload desborda el contexto), filtrando por autor y `started` en D. Todo bloque ya cubierto por un worklog existente sale de la tabla como «ya registrado»; si la cobertura es parcial, propone solo el delta. Origen de la regla: en el primer catch-up (2026-06-10) el cierre estuvo a punto de duplicar 26h que el usuario había consolidado a mano.

## Paso 2 — Tabla de reparto

Construye una tabla por día:

| # | Concepto | Tiempo | Destino propuesto | Señal |
|---|---|---|---|---|
| 1 | Trama: stack v5 | 2h 30m | BAIT-207 (fase X) | commits 09:10–11:45 |
| 2 | Reunión AMA seguimiento | 1h | — no se loguea (AMA) | calendario 12:00 |
| 3 | Tarea ad-hoc: presupuesto CE | 45m | ¿? | SP, tag CE |

Reglas:

- Bloques con clave `BAIT-XXX` en commits, rama o tarea SP → asignación automática.
- Reuniones → fila informativa con cliente propuesto (heurística: título y asistentes contra los tags de cliente).
- Tareas ad-hoc de SP con tiempo → propón destino si tienen clave o cliente claro; si no, marca `¿?`.
- Tareas ad-hoc de SP hechas o creadas en D sin tiempo registrado → fila `¿?` con el tiempo en blanco; el usuario lo pone de memoria o se infiere del hueco entre bloques de commits y reuniones.
- Bloques cubiertos por worklogs ya existentes (señal 5) → fila informativa «ya registrado», fuera del lote.
- Huecos sin señal → fila `¿?` para que el usuario la rellene o la descarte.
- Redondea a múltiplos de 15 min. Sanity check: lo imputable a tickets —contando lo ya registrado— no debe superar la jornada menos reuniones; si pasa, avisa antes de continuar.

## Paso 3 — Ajuste único

Presenta la tabla completa y pide los ajustes en una sola pasada. Aquí se resuelve la multitarea: el usuario reparte ("2h entre BAIT-207 y BAIT-141") sin haber llevado cronómetro. No iteres fila a fila.

## Paso 4 — Worklogs en lote

Tras la confirmación explícita de la tabla final:

- `addWorklogToJiraIssue` por fila imputable: `timeSpent` en formato Jira (`1h 30m`), `started` con la fecha del día D en ISO 8601 con zona (`D"T09:00:00.000+0200"`), comentario corto con lo que se hizo.
- Si una fila apunta a una Epic, busca el child operativo adecuado y propónlo; no logues en la Epic.
- Si algo falla a mitad del lote, reporta qué filas entraron y cuáles no. No reintentes en silencio.

## Paso 5 — Cierre

- Actualiza `~/.local/state/bait-day/last-close` con el último día cerrado.
- Resumen final: total imputado por ticket, total de reuniones por cliente (no imputado), huecos descartados.
- **Barrido del inbox:** lista las tareas del proyecto Inbox de SP sin movimiento más de 5 días. Si alguna ya es operativa planificada, ofrece crearle ticket siguiendo `bait-jira-workflow` — la operativa planificada vive en Jira, no en SP.

## Gotchas

- **Conector Jira:** ignora el parámetro `fields` y devuelve payloads enormes que desbordan el contexto y caen en rutas `/var/folders/...` que bash no lee (solo la tool Read). Consultas pequeñas, `maxResults` bajo; delega en un subagente si necesitas volumen.
- **Doble conteo de reuniones:** la misma reunión existe en el calendario M365 y como tarea ICAL en `REUNIONES-BEWAY`. Cuenta una sola, con la duración del calendario.
- **Tareas JIRA huérfanas en SP:** el provider de Jira está desactivado a propósito; quedan tareas antiguas con `issueType: JIRA` en el proyecto `JIRA-BAIT`. Ignóralas como señal salvo que tengan tiempo registrado el día D.
- **Formatos de SP:** `timeSpentOnDay` usa claves de fecha local `YYYY-MM-DD`; los timestamps (`s`/`e`, `created`) son ms epoch.

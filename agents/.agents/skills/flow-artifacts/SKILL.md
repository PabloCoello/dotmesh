---
name: flow-artifacts
description: Publish a claude.ai artifact page instead of a wall of terminal text at the interactive phases of the maker flow (grilling a plan with three or more independent closed questions in one round, reviewing a spec, reporting measured results, following a long run phase by phase), so the user answers with one click or an anchored comment. Not for one or two questions or ordinary chat replies. Claude Code only, it needs the Artifact tool. Load artifact-design with it.
---

# Páginas del flujo

Saca al navegador las fases del flujo en las que la persona tiene que leer mucho
o decidir varias cosas a la vez. La página no sustituye al chat. Se queda con lo
que se lee mejor en una página y se contesta mejor con un clic que con un
párrafo.

## Cuándo aplica

Solo en Claude Code, porque necesita la herramienta `Artifact`. OpenCode y Codex
no la tienen: si cargas la skill allí, dilo en una línea y sigue la fase en el
chat.

Hay cuatro tipos de página. Si la fase no es ninguno, no hay página.

| Tipo | Cuándo | Reglas |
|---|---|---|
| grill | tres o más preguntas cerradas, independientes entre sí, en la misma ronda | `grill.md` |
| revisión de spec | una spec de más de una pantalla que pide aprobación | `revision-spec.md` |
| informe | cierras una medición o una tarea con cifras que se van a discutir | `informe.md` |
| progreso | una tanda larga con fases que la persona quiere seguir sin mirar la terminal | `progreso.md` |

Con una o dos preguntas, pregunta en el chat. Una página cuesta una publicación
y una lectura por ronda, y por debajo de tres preguntas no compensa. `grilling`
pregunta de una en una porque cada respuesta puede cambiar la siguiente; la
página solo agrupa las que no dependen unas de otras, y las que dependen siguen
de una en una.

Un subagente puede publicar un informe de una vez, pero no recibe avisos cuando
la persona toca la página. Todo lo interactivo va en la sesión principal.

## Procedimiento

1. Elige el tipo con la tabla.
2. Carga `artifact-design`. Si la página recoge respuesta, carga también
   `artifact-capabilities` antes de declarar la capacidad.
3. Lee `estilo.md` y el fichero del tipo. Si la página recoge respuesta, lee
   también `circuito.md`.
4. Escribe la página en `.ai/tasks/<slug>/<nombre>.html`. La ruta es lo que
   mantiene la URL entre publicaciones: no la cambies.
5. Antes de publicar, `grep -nE '/(home|Users)/[^/ ]+' <fichero>` no debe
   devolver nada. Publica. La primera vez con `favicon`; en las siguientes, sin
   él. Si la página recoge respuesta, declara `capabilities: {artifact: {}}` en
   cada publicación, no solo en la primera: una publicación con otro conjunto de
   capacidades la retira y la página se queda sin enviar (`not_declared`).
6. Apunta la URL en el `plan.md` o el `handoff.md` de la tarea. Una sesión que
   no la publicó tiene que pasar `url` y leer la página antes de republicar.
7. Dile a la persona, en una línea y con el enlace, qué tiene que hacer en la
   página.
8. Cuando llegue el aviso (la página se ha publicado a sí misma, o un comentario
   enviado a Claude), sigue `circuito.md`: lee, actúa, vuelca el estado en el
   fichero local y republica.
9. Al cerrar la fase, republica con el estado final y `cerrada: true`: la
   página se pinta en solo lectura con lo decidido.

## Registro de reglas

Cada página lleva en su cabecera los ficheros de reglas que aplicó:

```html
<meta name="flow-artifacts" content="tipo=revision-spec; reglas=estilo,circuito,revision-spec">
```

Las reglas se afinan con el uso. Este registro, cruzado con qué ficheros de la
skill se leyeron en cada sesión (está en los transcripts), dice qué regla
produjo cada página.

## Límites

- Ni secretos, ni rutas de `$HOME`, ni el nombre de usuario en una página. Las
  rutas, relativas al repositorio.
- Nunca `outerHTML` para autopublicarse, ni `innerHTML` con texto que haya
  escrito un visor. `circuito.md` explica por qué.
- Pregunta antes de declarar `db`, `mcp` o `sample`: cambian quién escribe o
  quién paga.
- Una publicación por ronda, no por clic.
- No cargues `dotmesh-design` para esto. La capa de estilo es `estilo.md`, que
  sale de `docs/DESIGN.md` y de sus tokens derivados.

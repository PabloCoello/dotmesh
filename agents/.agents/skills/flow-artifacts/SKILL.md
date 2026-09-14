---
name: flow-artifacts
description: Publish a claude.ai artifact page instead of a wall of terminal text when a maker-flow phase asks the user to read a lot or decide several things at once (grilling three or more independent closed questions, reviewing a spec longer than a screen, reporting measured results, following a long run phase by phase). The page opens with a plain-language summary and folds the detail; the user refines it with anchored comments sent to Claude and answers closed choices with one click. Decide per phase, not for one or two questions, a short spec or ordinary chat replies. Claude Code only, it needs the Artifact tool. Load artifact-design with it.
---

# Páginas del flujo

Saca al navegador las fases del flujo en las que la persona tiene que leer mucho
o decidir varias cosas a la vez. La página no sustituye al chat, y trabaja en
dos sentidos con herramientas distintas:

- **Para enseñar, el HTML.** La página abre con lo esencial en lenguaje llano y
  deja el detalle plegado. La persona decide cuánto lee.
- **Para contestar, los comentarios.** Lo abierto (cambiar una frase, preguntar
  por qué, discutir una conclusión) va en un comentario anclado que la persona
  envía a Claude. Los controles de la página quedan para lo cerrado: un «vale»
  que da la fase por buena o una opción ya escrita.

## Cuándo aplica

Solo en Claude Code, porque necesita la herramienta `Artifact`. OpenCode y Codex
no la tienen: si cargas la skill allí, dilo en una línea y sigue la fase en el
chat.

La página no es un paso fijo de ninguna fase: se decide en cada una. Cuesta una
publicación y una lectura por ronda, un turno más que el chat, y compensa cuando
la persona se ahorra leer un bloque largo o escribir un párrafo. Compensa con:

- tres o más decisiones independientes en la misma ronda;
- un documento de más de una pantalla que se revisa por partes;
- cifras que se van a discutir;
- una tanda que dura más de lo que la persona quiere mirar la terminal.

No compensa con una o dos preguntas, una spec corta, una respuesta que cabe en
una línea del chat o una fase en la que cada respuesta cambia la pregunta
siguiente. `grilling` pregunta de una en una por eso; la página solo agrupa las
preguntas que no dependen unas de otras.

Los tipos vistos hasta ahora tienen reglas propias:

| Tipo | Cuándo | Reglas |
|---|---|---|
| grill | tres o más preguntas cerradas, independientes entre sí, en la misma ronda | `grill.md` |
| revisión de spec | una spec de más de una pantalla que pide aprobación | `revision-spec.md` |
| informe | cierras una medición o una tarea con cifras que se van a discutir | `informe.md` |
| progreso | una tanda larga con fases que la persona quiere seguir sin mirar la terminal | `progreso.md` |

La lista puede crecer. Una fase que compense y no encaje en ningún tipo lleva
página igualmente, con `estilo.md` y, si espera respuesta, `circuito.md`.

Un subagente puede publicar un informe de una vez, pero no recibe avisos cuando
la persona comenta o toca la página. Todo lo interactivo va en la sesión
principal.

## Procedimiento

1. Decide con las señales de arriba si la fase compensa una página. Si no,
   sigue en el chat. Si compensa, busca su tipo en la tabla; puede no tener.
2. Carga `artifact-design`. Si la página lleva controles, carga también
   `artifact-capabilities` antes de declarar la capacidad.
3. Lee `estilo.md` y el fichero del tipo, si lo hay. Si esperas respuesta, lee
   también `circuito.md`: los comentarios valen para cualquier página; la
   autopublicación, solo para la que lleva controles.
4. Escribe la página en `.ai/tasks/<slug>/<nombre>.html`. La ruta es lo que
   mantiene la URL entre publicaciones: no la cambies.
5. Antes de publicar, `grep -nE '/(home|Users)/[^/ ]+' <fichero>` no debe
   devolver nada. Publica. La primera vez con `favicon`; en las siguientes, sin
   él. Si la página lleva controles, declara `capabilities: {artifact: {}}` en
   cada publicación, no solo en la primera: una publicación con otro conjunto de
   capacidades la retira y la página se queda sin enviar (`not_declared`). Y
   tras cada publicación que sale bien, la primera incluida, guarda la copia con
   `leer-estado.py publicado`: sin ella, la lectura del primer envío falla.
6. Apunta la URL en el `plan.md` o el `handoff.md` de la tarea. Una sesión que
   no la publicó tiene que pasar `url` y leer la página antes de republicar.
7. Dile a la persona, en una línea y con el enlace, qué tiene que hacer en la
   página: comentar lo que quiera cambiar y enviarlo a Claude y, si hay un
   control, marcarlo y enviar.
8. Cuando llegue un aviso, sigue `circuito.md`. Un comentario enviado a Claude
   se lee, se aplica, se republica, se contesta y se resuelve. Una página que se
   ha publicado a sí misma se lee, se valida, se vuelca su estado en el fichero
   local y se republica.
9. Al cerrar la fase, si la página lleva controles, republica con el estado
   final y `cerrada: true`: la página se pinta en solo lectura con lo decidido.

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

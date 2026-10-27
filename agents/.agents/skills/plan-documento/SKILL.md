---
name: plan-documento
description: Plan a long document before drafting it, so it tells a story the reader can follow. Produces a template with the narrative arc, the target reader, a concept map (where each idea is introduced and at what depth), and a brief per section (purpose, new concepts, example, links in and out, recap). Load before drafting a manual, report, informe, proposal, guide, long README or slide deck of more than a few sections, in any language. Skip for short texts, chat replies and UI copy. Pair with redaccion-explicativa to fill the template.
---

# Plan del documento

Un documento largo se entiende o no se entiende mucho antes de redactar la
primera frase. Si nadie ha decidido en qué apartado se presenta cada idea, la
redacción tiende a meterlo todo en el primer sitio donde hace falta, y el
resultado es un texto correcto frase a frase pero imposible de seguir: cada
párrafo da por sabido algo que aún no se ha explicado, o explica de golpe tres
cosas que necesitaban espacio. Esta skill evita ese problema decidiendo la
historia del documento antes de escribirla.

El resultado es una plantilla: un fichero con la estructura completa del
documento y, en cada apartado, instrucciones concretas sobre qué contar, con qué
detalle y cómo enlazarlo con lo que viene antes y después. Después,
`redaccion-explicativa` rellena esa plantilla apartado por apartado.

## Cuándo usarla

Úsala para cualquier documento de más de tres o cuatro apartados que alguien
vaya a leer de principio a fin o a consultar por partes: manuales, informes,
propuestas, guías, documentación de diseño, READMEs largos y presentaciones.
No hace falta para textos de una o dos páginas, respuestas en el chat ni textos
de interfaz.

Si el documento ya existe y se va a reescribir, el plan se hace igualmente, a
partir del contenido actual: primero se extrae qué dice, luego se decide en qué
orden y con qué detalle debería decirlo.

## Proceso

### 1. Reunir el material y fijar el lector

Antes de planificar hace falta tener el contenido: los datos, las decisiones,
el código o el estudio del que trata el documento. Un plan hecho sin material
produce una estructura bonita con huecos que luego se rellenan de cualquier
manera.

Con el material delante, escribe quién es el lector. No basta con «técnico» o
«negocio»; hace falta saber qué sabe ya al empezar, qué no sabe, para qué va a
usar el documento y qué tiene que poder hacer o decidir al terminarlo. Si el
documento tiene dos públicos (por ejemplo, dirección y equipo técnico), dilo y
decide qué apartados son para cada uno.

### 2. Definir el arco

El arco es la línea que conduce la lectura de principio a fin. Tiene tres
piezas:

- **La pregunta o tensión de partida.** El problema que el documento resuelve,
  formulado de modo que el lector entienda por qué le importa.
- **El hilo conductor.** Un caso, ejemplo o escenario que se recorre a lo largo
  del documento. Volver siempre al mismo caso permite que el lector acumule
  contexto en lugar de empezar de cero en cada apartado.
- **El desenlace.** La idea con la que el lector debe quedarse al terminar y,
  si procede, lo que tiene que hacer a continuación.

En un informe, el desenlace suele ir también al principio, en un resumen
ejecutivo; en un manual, se anuncia en la introducción y se alcanza al final.

### 3. Construir el mapa de conceptos

Haz una lista de todos los conceptos que el lector necesita y, para cada uno,
decide:

- **Dónde aparece por primera vez.** Ningún concepto se usa antes de haberse
  presentado, al menos con una frase.
- **Con qué grado de detalle** en cada aparición:
  - *mencionar*: se nombra y se dice en una frase qué es, prometiendo volver a él;
  - *explicar*: se cuenta qué es y para qué sirve, con un ejemplo;
  - *desarrollar*: se entra en cómo funciona, sus matices y sus casos límite.
- **Dónde se retoma.** Un concepto que se explica una vez y no vuelve a salir
  probablemente sobra, o está mal situado.

Los conceptos difíciles se presentan en dos tiempos: primero la intuición, en
el apartado donde hace falta por primera vez, y después el detalle, en un
apartado propio o cuando el lector ya tiene con qué entenderlo. Como
referencia, ningún apartado debería introducir más de tres conceptos nuevos;
si el mapa obliga a ello, el apartado es demasiado grande o el orden no es el
adecuado.

### 4. Escribir la ficha de cada apartado

Parte del esqueleto del tipo de documento (ver [`tipos.md`](tipos.md)) y
adáptalo al material. Para cada apartado, rellena la ficha de
[`plantilla.md`](plantilla.md): su propósito en una frase, qué sabe el lector al
entrar y qué se lleva al salir, los conceptos que introduce o retoma, el
ejemplo que usa, cómo enlaza con el apartado anterior y con el siguiente, si
cierra con un resumen y una extensión orientativa.

La ficha no es el contenido, sino las instrucciones para escribirlo. Tiene que
ser lo bastante concreta para que otra persona, o el mismo modelo en otra
sesión, pueda redactar el apartado sin volver a pensar la estructura.

### 5. Decidir los recursos

Decide de antemano, y deja escrito en la plantilla, qué recursos usa el
documento y dónde:

- **Ejemplos.** El hilo conductor y, cuando haga falta, ejemplos puntuales para
  un concepto concreto. Cada concepto que se *explica* necesita al menos uno.
- **Analogías.** Solo si se corresponden bien con el concepto, y diciendo dónde
  dejan de valer.
- **Figuras y tablas.** Para comparaciones, procesos y datos; cada una con una
  frase que diga qué hay que ver en ella.
- **Preguntas al lector.** Con moderación, para abrir un apartado o comprobar
  la comprensión al cerrarlo.
- **Humor.** Por defecto, ninguno en documentos técnicos o para clientes. En
  textos internos o de divulgación puede tener sitio si el público lo
  agradece; en ese caso, la plantilla dice dónde y de qué tipo, y nunca a costa
  de la precisión.

### 6. Revisar el plan

Antes de darlo por cerrado, comprueba:

- Leídos en orden, los propósitos de los apartados cuentan el arco completo.
- Ningún concepto aparece antes de su primera presentación.
- Ningún apartado introduce más de tres conceptos nuevos.
- Cada concepto difícil tiene sus dos tiempos, intuición y detalle.
- El hilo conductor aparece en la mayoría de los apartados.
- Cada apartado sabe de dónde viene y adónde lleva.
- Los apartados largos o densos cierran con un resumen.

### 7. Aprobación

En documentos largos (más de cinco apartados o unas 3000 palabras) o
entregables para clientes, el plan se presenta a la persona antes de redactar.
En Claude Code, cuando el plan sea extenso, publícalo como página con
`flow-artifacts` para que pueda comentarlo; si no, muéstralo en el chat. Espera
su respuesta (`wait-for-user`) y no empieces a redactar hasta tener el visto
bueno. En documentos más cortos, escribe el plan, sigue adelante y menciona
que existe.

## Dónde se guarda

En un repositorio, el plan va a `.ai/tasks/<slug>/plan-documento.md`, junto al
resto de artefactos del flujo. Ahí lo leen la redacción, que lo usa como guion,
y la revisión, que comprueba que el texto cumple lo que el plan prometía. Fuera
de un repositorio, guárdalo junto al documento o, si no hay sistema de
ficheros, en la propia conversación.

El documento se redacta sobre una copia de la estructura del plan, sustituyendo
cada ficha por su contenido. El plan original no se borra: si durante la
redacción hay que cambiar la estructura, se cambia primero en el plan.

## Qué viene después

Carga `redaccion-explicativa` para rellenar la plantilla, y para un documento en
español, también `castellano-peninsular`. Al revisar, `anti-ai-style` se ocupa
de los rasgos de texto generado y el `editor` comprueba el texto contra este
plan.

---
name: anti-ai-style
description: Writing rules for prose that does not read as AI-generated. Covers inflated importance, promotional wording, vague attribution, forced rules of three, em dash and bold abuse, chatbot fingerprints. Load before drafting or editing prose that lands in a deliverable (README, doc, report, ficha). Chat replies to the user do not load it. Pair with castellano-peninsular for Spanish.
---

# Instrucciones de estilo anti-IA

Estas instrucciones tienen como objetivo reducir patrones de redacción típicos de texto generado por IA y mejorar la calidad factual, la precisión, la claridad y la naturalidad del contenido.

El agente debe priorizar siempre:

- concreción,
- trazabilidad,
- lenguaje sobrio,
- precisión factual,
- ejemplos verificables,
- y redacción humana, específica y útil.

---

# Criterio rector

Antes que cualquier regla concreta, este es el criterio del que todo lo demás se deriva.

Escribe como alguien que domina el tema y se lo explica a un colega que respeta y que conoce el contexto. Ese lector no necesita que le vendan nada, no espera revelaciones ni suspense, y detecta enseguida cuándo una frase está ahí para impresionar en vez de para informar.

El enemigo común de casi todos los patrones que se listan en los ficheros de familia es el mismo: texto que finge importancia, tensión o descubrimiento en lugar de decir algo. El "no es X, es Y", la "verdad incómoda que nadie dice", la frase corta de efecto, la pregunta retórica de transición: todos simulan una carga que el contenido no tiene. Si entiendes esto, no necesitas memorizar la lista; reconoces el impulso y lo cortas.

Tres preguntas resuelven la mayoría de los casos, incluidos los que ninguna regla de esos ficheros anticipa:

1. ¿Esta frase informa o solo suena bien? Si solo suena bien, sobra.
2. ¿Estoy afirmando lo que sé, o construyendo un efecto alrededor de ello? Afirma directamente.
3. ¿Podría decir esto mismo un experto hablando con otro, sin teatro? Si no, reescríbelo hasta que sí.

Los ficheros de familia no son una lista negra que haya que agotar. Son ejemplos del mismo problema, útiles porque son verificables y porque enseñan a qué se parece el patrón. Pero el objetivo no es esquivar estas palabras concretas, sino aplicar el criterio de arriba a cualquier variante, esté listada o no.

---

# Principio general

Evitar redacción grandilocuente, genérica, ornamental o vacía.

Siempre que sea posible, sustituir frases abstractas por:

- hechos concretos,
- fechas,
- nombres verificables,
- acciones observables,
- fuentes explícitas,
- o descripciones precisas del fenómeno.

---

# Familias de reglas

Al revisar, abre el fichero de la familia que corresponda al tipo de problema detectado. Al redactar desde cero, escribe con el criterio rector y pasa después el borrador por el checklist de `revision-y-checklist.md`, que remite a cada familia. Cada fichero desarrolla los patrones con ejemplos y reglas operativas.

| Fichero | Cuándo abrirlo |
|---|---|
| [`inflacion-y-promocion.md`](inflacion-y-promocion.md) | Exageración de importancia, lenguaje publicitario, clichés de resiliencia, rangos retóricos, conclusiones vacías |
| [`atribucion-y-fuentes.md`](atribucion-y-fuentes.md) | Name-dropping sin contenido, sujetos difusos, disclaimers vagos |
| [`verbos-y-estructura.md`](verbos-y-estructura.md) | Gerundios pseudoanalíticos, perífrasis que evitan verbos simples, paralelismos negativos, frases de relleno, cautela verbal apilada |
| [`retorica-y-enumeracion.md`](retorica-y-enumeracion.md) | Vocabulario típico de IA, regla de tres forzada, rotación de sinónimos |
| [`tipografia-y-formato.md`](tipografia-y-formato.md) | Raya larga, negritas decorativas, pseudoencabezados, mayúsculas anglosajonas, emojis, comillas, punto medio |
| [`tono-y-chatbot.md`](tono-y-chatbot.md) | Huellas de chatbot, tono complaciente o adulador |
| [`revision-y-checklist.md`](revision-y-checklist.md) | Revisión de un texto completo: reglas generales, checklist de 26 puntos, regla final de calidad |

---

# Instrucción directa para el agente

El criterio rector manda. Los patrones de los ficheros son ejemplos suyos, no una lista que baste con esquivar. Cuando detectes cualquiera de estos patrones, o una variante no listada que falle las tres preguntas del criterio rector:

1. Márcalo internamente como posible redacción artificial, inflada o vacía.
2. Reescribe la frase con lenguaje factual, sobrio y directo.
3. Sustituye generalidades por datos, actores, fechas o mecanismos concretos.
4. Si no hay base suficiente para sostener la frase, elimínala o redúcela.
5. No conserves una frase solo porque “suena bien”.
6. Prioriza siempre claridad, precisión y utilidad.
7. En caso de duda, elige la formulación más simple.

---
name: castellano-peninsular
description: Spanish writing rules for peninsular formal Spanish. Load when drafting or editing Spanish text that lands in a deliverable: README, doc, report, informe, ficha, visible UI text in a frontend (JSX/TSX, Vue, Svelte, HTML, i18n string files) or a slide deck (.pptx, slides artifact). Chat replies to the user do not load it. Covers RAE orthography, peninsular lexicon, accents on capitals, avoidance of voseo, syntactic calques, number and date format, UI microcopy and slide text.
---

# Castellano peninsular

## Regla general
Toda la redacción en español usa la variante peninsular formal.
La ortografía sigue la norma actual de la RAE, incluidas las tildes en mayúsculas.

## Ficheros por formato
Este fichero rige cualquier texto en español. Según lo que estés escribiendo, abre además el que corresponda:

| Fichero | Cuándo abrirlo |
|---|---|
| [`calcos-y-numeros.md`](calcos-y-numeros.md) | Siempre que el texto tenga más de un párrafo o lleve cifras, fechas, porcentajes o importes: calcos sintácticos del inglés y formato español de números y fechas |
| [`interfaz.md`](interfaz.md) | Texto visible de una interfaz: botones, menús, etiquetas de formulario, mensajes de error, estados vacíos, ficheros de traducción |
| [`presentaciones.md`](presentaciones.md) | Diapositivas: titulares, viñetas y notas del orador |

## Registro
Un documento, un informe o un manual se escriben en registro escrito formal, no con el tono de quien lo explica en voz alta. El inglés técnico admite un tono conversacional que, trasladado al castellano, suena a traducción.

- Término preciso antes que imagen coloquial: "respaldar" o "sostener" una conclusión, no que "aguante"; "registra las decisiones", no "es el sitio donde quedan escritas"; "se verifica de forma automática", no "una máquina lo comprueba".
- Sujeto explícito al empezar párrafo o cuando cambia el referente. Un sujeto omitido se entiende como el de la frase anterior: tras una frase sobre una herramienta, "No es una referencia de comandos" habla de la herramienta, no del manual. Es el rastro de un "It's not…" traducido sin reponer el sujeto.
- Frases completas: "qué se decidió y por qué se tomó esa decisión", no "qué se decidió y por qué" ("and why").
- Conectores para decir cómo se relacionan las ideas (por eso, ya que, de modo que, en cambio); los dos puntos, para anunciar una enumeración, una cita o un ejemplo.
- Las convenciones del tipo de documento (a quién va dirigido, requisitos, alcance) van en su apartado, no metidas como una frase suelta en un párrafo. Ver `plan-documento`.

## Léxico
- "ordenador", no "computadora".
- "móvil", no "celular".
- "vale" o "de acuerdo", no "dale" ni "okey".
- "coche", no "auto" ni "carro".
- "fichero" o "archivo" (ambos válidos), nunca "file" sin traducir.
- "vosotros" cuando aplique, no "ustedes" como segunda persona plural informal.
- "zumo" en contexto general; "jugo" solo para acepciones específicas.
- "patata", no "papa".
- "costes", no "costos"; "centrarse en", no "enfocarse en"; "conducir", no "manejar".

## Tratamiento
- Por defecto, segunda persona del singular ("tú").
- Nunca conjugues con voseo: "tienes", no "tenés"; "haces", no "hacés"; "puedes", no "podés".
- Para registros formales, "usted" con concordancia en tercera persona.

## Tildes
- Tildes obligatorias siempre, incluidas las mayúsculas.
- Verifica acentuación de palabras con diptongos e hiatos: "frío", "país", "día", "raíz".
- "Solo" sin tilde (norma actual desde 2010), incluso cuando equivale a "solamente".
- "Este", "ese", "aquel" como pronombres no llevan tilde (norma actual).
- Tilde diacrítica solo donde sigue siendo obligatoria: "él/el", "tú/tu", "sí/si", "más/mas", "té/te", "qué/que" interrogativo.

## Anglicismos
- Términos técnicos consolidados se mantienen en inglés sin cursiva: commit, build, deploy, framework, log, dashboard.
- "Comando" (admitido por la RAE y habitual), no "orden" como traducción forzada de "command".
- No los traduzcas forzadamente: "hacer un commit", no "realizar una confirmación".
- Términos no consolidados, tradúcelos o explícalos: "boundary" → "frontera"; "fixture" → "datos de prueba".
- Mantén consistencia: si decides cursiva para anglicismos, aplícala a todos en el mismo documento.

## Errores típicos a evitar
- "En orden de" como traducción de "in order to" → usar "para".
- "Realizar" cuando vale "hacer".
- "Permite + infinitivo" cuando vale el verbo directo: "permite ejecutar" → "ejecuta".
- "Soportar" como traducción de "support" en sentido técnico → usar "admitir" o "ser compatible con".
- "Asumir" como traducción de "assume" → en castellano significa "hacerse cargo"; usar "suponer" o "dar por hecho".
- "Eventualmente" en sentido temporal de "finalmente" → en castellano significa "ocasionalmente".
- "Aplicar a un puesto" o "aplicar a una beca" → "solicitar", "optar a", "presentarse a".

Los calcos sintácticos (pasiva perifrástica, gerundio de posterioridad, "a nivel de", "es por eso que") están en `calcos-y-numeros.md`.

## Estilo técnico
- Inicia frases con verbos cuando sea posible: "Lee el archivo X", no "Hay que leer el archivo X".
- Imperativo en instrucciones dentro de un documento, no infinitivo: "Ejecuta", no "Ejecutar" (salvo en títulos cortos). En botones y menús de una interfaz rige lo contrario; ver `interfaz.md`.
- Listas con punto final solo si los elementos son frases completas.
- Usa "que" antes de subordinada en lugar de gerundio: "el script que procesa los datos", no "el script procesando los datos".

## Comillas
En la prosa de un documento o informe, comillas angulares « » en primer nivel, inglesas " " dentro de ellas y simples ' ' en tercer nivel. En código, rutas, nombres de fichero, valores literales y bloques de markdown técnico, comillas rectas o acentos graves de código. Dentro de un mismo documento, el mismo criterio de principio a fin.

## Comprobación final
Antes de cerrar un texto, verifica:
- Todas las tildes presentes, incluso en mayúsculas.
- Ningún voseo ni léxico no peninsular.
- Anglicismos tratados de forma consistente en todo el texto.
- Tratamiento "tú" o "usted" coherente en todo el documento.
- Sin traducciones literales del inglés que sonarían artificiales en castellano.
- Registro escrito: términos precisos, sujetos explícitos y frases completas.
- Números, fechas y porcentajes en formato español.
- Si es interfaz o presentación, las comprobaciones del fichero correspondiente.

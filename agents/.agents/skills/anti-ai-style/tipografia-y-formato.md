# Tipografía y formato

Patrones relacionados con signos de puntuación, énfasis visual y convenciones
tipográficas que el texto generado por IA sobreutiliza o usa de forma incorrecta.
La señal de entrada: una raya larga, una negrita decorativa, un emoji, un
pseudoencabezado o un punto medio en prosa.

---

## 13. Raya larga (guion largo)

### Problema
La raya larga (—), también llamada guion largo, aparece de forma masiva en texto generado por IA para introducir incisos, dramatizar frases o fragmentar el ritmo. Casi siempre hay un signo más sobrio que hace el mismo trabajo.

### Evitar
- la raya larga (—) en cualquier función: inciso, corte de efecto o sustituto de coma, dos puntos o punto
- “las instituciones —no las personas— y aun así esto continúa—”
- frases con uno o varios incisos entre rayas

### Hacer en su lugar
Sustituir la raya por lo que exprese mejor la relación:
- inciso → comas o paréntesis,
- aclaración → paréntesis, o una frase propia que la desarrolle,
- causa, consecuencia o contraste → el conector que lo diga (porque, así que, pero, aunque, en cambio),
- enumeración, cita o ejemplo anunciado → dos puntos.

Los dos puntos no son el sustituto por defecto. Pegan dos frases sin decir qué relación hay entre ellas, y un texto que cambia cada raya por dos puntos sigue sonando a traducción.

### Ejemplo
**Antes:**  
“el problema afectó a las instituciones —no a las personas— y aun así continúa —a pesar de las advertencias repetidas—”

**Después:**  
“el problema afectó a las instituciones, no a las personas, y sigue existiendo a pesar de las advertencias repetidas”

### Regla operativa
No usar la raya larga (—). Reescribir el inciso con comas o paréntesis y la relación entre ideas con el conector que la exprese; dos puntos solo para anunciar una enumeración, una cita o un ejemplo.

### Nota
La raya es correcta en español según la RAE, que la usa en incisos y diálogos. Esta regla es una preferencia de estilo para los textos que redactas, no una corrección: no la apliques a citas literales ni la presentes como error en textos ajenos. Y al sustituirla por punto, no encadenes frases cortas (ver regla 26).

---

## 14. Uso excesivo de negritas

### Problema
Uso de negritas para enfatizar términos de forma innecesaria o decorativa, especialmente en listas cortas o etiquetas técnicas.

### Evitar
- **OKR**, **KPI**, **BMC**
- negritas repetidas en una misma línea
- énfasis visual constante sobre términos que no requieren destaque

### Hacer en su lugar
Reservar la negrita para títulos, conceptos realmente clave o navegación estructural.

### Ejemplo
**Antes:**  
“**OKR, KPI, BMC**”

**Después:**  
“OKR, KPI, BMC”

### Regla operativa
La negrita debe ayudar a leer, no decorar.  
Si eliminarla no cambia la comprensión, eliminarla.

---

## 15. Listas con encabezado incrustado

### Problema
Construcciones tipo etiqueta + contenido breve dentro de la misma línea, que fragmentan el texto y generan un estilo mecánico o de plantilla.

### Evitar
- “Rendimiento: el rendimiento mejoró”
- “Contexto: el mercado cambió”
- “Resultado: aumentaron las ventas”
- “Impacto: los usuarios respondieron bien”

### Hacer en su lugar
Convertir esas estructuras en prosa natural o en listas reales si corresponde.

### Ejemplo
**Antes:**  
“Rendimiento: el rendimiento mejoró.”

**Después:**  
“el rendimiento mejoró durante el periodo de estudio”

### Regla operativa
No usar pseudoencabezados dentro de una frase si la idea puede escribirse directamente.

### Excepción
En diapositivas, fichas de datos y texto de interfaz, la forma "Etiqueta: valor" y la viñeta sin verbo son el formato correcto ("Coste por respuesta: 4,20 €", "Estado: enviado"). La regla rige la prosa de documentos e informes. Ver `castellano-peninsular/presentaciones.md` e `interfaz.md`.

---

## 16. Encabezados en mayúscula anglosajona

### Problema
Uso sistemático de mayúscula inicial en casi todas las palabras del encabezado, siguiendo una convención anglosajona que a menudo resulta artificial en documentos técnicos o en español.

### Evitar
- “Negociaciones Estratégicas Y Alianzas”
- “Resultados Y Hallazgos Clave”
- “Calidad De Datos Y Validación”

### Hacer en su lugar
Usar mayúscula solo al inicio y en nombres propios.

### Ejemplo
**Antes:**  
“Negociaciones Estratégicas Y Alianzas”

**Después:**  
“Negociaciones estratégicas y alianzas”

### Regla operativa
Salvo que exista una guía editorial específica en sentido contrario, usar encabezados en formato natural del español.

---

## 17. Emojis

### Problema
Uso de emojis en documentos profesionales, técnicos, ejecutivos o de revisión formal, generando un tono impropio o poco sobrio.

### Evitar
- “🚀 Fase de lanzamiento”
- “💡 Idea clave”
- “✅ Recomendación final”
- emojis decorativos en títulos o viñetas

### Hacer en su lugar
Eliminar emojis y dejar solo el texto.

### Ejemplo
**Antes:**  
“🚀 Fase de lanzamiento: 💡 Idea clave:”

**Después:**  
“Fase de lanzamiento. Idea clave:”

### Regla operativa
No usar emojis salvo que el contexto lo requiera de forma explícita y esté alineado con el tono del documento.

---

## 18. Comillas tipográficas innecesarias

### Problema
Uso inconsistente de comillas tipográficas curvas o estilizadas, especialmente en contextos técnicos, código, markdown o documentación donde convienen comillas rectas.

### Evitar
- dijo “el proyecto”
- uso mezclado de “ ” y " "
- comillas tipográficas en nombres de archivos, rutas, variables o cadenas literales

### Hacer en su lugar
Usar comillas rectas en lo técnico (código, rutas, nombres de fichero, valores literales, instrucciones operativas en markdown) y, en la prosa en español de un documento o informe, las angulares de la norma española: « » en primer nivel, " " dentro de ellas, ' ' en tercer nivel. En inglés, las comillas del inglés. Un solo criterio por documento.

### Ejemplo
**Antes:**  
el cliente pidió “un informe más breve” y el campo “fecha_fin” llega vacío

**Después:**  
el cliente pidió «un informe más breve» y el campo `fecha_fin` llega vacío

### Regla operativa
Mantener consistencia tipográfica.  
En código, rutas, literales y documentación operativa, comillas rectas o formato de código. En la prosa española de documentos e informes, comillas angulares. Nunca curvas inglesas “ ” en texto español.

---

## 25. Punto medio decorativo

### Problema
Uso del punto medio o interpunct (·) como separador ornamental en línea, frecuente en texto generado por IA para encadenar etiquetas o rasgos. En prosa casi siempre cabe una coma o una conjunción.

### Evitar
- “rápido · fiable · seguro”
- “Diseño · Código · Documentación”
- el punto medio como sustituto de coma, de “y” o de un salto de lista

### Hacer en su lugar
Usar coma y conjunción en prosa, o una lista real si los elementos lo piden.

### Ejemplo
**Antes:**  
“rápido · fiable · seguro”

**Después:**  
“rápido, fiable y seguro”

### Excepción
En contextos técnicos o de marca donde el punto medio es deliberado y consistente (por ejemplo, la statusline de dotmesh: “modelo · rama · coste”), mantenerlo. La regla rige la prosa, no las interfaces ni el branding.

### Regla operativa
En prosa, no usar el punto medio (·) como separador. Sustituirlo por coma y conjunción, o por una lista.

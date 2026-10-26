# Texto de interfaz

Abre este fichero cuando escribas texto que el usuario verá dentro de una
aplicación: botones, menús, pestañas, etiquetas y ayudas de formulario,
mensajes de error y de confirmación, estados vacíos, avisos y ficheros de
traducción (i18n). La señal de entrada: un literal en JSX, TSX, Vue, Svelte o
HTML, o una clave nueva en un fichero de cadenas.

El texto de interfaz no es prosa de documento. Se lee de pasada, en un
espacio corto y en el momento de actuar. Varias reglas de `anti-ai-style` no
aplican aquí (ver al final), y algunas de `SKILL.md` se invierten.

---

## Tratamiento
Elige tú o usted una vez por producto y mantenlo en todas las pantallas,
correos y mensajes del sistema. Por defecto, tú. Nada de mezclar "Introduce tu
correo" con "Su sesión ha caducado".

## Botones y acciones
- Infinitivo o sustantivo, no imperativo: "Guardar cambios", "Enviar", "Descargar informe". El imperativo ("Guarda") se reserva para instrucciones en frases completas.
- Verbo concreto: "Eliminar proyecto", no "Aceptar"; "Enviar solicitud", no "OK" ni "Continuar" cuando la acción tiene nombre.
- La pareja de un diálogo nombra las dos acciones: "Eliminar" y "Cancelar", no "Sí" y "No".
- Mayúscula solo inicial: "Crear cuenta", no "Crear Cuenta". Igual en pestañas, menús, títulos de pantalla y cabeceras de tabla.
- Sin punto final en botones, etiquetas, títulos ni elementos de menú.

## Mensajes de error
Dicen qué ha pasado y qué puede hacer el usuario, en ese orden y sin culparle.

- Antes: "Error 422: entrada no válida."
- Después: "La fecha de fin es anterior a la de inicio. Cambia una de las dos."

Sin "Ups", sin signos de exclamación y sin códigos técnicos en primer plano (si
hacen falta para soporte, al final y en un tono menor).

## Confirmaciones y estados vacíos
- Confirmación breve y concreta: "Informe enviado a 3 personas", no "¡Genial! Todo ha ido perfecto".
- Estado vacío que explique qué aparecerá ahí y cómo empezar: "Aún no hay encuestas. Crea la primera para empezar a recoger respuestas."

## Etiquetas y ayudas de formulario
- Etiqueta como sustantivo: "Correo electrónico", "Fecha de nacimiento".
- El texto de ayuda va debajo del campo y dice el formato esperado: "Formato: DD/MM/AAAA".
- El marcador de posición (placeholder) no sustituye a la etiqueta.

## Números, fechas y monedas
No construyas formatos a mano. Usa la API de internacionalización con la
configuración regional `es-ES`:

```js
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const pct = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 })

new Intl.NumberFormat('es-ES').format(12500.5)                              // "12.500,5"
eur.format(1250)                                                            // "1250,00 €"
pct.format(0.125)                                                           // "12,5 %"
new Intl.DateTimeFormat('es-ES', { dateStyle: 'long' }).format(new Date(2026, 2, 3))  // "3 de marzo de 2026"
```

Comprobado con Node 22. Los espacios que `Intl` pone antes de `€` y `%` son de
no separación (U+00A0), así que no compares con un espacio normal en los tests.

`Intl` aplica la convención CLDR para `es-ES`, que usa punto de millares en
cifras de cinco o más dígitos y no agrupa las de cuatro. Difiere de la norma
de la RAE que sigue `calcos-y-numeros.md` (espacio), y en una interfaz se
acepta: es lo que el usuario espera ver en cualquier aplicación española y es
coherente en toda la pantalla. No mezcles los dos criterios en la misma vista.

## Plurales y género
- Gestiona los plurales con la herramienta de i18n (`Intl.PluralRules`, ICU), no con "(s)": "1 respuesta", "3 respuestas", no "3 respuesta(s)".
- Evita construcciones que obliguen a concordar con un género desconocido: "Te damos la bienvenida", no "Bienvenido/a".

## Lo que no aplica de anti-ai-style
- Pseudoencabezados del tipo "Etiqueta: valor" (regla 15): en una ficha de datos o un resumen de estado son la forma correcta.
- Listas y fragmentos sin verbo: un menú o un listado de opciones no tiene que ser prosa.
- Ritmo de frase (regla 26): el texto de interfaz es corto a propósito.

Siguen aplicando las demás: nada de emojis decorativos, negritas de adorno,
lenguaje promocional ni tono complaciente.

---

## Comprobación
- ¿El tratamiento es el mismo en toda la interfaz?
- ¿Los botones usan infinitivo o sustantivo y nombran la acción?
- ¿Algún título, pestaña o botón tiene mayúsculas de estilo inglés?
- ¿Cada error dice qué ha pasado y qué hacer?
- ¿Las cifras, fechas y monedas salen de `Intl` con `es-ES`?
- ¿Quedan "(s)", "/a" o "OK"?

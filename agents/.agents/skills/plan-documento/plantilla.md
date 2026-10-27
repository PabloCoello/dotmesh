# Plantilla del plan

Copia esta estructura en `.ai/tasks/<slug>/plan-documento.md` y rellénala. Las
partes entre corchetes se sustituyen; las líneas que empiezan por `>` son ayuda
y se borran al rellenar. Al final hay una ficha de ejemplo ya rellena.

---

```markdown
# Plan: [título del documento]

## Lector

- Quién es: [perfil concreto, no «técnico» o «negocio»]
- Qué sabe al empezar: [conocimientos que se dan por supuestos]
- Qué no sabe: [lo que el documento tiene que enseñarle]
- Para qué lo usa: [leer de corrido, consultar, decidir, aplicar]
- Qué puede hacer al terminar: [decisión o tarea concreta]

> Si hay dos públicos, describe los dos y di qué apartados son de cada uno.

## Arco

- Pregunta o tensión de partida: [el problema, formulado para que al lector le importe]
- Hilo conductor: [caso o escenario que se recorre en todo el documento]
- Desenlace: [idea con la que se queda el lector y qué hace después]

## Tono y recursos

- Registro: [formal técnico, divulgativo, ejecutivo]
- Tratamiento: [tú, usted, impersonal]
- Ejemplos: [hilo conductor y ejemplos puntuales previstos]
- Analogías: [cuáles y dónde, o ninguna]
- Figuras y tablas: [cuáles y en qué apartados]
- Humor: [ninguno, o dónde y de qué tipo]

## Mapa de conceptos

| Concepto | Primera aparición | Grado | Se retoma en |
|---|---|---|---|
| [concepto] | [apartado] | mencionar / explicar / desarrollar | [apartados, con su grado] |

> Ningún concepto se usa antes de su primera aparición. Los difíciles tienen
> dos filas de grado: intuición primero, detalle después.

## Apartados

### [N. Título del apartado]

- Propósito: [una frase: qué entiende o puede hacer el lector al terminarlo]
- Entra sabiendo: [lo que trae de apartados anteriores]
- Sale sabiendo: [lo nuevo que se lleva]
- Conceptos nuevos: [concepto (grado), máximo tres]
- Conceptos retomados: [concepto (grado)]
- Ejemplo: [qué parte del hilo conductor o qué ejemplo puntual]
- Enlace de entrada: [cómo conecta con el apartado anterior]
- Enlace de salida: [qué deja planteado para el siguiente]
- Cierre: [resumen de lo explicado, sí o no, y por qué]
- Extensión: [párrafos o palabras orientativas]
- Contenido: [datos, fuentes, ficheros o cifras que hay que usar]

> Repite la ficha para cada apartado, en el orden del documento.
```

---

## Ficha de ejemplo

Primer apartado de un manual de usuario de traza, una herramienta que registra
las decisiones de un análisis de datos y comprueba su coherencia.

```markdown
### 1. Qué es este manual

- Propósito: que el lector entienda por qué un análisis necesita dejar
  evidencia de sus decisiones y qué papel tiene traza en ello.
- Entra sabiendo: estadística aplicada y pandas; nada de traza ni de
  inferencia causal.
- Sale sabiendo: el problema que resuelve el manual, qué hace traza a grandes
  rasgos y qué no va a encontrar aquí.
- Conceptos nuevos: traza (explicar), fase del análisis (mencionar).
- Conceptos retomados: ninguno.
- Ejemplo: ninguno todavía; el caso de los indultos se presenta en el
  apartado 3.
- Enlace de entrada: es el primero. Abre con la situación del lector (un
  análisis cuyas conclusiones alguien va a discutir), no con la herramienta.
- Enlace de salida: anuncia que el apartado siguiente dice para quién está
  pensado el manual y qué necesita saber antes de empezar.
- Cierre: sin resumen; es corto.
- Extensión: dos párrafos, unas 180 palabras.
- Contenido: remitir a la sección Arranque del README y a `traza --help` para
  instalación y referencia de comandos.
```

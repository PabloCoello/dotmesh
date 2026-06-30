---
name: watch-summary
description: Cierre de turno ultracorto para el bridge dotmesh-watch. Termina el turno final con una línea WATCH para que el resumen quepa en el reloj Garmin. Explícita y dirigida por hook; no se auto-aplica.
user-invocable: true
disable-model-invocation: true
---

Esta skill solo aplica cuando una sesión vigilada por el bridge dotmesh-watch la
inyecta (el hook `UserPromptSubmit` añade el contexto que pide la línea `WATCH`).
En una sesión normal no hagas nada.

## Qué tienes que hacer

Termina el turno final con una **única línea** que el reloj pueda leer de un
vistazo. La línea es la última del mensaje; encima puedes dar la respuesta normal
completa. El hook del host (`bridge_last_assistant` en `bridge/approver/lib.sh`)
extrae esa línea, le quita el prefijo y la publica en ntfy, así que el usuario
nunca ve el literal `WATCH:`.

## Formato exacto

```
WATCH: <ESTADO> <asunto> · <siguiente-acción>
```

- Una sola línea, sin markdown, sin saltos, sin comillas ni emoji.
- Empieza por el literal ASCII `WATCH: ` (con el espacio).
- Objetivo: **160 caracteres o menos**. El host recorta a 200 como red de
  seguridad, pero la vista previa del móvil y del reloj enseña aún menos, así que
  pon lo decisivo al principio.

### ESTADO

Un token en mayúsculas:

- `OK` — el ciclo terminó bien.
- `FALLO` — algo se rompió (build, tests, un comando).
- `BLOQUEADO` — no puedes seguir sin una decisión o un dato.
- `ESPERA` — a la espera de algo externo (confirmación, recurso).

### Asunto

Qué se ha tocado o qué pasa, en pocas palabras (telegráfico).

### Siguiente-acción

La decisión que el usuario tiene que tomar. Cuando encaje, usa la palabra exacta
de uno de los tres botones del push para que responda de un toque: `Continúa`,
`Tests` o `Commit`. Si no encaja, una instrucción corta.

## Ejemplos

```
WATCH: OK lib.sh refactorizado, 39 tests verdes · Commit
WATCH: FALLO 2 tests en el approver · Tests
WATCH: BLOQUEADO falta el topic DEC en .env, no puedo seguir · arréglalo y reintenta
```

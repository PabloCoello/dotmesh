---
name: structured-search
description: Use for structural code search with ast-grep when plain text search returns too much noise or when matching syntax shape matters.
---

# Búsqueda estructural

Usa esta skill cuando necesites encontrar código por forma sintáctica, no por texto literal. `ast-grep` es opcional en dotmesh: si no está instalado, usa `grep`/`rg` o las herramientas de búsqueda del agente.

En OpenCode, el uso normal de `ast-grep` queda reservado a `maker` y `build`. Los agentes `review` y `security` mantienen `bash` restringido y no reciben un permiso especial de `ast-grep`, para evitar escritura indirecta mediante redirecciones o encadenado de comandos.

Las reglas de `maker` y `build` son guardarraíles para invocaciones reconocibles de `ast-grep`, no un sandbox. Esos agentes ya tienen shell y escritura; cualquier comando que contenga `ast-grep` pide confirmación. No uses el alias `sg`: queda en `ask` y puede ser ambiguo en Linux.

## Comandos seguros

Preferir el binario largo `ast-grep`. La documentación oficial también menciona `sg`, pero en Linux ese nombre puede chocar con `setgroups`.

```bash
ast-grep run -p 'console.log($$$ARGS)' -l ts src
ast-grep run -p 'function $NAME($$$ARGS) { $$$BODY }' -l js .
ast-grep outline src/parser.ts
```

Usa comillas simples alrededor del patrón para que la shell no expanda `$NAME` o `$$$ARGS`.

## Límites

- La confirmación humana es el límite operativo: revisa la orden antes de aprobarla.
- No uses `--rewrite`, `-r`, `--interactive`, `-i`, `--update-all` ni `-U` para exploración normal. Las variantes compactas como `-r=...`, `-r...`, `-iU` o `--rewrite=...` también quedan fuera del uso normal.
- No añadas configuración `sgconfig.yml` ni reglas persistentes salvo que el proyecto lo pida.
- No instales `ast-grep` como dependencia global desde una sesión de agente.

## Fuentes

- CLI: https://ast-grep.github.io/reference/cli
- `run`: https://ast-grep.github.io/reference/cli/run
- tooling: https://ast-grep.github.io/guide/tooling-overview

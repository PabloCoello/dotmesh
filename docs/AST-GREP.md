# Búsqueda estructural con ast-grep

Fue la skill `structured-search` hasta el 04-10-2026, cuando se retiró con cero invocaciones (mirador `skill_obs.py` sobre `~/.claude/projects`, 826 transcripts); el contenido se conserva aquí como referencia.

Consulta este documento cuando necesites encontrar código por forma sintáctica, no por texto literal. `ast-grep` es opcional en dotmesh: si no está instalado, usa `grep`/`rg` o las herramientas de búsqueda del agente.

Los permisos de OpenCode para `ast-grep` (quién puede usarlo y qué pide confirmación) los fija `opencode/.config/opencode/README.md`; este documento no los repite.

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

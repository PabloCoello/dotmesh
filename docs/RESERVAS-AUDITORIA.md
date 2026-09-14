# Reservas a la auditoría externa

La auditoría externa de la configuración de Claude Code (septiembre de 2026, sin
versionar) mezcla cifras medidas en dotmesh con cifras de blogs y de preprints.
Aquí se apuntan las afirmaciones que no se sostienen tal como están escritas.
Las decisiones que motivó la auditoría están en [`adr/`](adr/README.md).

Las líneas citadas son las de la auditoría y las del informe del estudio maker
contra vanilla, `.ai/tasks/2026-09-10-estudio-maker-vs-vanilla/informe.md`.

## R-1. El brazo vanilla no falta: no llegó a correr

La auditoría dice que al examen del flujo le falta un brazo vanilla comparable
(líneas 6, 105 y 124). El estudio maker contra vanilla lo tenía definido: A0 es
Claude Code sin configurar y A2, skills y subagentes sin la persona (informe,
líneas 52 y 56). Ninguno de los dos corrió en la métrica final (líneas 42-45 y
271). El hueco es de ejecución, no de diseño, y lo cubre el banco de la tarea
T15.

## R-2. Las cifras de tokens vienen de blogs

Las cifras de contexto de arranque de la auditoría son de terceros: 43,6k tokens
por subagente (línea 30, un artículo de dev.to) y unos 55.000 por cinco
servidores MCP (línea 74, una guía de Duet). La propia auditoría advierte de sus
fuentes en la línea 133.

Medido el 13-09-2026 sobre 128 transcripts de subagentes de esta máquina, como
contexto del primer turno, prompt del orquestador incluido:

| Tipo | n | Mediana | Rango |
|---|---:|---:|---:|
| Explore | 6 | 13,8k | 12,0k-16,0k |
| review | 41 | 17,3k | 15,2k-29,0k |
| security | 19 | 19,2k | 17,4k-24,1k |
| plan | 5 | 20,5k | 19,9k-20,9k |
| build | 32 | 21,4k | 20,6k-25,8k |
| general-purpose | 22 | 39,8k | 39,3k-51,0k |

La cifra del blog se parece a la de `general-purpose`. Los subagentes propios de
dotmesh arrancan con menos de la mitad.

```bash
python3 - <<'EOF'
import glob, json, statistics as st, collections
g = collections.defaultdict(list)
for m in glob.glob('/home/problemas/.claude/projects/-home-problemas-Documentos-GitHub-dotmesh/*/subagents/*.meta.json'):
    tipo = json.load(open(m)).get('agentType', '?')
    for linea in open(m[:-len('.meta.json')] + '.jsonl'):
        d = json.loads(linea)
        if d.get('type') == 'assistant':
            u = d['message']['usage']
            g[tipo].append(u['input_tokens'] + u.get('cache_creation_input_tokens', 0)
                           + u.get('cache_read_input_tokens', 0))
            break
for tipo, v in sorted(g.items(), key=lambda x: st.median(x[1])):
    print(tipo, len(v), st.median(v), min(v), max(v))
EOF
```

## R-3. Las cifras de SkillsBench son de un preprint

Las cifras que más pesan en la auditoría salen todas de SkillsBench (arXiv
2602.12670): +16,6 pp de media con skills, +4,5 pp en ingeniería de software,
+19,0 pp con skills compactas y +0,7 pp con documentación exhaustiva (líneas 12,
14, 42 y 44). La auditoría cita además los preprints 2603.15401, 2605.20023,
2606.11543, 2606.20659 y 2601.11868. Ninguna cifra se ha contrastado con el
artículo original.

El único dato propio en esa dirección es el contraste entre el encargo ancho de
una sola pasada y el flujo completo A3: +17,3 pp con IC 90 % [+4,5, +27,6]
(informe, línea 166). Esa tanda se decidió después de ver los datos y su
potencia ronda el 40 % (líneas 170-171): es una hipótesis para preregistrar, no
una confirmación.

## R-4. El gate de seguridad tiene un dato propio en contra

La auditoría pone los subagentes con herramientas restringidas entre lo que
dotmesh hace por delante del consenso (línea 4). Es un elogio al diseño, no una
medición. El único dato propio sobre la cobertura del gate va en sentido
contrario: en los secretos sembrados, la clase donde A3 tiene un subagente
`security` dedicado, A3 detectó 4 de 6 y los dos encargos de una sola pasada, 6
de 6 (informe, líneas 207 y 212-215). Son seis observaciones por celda y no hay
contraste. El informe pide revisarlo antes de dar por buena la cobertura del
gate (línea 315).

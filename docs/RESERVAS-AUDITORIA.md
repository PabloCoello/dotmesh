# Reservas a la auditoría externa

La auditoría externa de la configuración de Claude Code (septiembre de 2026, sin
versionar) mezcla cifras medidas en dotmesh con cifras de blogs y de preprints.
Aquí se apuntan las afirmaciones que no se sostienen tal como están escritas.
Las decisiones que motivó la auditoría están en [`adr/`](adr/README.md).

Las líneas citadas son las de la auditoría y las del informe del estudio maker
contra vanilla, `.ai/tasks/2026-09-10-estudio-maker-vs-vanilla/informe.md`.

De R-5 en adelante se apunta también lo contrario: afirmaciones nuestras que la
medición posterior no sostiene.

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

## R-5. El umbral de +2 pp por skill no es medible con este instrumento

R-1 daba el hueco del brazo vanilla por cubierto con el banco. Lo cubre, pero no
cubre lo que venía detrás: la tarea T16 del plan pedía un delta por skill y la
aplicación literal de un umbral —retirada por debajo de +2 pp, sin tocar por
encima de +10 pp—. Ese umbral no se puede aplicar, por dos motivos medidos que
son independientes.

El primero es que la bandera no hace lo que el criterio da por hecho. El propio
`claude plugin eval --help` de la versión 2.1.274 describe `--ablation
with-without` como «Run a no-plugin baseline arm and report the score delta»: un
delta, el plugin entero puesto contra el plugin entero quitado. No hay ablación
por skill. De paso cambia lo que se puntúa, porque bajo ese modo los graders
marcados `with-only` —entre ellos los de `tool_used: Skill`— dejan de contar en
la nota y pasan a ser un indicador de que el plugin se disparó.

El segundo es que el ruido del banco es mayor que la banda de decisión. Las dos
tandas del 29-09-2026 corrieron contra el mismo commit de dotmesh, con los
mismos casos y la misma configuración: entre brazos idénticos, sobre los diez
casos que ambas completaron, la puntuación fue de 71,17 a 74,39 (3,22 pp) y el
logro, de 68,06 a 70,00 (1,94 pp). La banda que T16 quería resolver es de 2 pp.
Dicho de otro modo, el instrumento no distingue una skill que aporta +2 pp de
otra que no aporta nada, y tampoco lo distinguiría de sí mismo.

Medirlo de verdad exige un brazo por skill, no una bandera. Una tanda de doce
casos por tres tiradas costó 49,17 USD de agente más 0,75 del juez. Veintiocho
skills (las que había en la fecha de esta reserva) más el brazo de referencia son veintinueve tandas, del orden de 1.450
USD, y con el ruido de arriba ni siquiera bastarían: para separar 2 pp habría
que repetir cada brazo varias veces y multiplicar esa cifra.

Queda en pie el criterio que no necesita delta: el de invocación cero. Las tres
skills de ideación —`grilling`, `grill-me` y `grill-with-docs`— suman siete
invocaciones en 756 sesiones, y T17 se decide con ese recuento y no con el
umbral.

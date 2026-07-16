# doc-review

Skill de revisión de documentos con mesh-review V2.

Lee los ficheros de evento de `.ai/review/<ruta-doc>/`, proyecta el estado actual de cada hilo y actúa sobre el documento.

Consulta `SKILL.md` para el flujo completo de revisión y `schema.json` para el contrato normativo de los eventos V2.

---

## CLI `mesh-review`

El artefacto `bin/mesh-review.mjs` es un CLI ejecutable (Node.js ESM, `node ≥22`) que encapsula la lógica de proyección de eventos para que los agentes no tengan que reimplementarla.

### Ruta del artefacto

```
agents/.agents/skills/doc-review/bin/mesh-review.mjs
```

Tras `make stow` llega a `~/.agents/skills/doc-review/bin/mesh-review.mjs`; tras `make link-skills`, también a `~/.claude/skills/doc-review/bin/mesh-review.mjs`.

### Uso básico

```bash
# Proyecta todos los hilos abiertos de un documento
mesh-review project docs/informe.md

# Solo los hilos accionables en este momento
mesh-review project --pending docs/informe.md

# Emite un evento de revisión
mesh-review emit docs/informe.md message.posted \
  thread_id=<uuid> \
  body="Corrección aplicada." \
  commit=<sha> \
  author.kind=ai \
  author.model=claude-sonnet-4-6
```

### Cuándo regenerar el artefacto

El artefacto es la distribución compilada de la fuente TypeScript en
`vscode/review-extension/src/cli/`. Debe regenerarse cuando se modifique
cualquier fichero bajo esa ruta o las funciones de proyección en
`vscode/review-extension/src/sidecar.ts` o `anchor.ts`.

Para regenerar:

```bash
make cli-build
```

El artefacto commiteado (`bin/mesh-review.mjs`) es la fuente de distribución
canónica; la fuente TypeScript es la fuente de edición. Ambas deben mantenerse
sincronizadas: ejecuta `make cli-build` y commitea `bin/mesh-review.mjs`
siempre que cambie el código fuente del CLI.

# mesh-review

Extensión de VS Code para anotar comentarios de revisión anclados a fragmentos de texto sobre cualquier documento. Los comentarios se almacenan como un log de eventos JSON append-only en `.ai/review/`, organizado en subdirectorios por documento. Los agentes IA consumen ese log mediante el skill `doc-review`.

## Instalación

Desde la raíz del repositorio dotmesh:

```bash
make review-install
```

Requiere `node` y `code` disponibles en el PATH. El comando compila la extensión e instala el VSIX resultante en VS Code.

## Uso

### Crear un comentario

Selecciona el fragmento de texto a comentar en el editor y pulsa `Ctrl+Alt+Z` (Mac: `Alt+Cmd+Z`).

Un QuickPick pide el tipo y el cuerpo del comentario.

Para los tipos `verifica` y `supuesto`, un segundo QuickPick pide el nivel de confianza: `alta`, `media` o `baja`.

Tipos disponibles: `edita`, `sugerencia`, `pregunta`, `verifica`, `nota`, `referencia`, `supuesto`.

### Panel de hilos

El icono de mesh-review en la barra de actividad abre el panel `Hilos`. Para el documento activo muestra:

- Los hilos abiertos, con botones de acción (resolver, responder, editar, asignar, diff).
- La sección "Resueltos (N)", colapsada.
- La sección "Desanclados (N)", colapsada, con los hilos cuyo texto ancla ha desaparecido.
- La sección "Repositorio (N)", colapsada, con los hilos abiertos de todos los documentos del workspace.

### Navegación por teclado

| Acción | Linux/Windows | Mac |
|---|---|---|
| Crear comentario | `Ctrl+Alt+Z` | `Alt+Cmd+Z` |
| Siguiente hilo | `Ctrl+Alt+N` | `Alt+Cmd+N` |
| Hilo anterior | `Ctrl+Alt+P` | `Alt+Cmd+P` |

Los comandos de navegación saltan al ancla del siguiente o anterior hilo abierto en el documento activo, ordenados por posición en el texto.

### Compositor

Al pulsar "Responder" o "Editar" en una tarjeta, aparece un textarea bajo ella. `Ctrl+Enter` envía el mensaje; `Esc` cancela. El borrador se conserva entre repintados del panel mientras no se envía.

### Asignación

El botón `Asignar` en una tarjeta abierta muestra un QuickPick con los subagentes disponibles: `security`, `maths`, `reviser`, `editor`. La selección escribe un evento `thread.assigned` en el log.

### Diff por hilo

El botón de diff en cada tarjeta abre una vista comparativa entre la versión del documento en el commit en que se creó el comentario y la versión actual. El título de la pestaña tiene el formato `nombre_fichero · tipo · sha` (7 dígitos). Cada nuevo diff cierra el anterior.

### Sección Repositorio

"Repositorio (N)" al pie del panel lista los hilos abiertos de todos los documentos del workspace con eventos en `.ai/review/`, hasta un máximo de 50 documentos. Al hacer clic en un hilo, VS Code abre el documento y salta al ancla.

### Badge

El icono de la extensión en la barra de actividad muestra el número de respuestas de agente IA no vistas. El contador se pone a cero al abrir el panel.

## Configuración

| Setting | Tipo | Defecto | Descripción |
|---|---|---|---|
| `mesh-review.badge.toast` | `boolean` | `false` | Muestra una notificación al recibir respuestas IA nuevas. |
| `mesh-review.navigation.cyclic` | `boolean` | `true` | La navegación entre hilos cicla al llegar al último o al primero. |

## Modelo de datos

Cada evento es un objeto JSON escrito en un fichero independiente dentro de `.ai/review/<ruta_relativa_del_documento>/` en la raíz del repositorio. El log es append-only; los eventos nunca se modifican ni se borran.

Los tipos de evento son: `thread.opened`, `message.posted`, `message.revised`, `message.retracted`, `thread.status-changed`, `thread.reanchored`, `thread.assigned`.

El esquema completo está en `agents/.agents/skills/doc-review/schema.json`. El skill `doc-review` lee ese log, actúa sobre los hilos abiertos según tipo y prioridad, y cierra la revisión marcando cada comentario como resuelto.

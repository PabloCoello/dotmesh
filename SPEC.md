# Spec: adaptar /super-git para commits atómicos desde cambios grandes

## Objetivo

Adaptar el comando `/super-git` para que analice un conjunto grande de modificaciones del working tree y lo divida en commits coherentes. El comando debe dejar de depender de que el usuario haya preparado cambios en staging antes de invocarlo.

El usuario principal es quien trabaja en una rama con muchos cambios mezclados y quiere convertirlos en una serie de commits revisables, atómicos y con mensajes en formato Conventional Commits.

El resultado esperado es una secuencia de commits pequeños, cada uno con una intención clara, una selección de cambios revisada por el usuario y un mensaje que siga las reglas de nomenclatura existentes.

## Alcance

### Incluido

- Reemplazar la funcionalidad actual de `/super-git` manteniendo el mismo nombre de comando.
- Analizar cambios staged, unstaged y archivos untracked.
- Proponer grupos de cambios coherentes antes de preparar cada commit.
- Confirmar cada commit con el usuario antes de crearlo.
- Usar Conventional Commits con los tipos ya definidos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `experiment`, `analysis` y `data`.
- Incluir scope siempre que pueda inferirse de forma razonable.
- Mantener la primera línea del mensaje con un máximo de 72 caracteres.
- Ejecutar `git diff --check` antes de cada commit.
- Si hay cambios ambiguos o inseparables, crear un commit amplio con body explicativo, previa confirmación del usuario.
- No hacer push.

### Excluido

- Cambiar el nombre del comando.
- Crear comandos nuevos.
- Hacer push, merge, rebase o cambios destructivos.
- Modificar reglas globales de Git.
- Resolver conflictos de merge.
- Ejecutar verificaciones pesadas por defecto, como `make health`, salvo que el usuario lo pida en una sesión concreta.

## Interfaces

### Comando expuesto

El comando sigue siendo:

```bash
/super-git
```

### Comportamiento esperado

Al invocarse, el comando debe:

1. Inspeccionar el estado del repositorio con comandos equivalentes a:

   ```bash
   git status --short
   git diff
   git diff --staged
   ```

2. Si no hay cambios staged, unstaged ni untracked, parar e indicar que no hay cambios que commitear.

3. Analizar todos los cambios y proponer el siguiente commit atómico.

4. Mostrar al usuario:

   - archivos o hunks incluidos,
   - intención del commit,
   - tipo y scope propuestos,
   - mensaje Conventional Commits propuesto,
   - cambios que quedarían fuera.

5. Pedir confirmación antes de preparar y crear cada commit.

6. Preparar los cambios del commit confirmado.

7. Si un mismo archivo contiene cambios de grupos distintos, usar `git add -p` para que el usuario revise los hunks interactivos. Esta opción se elige frente a patches temporales no interactivos porque reduce el riesgo de preparar hunks incorrectos en repositorios con cambios locales sensibles o heterogéneos.

8. Ejecutar:

   ```bash
   git diff --check --cached
   ```

9. Si la verificación falla, parar y mostrar el error. No crear el commit.

10. Crear el commit sin abrir editor mediante:

    ```bash
    git commit -m "<mensaje generado>"
    ```

11. Repetir el proceso hasta que no queden cambios o el usuario decida parar.

### Convención de mensajes

Todos los mensajes deben seguir este formato:

```text
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Reglas:

- Usar modo imperativo en inglés: `add`, `fix`, `update`.
- No capitalizar la descripción.
- No terminar la primera línea con punto.
- Mantener la primera línea en 72 caracteres o menos.
- Incluir scope cuando sea posible.
- Usar `!` o footer `BREAKING CHANGE:` si hay cambio incompatible.

Selección de tipo:

- `feat`: nueva funcionalidad o nueva superficie pública.
- `fix`: corrección de defecto.
- `docs`: solo documentación, README o comentarios.
- `refactor`: reestructuración interna sin cambio funcional.
- `test`: solo pruebas.
- `chore`: build, CI/CD, dependencias o scripts de soporte.
- `experiment`: cambios de diseño experimental.
- `analysis`: cambios de análisis estadístico.
- `data`: gestión, limpieza o anonimización de datos.

Los tipos `experiment`, `analysis` y `data` son extensiones requeridas para el workflow del usuario. No deben etiquetarse como tipos específicos de un proyecto concreto.

Cuando un grupo combine varios tipos, debe elegirse el tipo dominante y explicar los cambios secundarios en el body.

## Criterios de aceptación

- `/super-git` ya no exige que existan cambios en staging antes de ejecutarse.
- `/super-git` detecta cambios staged, unstaged y untracked.
- `/super-git` propone commits atómicos y pide confirmación antes de cada commit.
- `/super-git` puede dividir cambios dentro del mismo archivo mediante `git add -p`.
- `/super-git` ejecuta `git diff --check --cached` antes de cada commit.
- Si `git diff --check --cached` falla, no se crea el commit.
- Si hay cambios ambiguos o inseparables, el comando propone un commit amplio con body explicativo y pide confirmación antes de hacerlo.
- Cada commit se crea con `git commit -m "<mensaje>"`.
- Los mensajes generados cumplen Conventional Commits y las reglas existentes.
- El comando no hace push.

## Límites operativos

- Siempre: preservar cambios del usuario y pedir confirmación antes de cada commit.
- Siempre: revisar qué queda fuera de cada commit antes de continuar.
- Siempre: usar `git diff --check --cached` como verificación mínima.
- Preguntar antes: ejecutar verificaciones más largas, como `make health`.
- Preguntar antes: descartar cambios o limpiar archivos no seguidos.
- Nunca: hacer push.
- Nunca: usar comandos destructivos como `git reset --hard`, `git clean -fd` o `git checkout -- <path>` sin una instrucción explícita del usuario.
- Nunca: commitear secretos, tokens, credenciales o datos locales sensibles.

## Preguntas cerradas resueltas

- Incluir archivos untracked: sí.
- Confirmación: confirmar cada commit.
- División de cambios en un mismo archivo: usar `git add -p`.
- Cambios ambiguos o inseparables: proponer commit amplio con body explicativo.
- Verificación entre commits: `git diff --check --cached`.
- Nombre del comando: mantener `/super-git`.

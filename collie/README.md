# collie — el puente móvil de herdr

[Collie](https://github.com/AltanS/collie) es un plugin de herdr: un puente en Bun más
una PWA que se sirve por `tailscale serve` y permite pilotar los panes de herdr desde el
móvil, con notificación push cuando un agente se bloquea.

Su razón de estar en dotmesh es el contrato `WAIT_FOR_USER` de [AGENTS.md](../AGENTS.md):
un agente para y pide una decisión cerrada, y sin esto la fase se queda parada hasta que
vuelves al ordenador.

## Instalación

```bash
make collie-install
```

El script es idempotente, no usa sudo y nunca arranca el puente. Comprueba las
precondiciones y para con instrucciones si falta alguna. Al terminar imprime los tres pasos
que quedan una sola vez: generar las claves de push, publicar el puente en el tailnet y
emparejar el móvil.

Dos cosas que hace y no se deducen de lo anterior. Tras una instalación nueva compara el
commit que ha resuelto la etiqueta con el pin y desinstala si no coinciden, porque las
etiquetas de GitHub se pueden mover. Y si es él quien acaba de crear el `.env`, para la
unidad: herdr decide si arranca el servicio al instalar el plugin, y en esa ventana el
puente correría sin gate de escritura. Si el `.env` ya existía, no toca el servicio.

`collie/` **no está en `PACKAGES`** ni en `make install`. El puente es acceso a shell
remoto y se instala a propósito, nunca de arrastre.

## Política de arranque

La unidad queda instalada pero **deshabilitada**, y sin `linger`. El puente existe solo
mientras lo usas:

```bash
systemctl --user start collie    # al empezar una sesión larga
systemctl --user stop  collie    # al terminar
```

Esto es deliberado. El interruptor de seguridad es el servicio, no Tailscale: con
`RouteAll=false` y sin nodo de salida, Tailscale aquí es una red privada entre tus
dispositivos, no un túnel que encamine tu tráfico. Apagarla no reduce la superficie y sí
rompe el enlace de las notificaciones push, que llegan por FCM aunque el tailnet esté caído.

Lo que nunca debe cambiar: **Funnel apagado**. Compruébalo con `tailscale funnel status`,
que tiene que decir `tailnet only`. Es lo único que convertiría esto en acceso a shell
expuesto a internet.

## Los presets

Los tres `.toml` de `.config/herdr/plugins/config/herdr.collie/` se enlazan junto al
`.env` del puente. Se releen en caliente: al editarlos basta con recargar la página.

| Fichero | Qué configura |
|---|---|
| `keys.toml` | Los acordes bajo «Presets» de la bandeja de teclas |
| `quick-replies.toml` | Las respuestas de un toque del dock Quick |
| `commands.toml` | La paleta de comandos de agente |

**Cuidado con la semántica.** Según la ADR 0018 de Collie, en un pane que tus filas
direccionen, tus filas son la lista **entera**: el juego que Collie trae de serie se
pierde, no se fusiona. Por eso `keys.toml` repite las seis teclas de fábrica y por eso
`commands.toml` no direcciona panes de Codex, donde dotmesh no aporta comandos propios y
perder el catálogo no compraría nada.

## Trampas conocidas

Ninguna está documentada en el repo de Collie y todas vuelven a morder en una máquina nueva.
Las cuatro primeras son guardas del instalador; la última no se puede automatizar.

1. **`bunx` no viene con el binario suelto de Bun.** El build lo invoca para el typecheck y
   falla con «orden no encontrada». El instalador oficial lo crea como symlink; el script
   lo crea si falta.
2. **`tailscale serve` se cuelga sin error ni timeout** si el tailnet no tiene certificados
   HTTPS. Se activan solo desde [la consola web](https://login.tailscale.com/admin/dns), y
   el síntoma es `CertDomains` ausente en `tailscale status --json`.
3. **Hace falta ser operador de `tailscaled`**: `sudo tailscale set --operator=$USER`.
4. **Un `.env` sin `COLLIE_TRUSTED_USER` deja el puente abierto a escritura.** El script lo
   escribe antes del primer arranque para que no exista esa ventana, deduciendo la identidad
   del tailnet, y si encuentra un `.env` ajeno sin esa variable se niega a seguir en lugar de
   respetarlo en silencio.
5. **Brave en Android trae «Use Google services for push messaging» desactivado** por
   defecto, y sin eso el web push no llega nunca aunque la suscripción parezca correcta.
   La prueba del 2026-08-28 se hizo en Chrome.

El emparejamiento vive en el almacenamiento del navegador, así que cada navegador necesita
su propio código de `collie pair` y la pantalla de bloqueo del móvil es la autenticación real.

## Comandos útiles

El binario está en `$(herdr plugin config-dir herdr.collie)/../../github/herdr.collie-*/bin/collie`;
`collie link` lo publica en `~/.local/bin`.

```bash
collie status          # sonda real contra el puerto, no solo "la unidad está activa"
collie doctor          # autodiagnosis: bind, puerta de entrada, socket de herdr
collie url             # la URL de MagicDNS a abrir en el móvil
collie logs            # journal del puente
collie devices list    # qué dispositivos tienen credencial de escritura
collie pair            # código nuevo, de un solo uso, caduca en 10 minutos
collie push-test       # dispara una notificación sin esperar a un agente
```

El registro de lo que se ha ejecutado desde el móvil está en
`~/.local/state/collie/audit.log`.

## Notificaciones

El push avisa de dos estados de agente: **bloqueado** (encendido de fábrica) y
**terminado** (`done`, apagado de fábrica; se enciende en los ajustes de la PWA).
La preferencia vive en `~/.local/state/collie/notify-prefs.json`, estado del
puente que no se versiona: en una máquina nueva hay que volver a encender `done`
si se quiere el aviso de agente terminado.

El aviso llega con un debounce de 30 segundos (variable `COLLIE_NOTIFY_DELAY_MS`,
no documentada en el `.env.example` de Collie): si el agente se desbloquea antes,
el push no sale. El cuerpo lleva el binario del agente (`claude`, `codex`), el
workspace y el cwd; no lleva la pregunta ni el nombre de sesión de `/rename`.
Un agente ya bloqueado cuando arranca el puente no notifica: la primera vista de
un pane nunca genera transición.

Estas notificaciones cubren también el reloj: Garmin replica las notificaciones
del móvil en la muñeca, así que el aviso de collie se lee en el Garmin sin código
de dispositivo. El puente ntfy de `dotmesh-watch`, que además aprobaba permisos
desde el reloj, se retiró en 2026-09 por falta de uso; de su parte de avisos se
encarga este push, y queda en el historial de aquel repo.

## Secretos

El `.env` vive junto a los presets y **nunca se versiona**: lleva las claves VAPID de push.
Ver [docs/SECRETS.md](../docs/SECRETS.md). El instalador lo crea a modo 600 y no lo
sobrescribe nunca.

Las claves no llevan `subject`. La RFC 8292 permite una dirección de contacto, pero se
incrusta en las peticiones que van a los servicios push de Google y Mozilla. Se añade con
`collie push-keys mailto:...`, que actualiza el contacto sin invalidar suscripciones.

## Deudas

- `make health` solo comprueba la unidad en Linux; en macOS el puente corre bajo launchd
  y esa fila no lo cubre.

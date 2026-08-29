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

El script es idempotente, no usa sudo y no arranca nada. Comprueba las precondiciones y
para con instrucciones si falta alguna. Al terminar imprime los tres pasos que quedan una
sola vez: generar las claves de push, publicar el puente en el tailnet y emparejar el móvil.

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
   del tailnet.
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

## Secretos

El `.env` vive junto a los presets y **nunca se versiona**: lleva las claves VAPID de push.
Ver [docs/SECRETS.md](../docs/SECRETS.md). El instalador lo crea a modo 600 y no lo
sobrescribe nunca.

Las claves no llevan `subject`. La RFC 8292 permite una dirección de contacto, pero se
incrusta en las peticiones que van a los servicios push de Google y Mozilla. Se añade con
`collie push-keys mailto:...`, que actualiza el contacto sin invalidar suscripciones.

## Deudas

- **herdr 0.7.1 es anterior a `session.snapshot`**, así que Collie cae al sondeo por
  llamadas de lista, el camino caro. Actualizar herdr es lo primero que mejoraría esto.
- `make health` solo comprueba la unidad en Linux; en macOS el puente corre bajo launchd
  y esa fila no lo cubre.
- El deep link desde el puente `dotmesh-watch` a `/pane/:id` sigue sin implementar.

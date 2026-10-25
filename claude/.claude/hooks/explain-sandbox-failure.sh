#!/bin/sh
# PostToolUseFailure hook (Bash): when a command fails with one of the sandbox
# signatures documented in AGENTS.md, hand the agent the cause and the right
# way out at the moment it happens. Each of these has cost half an hour because
# the explanation sits in AGENTS.md and the agent does not connect it to the
# error in front of it.
#
# It only annotates: it never rewrites, relaunches or blocks the command. The
# context it emits is fixed text; nothing from the command or its stderr is
# echoed back, so a failing command cannot inject instructions through it.
# Error text follows the locale, so the read-only signature matches English
# and Spanish. Without jq or on input it does not understand, it stays silent.
set -eu

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
fields=$(printf '%s' "$input" | jq -r '
  select(.tool_name == "Bash" and (.is_interrupt | not))
  | [(.tool_input.command // "" | @base64), (.error // "" | @base64)] | @tsv
' 2>/dev/null) || exit 0
[ -n "$fields" ] || exit 0

cmd=$(printf '%s' "$fields" | cut -f1 | base64 -d 2>/dev/null) || exit 0
err=$(printf '%s' "$fields" | cut -f2 | base64 -d 2>/dev/null) || exit 0

has_word() { printf '%s' "$cmd" | grep -Eq "(^|[^[:alnum:]_.-])$1([[:space:]]|\$)"; }
err_has() { printf '%s' "$err" | grep -Eiq "$1"; }

msg=""
if has_word gh && err_has 'x509|OSStatus|HTTP 401|Requires authentication'; then
  msg='Un `gh` que corre dentro de la caja pierde el token del llavero y vuelve anónimo (401) o falla con un error de certificado (x509). `gh` solo sale fuera cuando es el comando desnudo: sin tubería, redirección, bucle ni `$( )`. Lanza `gh` desnudo con `dangerouslyDisableSandbox` y procesa la salida en otra llamada.'
elif err_has 'authentication_failed' || { has_word claude && err_has 'Not logged in'; }; then
  msg='Un `claude -p` anidado dentro de la caja no ve la credencial (la regla de denegación de lectura la convierte en un fichero vacío) y concluye que no hay sesión. No es un problema de cuenta. Lanza el arnés por su target de make, desnudo, que corre fuera de la caja.'
elif err_has 'ssh: Could not resolve hostname'; then
  msg='La red por SSH no funciona dentro de la caja: la salida va por un proxy HTTP/HTTPS y el puerto 22 no tiene DNS ni ruta. No se arregla añadiendo un dominio a la lista. `git fetch`, `pull`, `push` y `clone` contra un remoto SSH salen con `dangerouslyDisableSandbox` a la primera.'
elif err_has 'Read-only file system|solo lectura'; then
  if has_word make && printf '%s' "$cmd" | grep -q '[>|]'; then
    msg='`make` solo corre fuera de la caja cuando se lanza desnudo; una redirección o una tubería lo vuelven a confinar y entonces no puede escribir fuera del directorio de trabajo. Lanza `make` desnudo (sin `>` ni `|`), y deja que el arnés capture la salida.'
  else
    msg='Dentro de la caja solo se escribe en el directorio de trabajo, en `$TMPDIR` (o el scratchpad de la sesión) y en `~/.npm`. Escribe los temporales ahí. Si de verdad hay que escribir en otra ruta (un segundo repositorio, la memoria), usa `dangerouslyDisableSandbox` para ese comando y, sin `TMPDIR`, rutas absolutas.'
  fi
fi

[ -n "$msg" ] || exit 0

jq -nc --arg m "$msg" '{hookSpecificOutput: {hookEventName: "PostToolUseFailure",
  additionalContext: ("Señal dotmesh (fallo con firma conocida del sandbox): " + $m)}}'
exit 0

#!/usr/bin/env python3
"""Lee y vuelca el bloque de estado de una página de flow-artifacts.

  leer-estado.py leer VIVO BASE      valida la versión viva contra BASE, la
                                     copia de la última publicación, e imprime
                                     su estado
  leer-estado.py volcar LOCAL NUEVO  sustituye el estado del fichero local por
                                     el JSON del fichero NUEVO
  leer-estado.py publicado LOCAL     copia el fichero local a
                                     <nombre>.publicado.html; se corre tras
                                     cada publicación que sale bien

Cualquier fallo sale como {"error": ...} con código 1: no se actúa sobre él.
"""
import json
import os
import re
import sys
from html import unescape
from html.parser import HTMLParser

LIMITE = 20000  # bytes de respuestas; una ronda normal ocupa unos cientos
PATRON_ESTADO = r'(<script\b[^>]*\bid="estado"[^>]*>)(.*?)(</script>)'
# Lo único que la página cambia al publicarse; el resto del estado es de Claude.
LIBRES = {"respuestas", "pendiente", "enviado"}
# Etiquetas que cargan o redirigen algo sin pasar por un <script>. Las de la
# segunda línea, porque el navegador lee su interior como texto y html.parser,
# según la versión de Python, como marcado: lo que esconden no se vería aquí.
# svg y math, por lo contrario: dentro de ellos title, textarea o style son
# marcado para el navegador y texto para html.parser, que no vería un <script>.
PELIGROSAS = {"iframe", "frame", "frameset", "object", "embed", "base",
              "noscript", "xmp", "noembed", "noframes", "plaintext",
              "svg", "math"}


class Piezas(HTMLParser):
    """Recoge los bloques con id, los data-id y lo que no debería estar."""

    def __init__(self, html):
        super().__init__()
        self.bloques = {}
        self.ids = set()
        self.scripts = 0
        self.sospechas = []
        self._abierto = None
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        if tag in PELIGROSAS or (tag == "meta" and "http-equiv" in dict(attrs)):
            self.sospechas.append(f"<{tag}>")
        for nombre, valor in attrs:
            # El navegador ignora blancos y controles dentro del esquema
            # (java&#9;script:), y un esquema puede ir a media lista de valores
            # (<animate values="0;javascript:...">): se busca en todo el valor.
            # El nombre se decodifica por prudencia; rechaza de más, no de menos.
            nombre = unescape(nombre).lower()
            valor_limpio = re.sub(r"[\x00-\x20]", "", valor or "").lower()
            # Un cierre dentro de un valor (title="</textarea><img …>") es cómo se
            # esconde marcado a un parser que no trata ese elemento como texto.
            if (nombre.startswith("on") or nombre == "srcdoc" or "</" in (valor or "")
                    or re.search(r"(?:java|vb)script:", valor_limpio)):
                self.sospechas.append(f"<{tag} {nombre}>")
            if nombre == "data-id" and valor:
                self.ids.add(valor)
        if tag == "script":
            self.scripts += 1
        ident = dict(attrs).get("id")
        if tag in ("script", "style") and ident:
            self.bloques.setdefault(ident, []).append("")
            self._abierto = ident

    def handle_data(self, data):
        if self._abierto:
            self.bloques[self._abierto][-1] += data

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self._abierto = None

    # Comentarios y secciones que el navegador cierra antes que html.parser: lo
    # que quede entre los dos cierres se ejecuta sin haberse visto aquí. <!-->
    # y <!---> son comentarios vacíos para el navegador; <![CDATA[ fuera de SVG
    # acaba en el primer «>»; --!> y un cierre dentro, según la versión.
    def handle_comment(self, data):
        if data.startswith((">", "->")) or "--!>" in data or "</" in data:
            self.sospechas.append("<!-- -->")

    def unknown_decl(self, data):
        self.sospechas.append("<![")

    def unico(self, ident, donde):
        encontrados = self.bloques.get(ident, [])
        if len(encontrados) != 1:
            fallo(f"{donde}: {len(encontrados)} bloques «{ident}», se esperaba uno")
        return encontrados[0]

    def estado(self, donde):
        try:
            estado = cargar(self.unico("estado", donde))
        except ValueError as e:
            fallo(f"{donde}: estado ilegible ({e})")
        if not isinstance(estado, dict):
            fallo(f"{donde}: el estado no es un objeto")
        return estado


def fallo(msg):
    print(json.dumps({"error": msg}, ensure_ascii=False))
    sys.exit(1)


def cargar(texto):
    # NaN e Infinity no son JSON: JSON.parse los rechaza y la página no arrancaría.
    # Un número que desborda (1e309) llega aquí como inf sin pasar por este
    # gancho; lo para el allow_nan=False de cada json.dumps.
    def constante(c):
        raise ValueError(f"{c} no es JSON")
    return json.loads(texto, parse_constant=constante)


def contenido(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            return f.read()
    except OSError as e:
        fallo(f"no se puede leer {ruta}: {e.strerror}")


def escribir(ruta, texto):
    # A un temporal y luego rename: un fallo a medias no deja el fichero cortado.
    temporal = ruta + ".tmp"
    with open(temporal, "w", encoding="utf-8") as f:
        f.write(texto)
    os.replace(temporal, ruta)


def copia_publicada(ruta_local):
    raiz, extension = os.path.splitext(ruta_local)
    return raiz + ".publicado" + extension


def respuestas_de(estado, ids, donde):
    respuestas = estado.get("respuestas")
    if not isinstance(respuestas, dict):
        fallo(f"{donde}: respuestas no es un objeto")
    ajenas = set(respuestas) - ids
    if ajenas:
        fallo(f"{donde}: respuestas a data-id que no están en el contenido: {sorted(ajenas)[:5]}")
    return respuestas


def leer(ruta_viva, ruta_base):
    vivo, publicada = Piezas(contenido(ruta_viva)), Piezas(contenido(ruta_base))
    for ident in ("app", "estilo"):
        if vivo.unico(ident, "vivo") != publicada.unico(ident, "base"):
            fallo(f"el bloque «{ident}» vivo no coincide con el de la última publicación")
    if vivo.scripts != 2:
        fallo(f"la versión viva tiene {vivo.scripts} scripts; solo caben estado y app")
    if vivo.sospechas:
        fallo(f"la versión viva trae marcado que ejecuta o carga código: {vivo.sospechas[:5]}")
    if vivo.ids != publicada.ids:
        fallo(f"los data-id vivos no son los publicados: {sorted(vivo.ids ^ publicada.ids)[:5]}")
    estado, base = vivo.estado("vivo"), publicada.estado("base")
    if estado.get("ronda") != base.get("ronda"):
        fallo(f"ronda {estado.get('ronda')!r} en la versión viva, {base.get('ronda')!r} publicada")
    tocadas = sorted(k for k in (set(estado) | set(base)) - LIBRES if estado.get(k) != base.get(k))
    if tocadas:
        fallo(f"la versión viva cambia claves que solo escribe Claude: {tocadas[:5]}")
    respuestas = respuestas_de(estado, publicada.ids, "vivo")
    if len(json.dumps(respuestas, ensure_ascii=False, allow_nan=False).encode()) > LIMITE:
        fallo(f"respuestas por encima de {LIMITE} bytes")
    print(json.dumps(estado, ensure_ascii=False, allow_nan=False, indent=2))


def volcar(ruta_local, ruta_nueva):
    local = contenido(ruta_local)
    antes = Piezas(local)
    antes.estado("local")
    try:
        nuevo = cargar(contenido(ruta_nueva))
    except ValueError as e:
        fallo(f"el estado nuevo no es JSON ({e})")
    if not isinstance(nuevo, dict):
        fallo("el estado nuevo no es un objeto")
    # Una clave cuyo data-id ya no está haría fallar el siguiente envío.
    respuestas_de(nuevo, antes.ids, "estado nuevo (edita el template antes de volcar)")
    # Ningún «<» dentro del script: una respuesta con </script> cerraría el bloque.
    seguro = json.dumps(nuevo, ensure_ascii=False, allow_nan=False).replace("<", "\\u003c")
    salida = re.sub(PATRON_ESTADO, lambda m: m.group(1) + seguro + m.group(3),
                    local, count=1, flags=re.S)
    despues = Piezas(salida)
    if despues.estado("resultado") != nuevo:
        fallo("el estado volcado no coincide con el nuevo; el fichero no se ha tocado")
    for ident in ("app", "estilo"):
        if despues.unico(ident, "resultado") != antes.unico(ident, "local"):
            fallo(f"el volcado habría tocado «{ident}»; el fichero no se ha tocado")
    escribir(ruta_local, salida)
    print(json.dumps({"ok": ruta_local}, ensure_ascii=False))


def publicado(ruta_local):
    # La base de toda lectura: lo que la persona tiene delante es esta versión,
    # tenga o no el fichero local cambios posteriores sin publicar.
    local = contenido(ruta_local)
    piezas = Piezas(local)
    piezas.estado("local")
    for ident in ("app", "estilo"):
        piezas.unico(ident, "local")
    copia = copia_publicada(ruta_local)
    escribir(copia, local)
    print(json.dumps({"ok": copia}, ensure_ascii=False))


if __name__ == "__main__":
    ordenes = {"leer": (leer, 2), "volcar": (volcar, 2), "publicado": (publicado, 1)}
    orden, aridad = ordenes.get(sys.argv[1] if len(sys.argv) > 1 else "", (None, -1))
    if orden is None or len(sys.argv) != 2 + aridad:
        fallo("uso: leer-estado.py leer VIVO BASE | volcar LOCAL NUEVO | publicado LOCAL")
    try:
        orden(*sys.argv[2:])
    except (OSError, ValueError, RecursionError, AssertionError) as e:
        # AssertionError: _markupbase la lanza con marcado roto en algunas versiones.
        fallo(f"{type(e).__name__}: {e}")

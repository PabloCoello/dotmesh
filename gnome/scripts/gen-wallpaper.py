#!/usr/bin/env python3
"""Genera el fondo dotmesh: lienzo Ink con una malla de grafito muy sutil.

Determinista (semilla fija) y reproducible. La paleta sale de docs/DESIGN.md:
cromo monocromo, el color solo como señal (un único nodo teal). Por defecto
escribe el asset versionado del paquete gnome/.

Uso:
  gen-wallpaper.py [salida.png] [spacing] [jitter] [line_alpha] [dot_alpha] [teal0|1]
"""
import os
import sys
import random
from PIL import Image, ImageDraw

W, H = 3840, 2160
INK_TOP = (0x16, 0x17, 0x1B)   # ink-0
INK_BOT = (0x13, 0x14, 0x19)   # un pelín más oscuro abajo
MESH = (0x9A, 0x9E, 0xA6)      # grafito claro, se usa con alpha bajo
TEAL = (0x6C, 0xB6, 0xB0)      # señal
SAGE = (0xA8, 0xCB, 0xA0)      # señal
ROSE = (0xE5, 0x9A, 0x9A)      # señal


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    default_out = os.path.join(
        here, "..", ".local", "share", "backgrounds", "dotmesh-mesh-ink.png"
    )
    out = sys.argv[1] if len(sys.argv) > 1 else default_out
    spacing = int(sys.argv[2]) if len(sys.argv) > 2 else 88
    jitter = int(sys.argv[3]) if len(sys.argv) > 3 else 24
    line_a = int(sys.argv[4]) if len(sys.argv) > 4 else 24
    dot_a = int(sys.argv[5]) if len(sys.argv) > 5 else 52
    teal_on = int(sys.argv[6]) if len(sys.argv) > 6 else 1
    random.seed(1717)

    # Fondo Ink con degradado vertical muy suave.
    base = Image.new("RGB", (W, H))
    bd = ImageDraw.Draw(base)
    for y in range(H):
        bd.line([(0, y), (W, y)], fill=lerp(INK_TOP, INK_BOT, y / H))

    # Rejilla jittered de puntos, con margen para cubrir bordes al hacer zoom.
    cols = W // spacing + 3
    rows = H // spacing + 3
    pts = {}
    for r in range(rows):
        for c in range(cols):
            x = (c - 1) * spacing + random.randint(-jitter, jitter)
            y = (r - 1) * spacing + random.randint(-jitter, jitter)
            pts[(c, r)] = (x, y)

    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    # Malla: une cada punto con su vecino derecho, inferior y diagonal.
    for (c, r), p in pts.items():
        for dc, dr in ((1, 0), (0, 1), (1, 1)):
            n = pts.get((c + dc, r + dr))
            if n:
                od.line([p, n], fill=MESH + (line_a,), width=1)
    # Nodos.
    for (x, y) in pts.values():
        od.ellipse([x - 2, y - 2, x + 2, y + 2], fill=MESH + (dot_a,))

    # Nodos-señal: teal fijo (tercio inferior-izq) más dos compañeros (sage y
    # rose) en posiciones pseudoaleatorias pero estables (semilla propia),
    # dentro de la banda central segura para ambos monitores. Color = señal.
    if teal_on:
        def draw_node(cx, cy, color):
            for rad, a in ((22, 18), (12, 40), (5, 95)):
                od.ellipse([cx - rad, cy - rad, cx + rad, cy + rad],
                           fill=color + (a,))

        random.seed(4242)
        signals = [(int(W * 0.30), int(H * 0.66), TEAL)]
        for color in (SAGE, ROSE):
            for _ in range(300):
                x = int(W * random.uniform(0.34, 0.66))
                y = int(H * random.uniform(0.22, 0.78))
                if all((x - sx) ** 2 + (y - sy) ** 2 > (0.16 * W) ** 2
                       for sx, sy, _ in signals):
                    signals.append((x, y, color))
                    break
        for x, y, color in signals:
            draw_node(x, y, color)

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    Image.alpha_composite(base.convert("RGBA"), overlay).convert("RGB").save(out)
    print("escrito", out)


if __name__ == "__main__":
    main()

"""Prueba rápida para ejecutar en Neovim (REPL o :w !python3)."""

def greet(name: str) -> str:
    return f"Hola, {name}!"


def farewell(name: str) -> str:
    return f"Adiós, {name}!"


if __name__ == "__main__":
    msg = greet("Neovim + Python")
    print(msg)
    # Pequeña lista de ejemplo
    data = [1, 2, 3, 4]
    squares = [n * n for n in data]
    print("Cuadrados:", squares)

# Prueba rápida para ejecutar en Neovim con :w !Rscript o IronRepl
greet <- function(name) {
  paste0("Hola, ", name, "!")
}

mensaje <- greet("Neovim + R")
print(mensaje)

datos <- c(1, 2, 3, 4)
cuadrados <- datos^2
print(cuadrados)

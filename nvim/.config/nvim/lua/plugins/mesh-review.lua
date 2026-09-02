--- Entrada de lazy.nvim para el plugin local mesh-review.
---
--- No instala ningún plugin externo. Añade el directorio de configuración de
--- Neovim al runtimepath (ya está allí por defecto, pero el bloque permite que
--- lazy gestione el ciclo de vida del módulo) y llama a setup() tras la
--- inicialización de lazy.

return {
  {
    "mesh-review-local",
    dir     = vim.fn.stdpath("config"),
    lazy    = false,
    priority = 50,
    config  = function()
      require("mesh_review").setup()
    end,
  },
}

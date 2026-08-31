; Reemplaza la query de nvim-treesitter (rama master), cuya primera regla usa la
; directiva propia (#set-lang-from-info-string!). Esa directiva lee match[id] como
; un nodo suelto, pero desde Neovim 0.11 el match entrega una LISTA de nodos: el
; handler llama a :range() sobre una tabla y revienta el resaltado de todo el
; buffer. El resto de reglas es la versión de Neovim 0.12, íntegra.
(fenced_code_block
  (info_string
    (language) @injection.language)
  (code_fence_content) @injection.content)

((html_block) @injection.content
  (#set! injection.language "html")
  (#set! injection.combined)
  (#set! injection.include-children))

((minus_metadata) @injection.content
  (#set! injection.language "yaml")
  (#offset! @injection.content 1 0 -1 0)
  (#set! injection.include-children))

((plus_metadata) @injection.content
  (#set! injection.language "toml")
  (#offset! @injection.content 1 0 -1 0)
  (#set! injection.include-children))

([
  (inline)
  (pipe_table_cell)
] @injection.content
  (#set! injection.language "markdown_inline"))

// companion.ts — nombre del notebook acompañante derivado del documento .md.
// Función pura. Sin importaciones de VS Code ni de Node.

/**
 * Deriva el nombre de fichero del notebook acompañante a partir del basename
 * del documento: "analisis.md" → "analisis.ipynb". Si el nombre ya está en
 * uso (`taken`), añade un sufijo numérico: "analisis-2.ipynb", "analisis-3.ipynb"...
 *
 * La desambiguación es obligatoria, no cosmética: openNotebookDocument(uri)
 * devuelve el documento YA ABIERTO si la URI coincide, lo que reutilizaría el
 * kernel viejo tras un restart o mezclaría dos .md homónimos de carpetas
 * distintas en un mismo acompañante.
 */
export function companionFileName(
  docBasename: string,
  taken: ReadonlySet<string>,
): string {
  const stem = docBasename.replace(/\.[^.]+$/, '') || docBasename;

  let candidate = `${stem}.ipynb`;
  for (let n = 2; taken.has(candidate); n++) {
    candidate = `${stem}-${n}.ipynb`;
  }
  return candidate;
}

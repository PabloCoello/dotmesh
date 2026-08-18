#!/usr/bin/env node
/**
 * smoke.js — verifica que renderLatex funciona desde el bundle de esbuild.
 *
 * Bundlea src/formula.ts con la misma configuración que build.js (incluyendo
 * el define de PACKAGE_VERSION), ejecuta una llamada de render en node y
 * comprueba que no lanza. Detecta la clase de fallo que no aparece en los
 * tests unitarios porque éstos corren contra node_modules directamente, no
 * contra el bundle.
 *
 * Uso:
 *   npm run smoke
 *
 * Se ejecuta también como pretest (antes de npm test) para que cualquier
 * rotura de bundle se detecte en CI junto con la suite unitaria.
 */
'use strict';
const esbuild = require('esbuild');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function main() {
  const root = path.resolve(__dirname, '..');

  const mjxVersion = require(
    path.join(root, 'node_modules/mathjax-full/package.json'),
  ).version;

  const tmpDir = os.tmpdir();
  const probeEntry = path.join(tmpDir, 'mesh-render-smoke-probe.ts');
  const probeBundle = path.join(tmpDir, 'mesh-render-smoke-probe.cjs');

  // Ruta absoluta POSIX al módulo formula (esbuild acepta rutas POSIX)
  const formulaPath = path
    .join(root, 'src', 'formula')
    .replace(/\\/g, '/');

  fs.writeFileSync(
    probeEntry,
    `import { renderLatex } from '${formulaPath}';\n` +
    `(async () => {\n` +
    `  const r = await renderLatex('E = mc^2', false);\n` +
    `  if (r.startsWith('LaTeX error:')) {\n` +
    `    process.stdout.write('THREW: ' + r + '\\n');\n` +
    `    process.exit(1);\n` +
    `  }\n` +
    `  process.stdout.write('OK len=' + r.length + ' currentColor=' + r.includes('currentColor') + '\\n');\n` +
    `  process.exit(0);\n` +
    `})();\n`,
  );

  try {
    await esbuild.build({
      entryPoints: [probeEntry],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: probeBundle,
      logLevel: 'warning',
      define: {
        PACKAGE_VERSION: JSON.stringify(mjxVersion),
      },
    });

    const output = execSync(`node "${probeBundle}"`, { encoding: 'utf8' }).trim();
    process.stdout.write('[smoke] ' + output + '\n');

    if (!output.startsWith('OK')) {
      process.stderr.write('[smoke] FAIL: el bundle no renderiza sin lanzar\n');
      process.exit(1);
    }

    process.stdout.write('[smoke] OK — el bundle de MathJax renderiza correctamente\n');
  } finally {
    for (const f of [probeEntry, probeBundle]) {
      try { fs.unlinkSync(f); } catch { /* ignorar si no existe */ }
    }
  }
}

main().catch(e => {
  process.stderr.write('[smoke] ERROR: ' + e.message + '\n');
  process.exit(1);
});

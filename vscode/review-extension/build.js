const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const common = {
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  logLevel: 'info',
};

// Ruta del artefacto CLI (relativa a este fichero, que vive en vscode/review-extension/)
const cliOutfile = path.resolve(__dirname, '../../agents/.agents/skills/doc-review/bin/mesh-review.mjs');

Promise.all([
  // Extensión VS Code (CJS, con external: ['vscode'])
  esbuild.build({
    ...common,
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'out/extension.js',
  }),

  // CLI mesh-review (ESM, sin external: ['vscode'], shebang, chmod 755)
  esbuild.build({
    entryPoints: ['src/cli/main.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    logLevel: 'info',
    banner: { js: '#!/usr/bin/env node' },
    outfile: cliOutfile,
  }),
]).then(() => {
  // chmod 755 para que el artefacto sea ejecutable directamente
  fs.chmodSync(cliOutfile, 0o755);
  console.log('→ mesh-review CLI →', cliOutfile);
}).catch(() => process.exit(1));

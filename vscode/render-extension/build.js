const esbuild = require('esbuild');
const path = require('path');

// mathjax-full/js/components/version.js resuelve la versión con un require()
// dinámico (eval('require')(package.json)) que falla cuando el módulo está
// bundleado: __dirname apunta al bundle, no a node_modules. Definir
// PACKAGE_VERSION hace que la rama de eval nunca se ejecute.
const mjxVersion = require(
  path.resolve(__dirname, 'node_modules/mathjax-full/package.json'),
).version;

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  outfile: 'out/extension.js',
  logLevel: 'info',
  define: {
    // Inyectar la versión de mathjax-full en tiempo de build para que
    // components/version.js no necesite el require() dinámico en runtime.
    PACKAGE_VERSION: JSON.stringify(mjxVersion),
  },
}).catch(() => process.exit(1));

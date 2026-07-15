const esbuild = require('esbuild');

const common = {
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  logLevel: 'info',
};

esbuild.build({
  ...common,
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
}).catch(() => process.exit(1));

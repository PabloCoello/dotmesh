import esbuild from 'esbuild';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
const moduleId = pkg.name;

// Ensure dist/ exists.
mkdirSync(join(__dirname, 'dist'), { recursive: true });

await Promise.all([
  // Host side: plain ESM loaded by Node inside dsh's Cordis runtime.
  esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    logLevel: 'info',
    outfile: 'dist/index.js',
  }),

  // Client side: wrapped in window.__ModuleLoader__.load({id, factory}).
  // esbuild CJS output uses ambient exports/require; the banner/footer wrap
  // it in the factory so external require() calls go through the module loader.
  esbuild.build({
    entryPoints: ['src/client.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    // React and all dsh packages are provided by the runtime module loader.
    external: ['react', 'react/jsx-runtime', '@deepseek-ai/*'],
    banner: {
      js: [
        `window.__ModuleLoader__.load({`,
        `\tid: ${JSON.stringify(moduleId)},`,
        `\tfactory: (require) => {`,
        `\t\tvar module = { exports: {} };`,
        `\t\tvar exports = module.exports;`,
      ].join('\n'),
    },
    footer: {
      js: [
        `\t\treturn module.exports;`,
        `\t}`,
        `});`,
      ].join('\n'),
    },
    logLevel: 'info',
    outfile: 'dist/client.js',
  }),
]).catch(() => process.exit(1));

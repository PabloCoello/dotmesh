import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// The webServer service provides ctx.webServer.register(route).
// Declaring inject here makes Cordis wait for the service before calling apply().
// Pattern verified in dsh-client-modules/lib/index.js (static inject = ["webServer",...]).
export const inject: string[] = ['webServer'];

// Exact URL path for the workbench state endpoint. Lives under /plugins/dotmesh-ui/
// so it is grouped with the client bundle (/plugins/dotmesh-ui/client.js) but does
// NOT conflict with it: the client-modules prefix handler owns /plugins/* as a
// prefix, but an exact match takes priority over prefix matches in dsh-host-webserver.
const WORKBENCH_ROUTE = '/plugins/dotmesh-ui/workbench';

export function apply(ctx: any): void {
  // Resolve state file path once at startup.
  // DSH_HOME is set by dsh when it launches; fall back to ~/.dsh for direct testing.
  const dshHome = process.env['DSH_HOME'] ?? resolve(process.env['HOME'] ?? '', '.dsh');
  const statePath = resolve(dshHome, 'state', 'workbench.json');

  // Register the workbench state route. ctx.effect wraps the call so Cordis
  // disposes the route (removes it from the exact-match table) if this plugin
  // is torn down. Only reads from a fixed path; no user-supplied path parameters.
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: WORKBENCH_ROUTE,
        handler: async (_req: any, res: any) => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          try {
            const raw = await readFile(statePath, 'utf8');
            JSON.parse(raw); // throws on malformed JSON → fallback path below
            res.writeHead(200);
            res.end(raw);
          } catch {
            // File absent, permission error, or invalid JSON: return empty object.
            // The browser panel treats {} as "no active requirement" and never breaks.
            res.writeHead(200);
            res.end('{}');
          }
        },
      }),
    'dotmesh-ui: workbench state route',
  );
}

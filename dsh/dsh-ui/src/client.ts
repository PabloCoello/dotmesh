// Client bundle entry point for the dotmesh-ui plugin.
// This module runs inside the browser via window.__ModuleLoader__.load.
// Services required from the client Cordis context.
export const inject: string[] = [];

// Client apply — called by the browser Cordis when the plugin mounts.
// Phase 7: empty skeleton; Phase 8 will add theme tokens and brand marks.
export function apply(_ctx: unknown): void {}

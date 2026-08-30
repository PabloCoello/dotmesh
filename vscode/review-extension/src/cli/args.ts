/**
 * args.ts — shared argument parser for mesh-review subcommands.
 *
 * A thin wrapper over raw argv that enforces the known-flag contract per
 * subcommand. Rejects unknown '--xxx' flags with stderr + exit 1 so that
 * typos surface immediately instead of being silently ignored.
 *
 * Design notes:
 *   - A repeated flag uses the last value (last-wins), matching standard CLI
 *     conventions.
 *   - A flag value that begins with '-' is accepted: the parser always consumes
 *     the next token as the value, never re-interprets it as a new flag.
 *   - '--help' is intentionally NOT in any subcommand's knownFlags. Callers
 *     check argv.includes('--help') before calling parseCliArgs, so '--help'
 *     never reaches this parser.
 *   - '--' end-of-flags marker is not supported (YAGNI: no current subcommand
 *     needs it).
 *   - Single-dash flags (e.g. '-m' used by fix) are not recognised; they are
 *     collected as positionals. fix.ts is intentionally left to its own parser.
 */

export interface ParsedArgs {
  /** Flag values keyed by flag name (without leading '--'). */
  flags: Map<string, string>;
  /** Non-flag arguments in order of appearance. */
  positionals: string[];
}

/**
 * Parses argv into flags and positionals.
 *
 * @param argv        Argument vector (everything after the subcommand token).
 * @param knownFlags  Set of flag names the subcommand accepts (without leading
 *                    '--'). An unknown '--xxx' flag writes to stderr and exits
 *                    with code 1.
 * @param subcommand  Subcommand name used in error messages (e.g. 'open').
 */
export function parseCliArgs(
  argv: string[],
  knownFlags: ReadonlySet<string>,
  subcommand: string
): ParsedArgs {
  const flags = new Map<string, string>();
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--')) {
      const name = arg.slice(2);
      if (!knownFlags.has(name)) {
        process.stderr.write(`mesh-review ${subcommand}: flag desconocida: ${arg}\n`);
        process.exit(1);
      }
      const value = argv[i + 1];
      if (value === undefined) {
        process.stderr.write(`mesh-review ${subcommand}: la flag ${arg} requiere un valor\n`);
        process.exit(1);
      }
      // A value beginning with '-' (e.g. --body "-1 punto") is accepted as-is.
      // Repeated flags: last value wins.
      flags.set(name, value);
      i++; // consume value token
    } else {
      positionals.push(arg);
    }
  }

  return { flags, positionals };
}

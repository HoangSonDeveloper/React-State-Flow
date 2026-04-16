export interface CliArgs {
  /** Source directory to scan (positional, default '.'). */
  targetPath: string
  /** Editor key for click-to-open URL scheme (default 'vscode'). */
  editor: string
  /** TCP port for the CLI server (default 7272). Out-of-range values fall back to default. */
  port: number
  /** Whether to auto-open the browser at startup (default true; set false with --no-open). */
  open: boolean
  /** Extra directory names to skip during scanning + watching (comma-separated). */
  ignore: string[]
}

const DEFAULT_PORT = 7272
const DEFAULT_EDITOR = 'vscode'

/**
 * Parses CLI argv (process.argv.slice(2)).
 *   react-state-flow [directory] [--editor=<name>] [--port=<n>] [--no-open] [--ignore=<a,b,...>]
 *
 * Unknown flags are silently ignored. Invalid --port falls back to default.
 */
export function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = []
  let editor = DEFAULT_EDITOR
  let port = DEFAULT_PORT
  let open = true
  let ignore: string[] = []

  for (const arg of argv) {
    if (arg.startsWith('--editor=')) {
      editor = arg.slice('--editor='.length)
    } else if (arg.startsWith('--port=')) {
      const n = parseInt(arg.slice('--port='.length), 10)
      if (Number.isFinite(n) && n > 0 && n < 65536) port = n
    } else if (arg === '--no-open') {
      open = false
    } else if (arg.startsWith('--ignore=')) {
      ignore = arg
        .slice('--ignore='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (!arg.startsWith('--')) {
      positional.push(arg)
    }
  }

  return { targetPath: positional[0] ?? '.', editor, port, open, ignore }
}

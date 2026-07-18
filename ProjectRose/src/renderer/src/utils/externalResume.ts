import type { ExternalSource } from '@shared/externalSession'

// Builders for the terminal command that resumes an external session with its
// own CLI (`claude --resume` / `codex resume`). The command is typed into the
// integrated terminal's pty as raw keystrokes, so the message must be a
// single line and quoted for the shell the terminal runs: PowerShell on
// Windows, the user's $SHELL (POSIX) elsewhere.

/**
 * Collapse a chat message to a single line the pty can accept: any newline
 * would submit the command early. Tabs become spaces; other C0 control
 * characters are stripped.
 */
export function flattenPromptText(s: string): string {
  return s
    .replace(/\r\n|\r|\n|\t/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
}

/**
 * Quote a literal argument for the integrated terminal's shell. Single quotes
 * are the no-expansion literal form in both PowerShell (`''` escapes a quote)
 * and POSIX shells (`'\''` closes/escapes/reopens).
 */
export function quoteForShell(s: string, platform: string): string {
  if (platform === 'win32') {
    return `'${s.replace(/'/g, "''")}'`
  }
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export function buildResumeCommand(args: {
  source: ExternalSource
  sessionId: string
  modelFlag: string | null
  message: string
  platform: string
}): string {
  // The resume runs unattended in a background pty, so Claude gets
  // --dangerously-skip-permissions — nobody is watching to approve prompts.
  const parts =
    args.source === 'claude-code'
      ? ['claude', '--resume', args.sessionId, '--dangerously-skip-permissions']
      : ['codex', 'resume', args.sessionId]
  if (args.modelFlag) parts.push('--model', args.modelFlag)
  const flattened = flattenPromptText(args.message)
  if (flattened) parts.push(quoteForShell(flattened, args.platform))
  return parts.join(' ')
}

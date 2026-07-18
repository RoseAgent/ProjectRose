import { describe, it, expect } from 'vitest'
import { flattenPromptText, quoteForShell, buildResumeCommand } from '../externalResume'

describe('flattenPromptText', () => {
  it('collapses newlines and tabs to spaces', () => {
    expect(flattenPromptText('line one\r\nline two\nline three\tend')).toBe(
      'line one line two line three end'
    )
  })

  it('strips other control characters', () => {
    expect(flattenPromptText('a\u0000b\u0007c\u007fd')).toBe('abcd')
  })

  it('trims surrounding whitespace', () => {
    expect(flattenPromptText('  hi  \n')).toBe('hi')
  })
})

describe('quoteForShell', () => {
  it('single-quotes for PowerShell, doubling embedded quotes', () => {
    expect(quoteForShell("it's here", 'win32')).toBe("'it''s here'")
  })

  it("single-quotes for POSIX with the '\\'' escape", () => {
    expect(quoteForShell("it's here", 'darwin')).toBe("'it'\\''s here'")
  })

  it('leaves $ and backticks literal inside the quotes', () => {
    expect(quoteForShell('echo $HOME `id`', 'win32')).toBe("'echo $HOME `id`'")
    expect(quoteForShell('echo $HOME `id`', 'linux')).toBe("'echo $HOME `id`'")
  })
})

describe('buildResumeCommand', () => {
  it('builds a bare claude resume with no model and no message', () => {
    expect(
      buildResumeCommand({
        source: 'claude-code',
        sessionId: 'abc-123',
        modelFlag: null,
        message: '',
        platform: 'win32'
      })
    ).toBe('claude --resume abc-123')
  })

  it('adds --model when a flag is chosen', () => {
    expect(
      buildResumeCommand({
        source: 'claude-code',
        sessionId: 'abc-123',
        modelFlag: 'opus',
        message: '',
        platform: 'win32'
      })
    ).toBe('claude --resume abc-123 --model opus')
  })

  it('appends the quoted flattened message last', () => {
    expect(
      buildResumeCommand({
        source: 'claude-code',
        sessionId: 'abc-123',
        modelFlag: 'sonnet',
        message: "fix the\nbug in foo's parser",
        platform: 'win32'
      })
    ).toBe("claude --resume abc-123 --model sonnet 'fix the bug in foo''s parser'")
  })

  it('uses the codex resume form for codex sessions', () => {
    expect(
      buildResumeCommand({
        source: 'codex',
        sessionId: 'xyz',
        modelFlag: null,
        message: 'continue',
        platform: 'linux'
      })
    ).toBe("codex resume xyz 'continue'")
  })

  it('a whitespace-only message resumes without a prompt argument', () => {
    expect(
      buildResumeCommand({
        source: 'claude-code',
        sessionId: 'abc',
        modelFlag: null,
        message: '   \n ',
        platform: 'win32'
      })
    ).toBe('claude --resume abc')
  })
})

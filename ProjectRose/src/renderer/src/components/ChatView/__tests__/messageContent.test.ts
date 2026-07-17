import { describe, it, expect } from 'vitest'
import { parseMessageSegments } from '../messageContent'

describe('parseMessageSegments', () => {
  it('returns a single text segment for ordinary messages (fast path)', () => {
    expect(parseMessageSegments('just a normal message')).toEqual([
      { kind: 'text', text: 'just a normal message' }
    ])
  })

  it('highlights command-name, keeps args as text, hides command-message', () => {
    const input =
      '<command-name>/plan</command-name>\n' +
      '            <command-message>plan</command-message>\n' +
      '            <command-args>build the thing</command-args>'
    expect(parseMessageSegments(input)).toEqual([
      { kind: 'command', text: '/plan' },
      { kind: 'text', text: ' build the thing' }
    ])
  })

  it('emits a bare command chip when there are no args', () => {
    const input =
      '<command-name>/clear</command-name>\n' +
      '            <command-message>clear</command-message>\n' +
      '            <command-args></command-args>'
    expect(parseMessageSegments(input)).toEqual([{ kind: 'command', text: '/clear' }])
  })

  it('hides the caveat and keeps stdout as plain text', () => {
    const input =
      '<local-command-caveat>Caveat: do not respond to this.</local-command-caveat>\n' +
      '<command-name>/plan</command-name>\n' +
      '<command-message>plan</command-message>\n' +
      '<command-args></command-args>\n' +
      '<local-command-stdout>Enabled plan mode</local-command-stdout>'
    expect(parseMessageSegments(input)).toEqual([
      { kind: 'command', text: '/plan' },
      { kind: 'text', text: '\nEnabled plan mode' }
    ])
  })

  it('handles multiple command blocks in one message', () => {
    const input =
      '<command-name>/clear</command-name>\n' +
      '<command-message>clear</command-message>\n' +
      '<command-args></command-args>\n' +
      '<command-name>/plan</command-name>\n' +
      '<command-message>plan</command-message>\n' +
      '<command-args>do it</command-args>'
    expect(parseMessageSegments(input)).toEqual([
      { kind: 'command', text: '/clear' },
      { kind: 'command', text: '/plan' },
      { kind: 'text', text: ' do it' }
    ])
  })

  it('preserves surrounding free text', () => {
    const input = 'before <command-name>/plan</command-name><command-args>x</command-args> after'
    expect(parseMessageSegments(input)).toEqual([
      { kind: 'text', text: 'before ' },
      { kind: 'command', text: '/plan' },
      { kind: 'text', text: ' x after' }
    ])
  })
})

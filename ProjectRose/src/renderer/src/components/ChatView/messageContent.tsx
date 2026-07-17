import type { ReactNode } from 'react'
import styles from './messageContent.module.css'

// Claude Code wraps slash-command invocations in a set of XML-ish tags inside
// the user message text, e.g.:
//   <command-name>/plan</command-name>
//   <command-message>plan</command-message>
//   <command-args>build the thing</command-args>
//   <local-command-stdout>Enabled plan mode</local-command-stdout>
// Rendered verbatim these are noise. We turn them into readable content: the
// command name is highlighted as a chip, its args follow as normal text,
// captured stdout is shown as plain text, and the redundant command-message
// plus the system caveat are hidden.

export type MessageSegment =
  | { kind: 'text'; text: string }
  | { kind: 'command'; text: string }

const TAG_RE =
  /<(command-name|command-message|command-args|local-command-stdout|local-command-caveat)>([\s\S]*?)<\/\1>/g

// Pure parser (no React) so it can be unit-tested directly. Returns a single
// text segment for ordinary messages.
export function parseMessageSegments(text: string): MessageSegment[] {
  if (!text.includes('<command-') && !text.includes('<local-command-')) {
    return [{ kind: 'text', text }]
  }

  const segments: MessageSegment[] = []
  const pushText = (t: string): void => {
    if (!t) return
    const prev = segments[segments.length - 1]
    if (prev && prev.kind === 'text') prev.text += t
    else segments.push({ kind: 'text', text: t })
  }

  let last = 0
  let match: RegExpExecArray | null
  TAG_RE.lastIndex = 0

  while ((match = TAG_RE.exec(text)) !== null) {
    const [full, tag, innerRaw] = match
    const inner = innerRaw.trim()

    // Text between the previous tag and this one. Pure-whitespace glue (the
    // newlines/indentation Claude puts between tags) is dropped; real text is
    // kept verbatim.
    const between = text.slice(last, match.index)
    if (between.trim().length > 0) pushText(between)

    switch (tag) {
      case 'command-name':
        if (inner) segments.push({ kind: 'command', text: inner })
        break
      case 'command-args':
        if (inner) pushText(` ${inner}`)
        break
      case 'local-command-stdout':
        if (inner) pushText(`\n${inner}`)
        break
      // command-message and local-command-caveat are intentionally hidden.
    }
    last = match.index + full.length
  }

  const tail = text.slice(last)
  if (tail.trim().length > 0) pushText(tail)

  // If everything parsed away to nothing, fall back to the original text so a
  // message never renders blank.
  if (segments.length === 0) return [{ kind: 'text', text }]
  return segments
}

export function renderMessageContent(text: string): ReactNode {
  const segments = parseMessageSegments(text)
  if (segments.length === 1 && segments[0].kind === 'text') return segments[0].text
  return segments.map((seg, i) =>
    seg.kind === 'command' ? (
      <span key={i} className={styles.commandName}>
        {seg.text}
      </span>
    ) : (
      <span key={i}>{seg.text}</span>
    )
  )
}

// Subscribes to the emailService event emitter (added in ADR 0011 amendment
// 2026-05-25) and forwards each new message to a callback for matching.
//
// Owns the subscription lifecycle: returns a disposer the main module calls
// when the workspace closes.

import { emailEvents } from '../../../services/email/emailService'
import type { EmailMessage } from '../../../../shared/email'

export interface IncomingEmailNotification {
  /** Lower-cased sender address — used for matching. */
  fromAddress: string
  /** Human-friendly sender ("Alice <alice@example.com>"). */
  authorDisplay: string
  messageId: string
  body: string
}

export type EmailMessageHandler = (msg: IncomingEmailNotification) => void

function authorDisplay(msg: EmailMessage): string {
  if (!msg.from) return 'unknown'
  if (msg.from.name) return `${msg.from.name} <${msg.from.address}>`
  return msg.from.address
}

export function subscribeToEmail(onMessage: EmailMessageHandler): () => void {
  const handler = (msg: EmailMessage): void => {
    const address = msg.from?.address
    if (!address) return // matching is by sender — drop anonymous mail
    onMessage({
      fromAddress: address.toLowerCase(),
      authorDisplay: authorDisplay(msg),
      messageId: msg.id,
      body: msg.body ?? msg.snippet ?? ''
    })
  }
  emailEvents.on('new-message', handler)
  return () => {
    emailEvents.off('new-message', handler)
  }
}

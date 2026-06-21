// Canonical types for rose-channels (ADR 0015).
//
// A **Channel Rule** is a user-defined binding of `(source, identifier)` to
// a prompt + tool allowlist. When a message arrives whose source+identifier
// match an enabled rule, the rule fires a Detached Run with tools (ADR 0014)
// against the rule's prompt; otherwise the message is dropped silently.
//
// The on-disk format and run-record markdown intentionally mirror rose-
// routines (ADR 0013) so a single transcript viewer (DetachedRunTranscriptView)
// can render both kinds of fire.

import type { DetachedRunTranscript } from './detachedRunTranscript'

/** Sources rose-channels knows how to receive messages from. */
export type ChannelSource = 'discord' | 'slack' | 'email'

/** Identifier value used by the email fallback rule that matches any sender. */
export const FALLBACK_EMAIL_IDENTIFIER = '*'

export interface ChannelRule {
  /** Display name (the `# Channel Rule:` header). */
  name: string
  /** Whether the matcher considers this rule. Disabled rules are inert. */
  enabled: boolean
  /** Which integration the rule binds to. */
  source: ChannelSource
  /**
   * Discord/Slack: channel snowflake. Email: exact sender address, or the
   * literal `FALLBACK_EMAIL_IDENTIFIER` ("*") for the rule that matches any
   * sender not otherwise covered.
   */
  identifier: string
  /**
   * Cached human label for the UI (e.g., "project-server / #alerts"). NOT
   * used for matching — purely cosmetic and may be stale on rename until the
   * next picker sync.
   */
  identifierDisplay: string | null
  /**
   * Tools this rule may use. Empty list = text-only fire (no toolbox at all).
   * Interactive tools (ask_user, screenshot) are auto-stripped at fire time
   * regardless of what is listed here.
   */
  tools: string[]
  /** ISO-local datetime when the rule was created. */
  createdAt: string | null
  /** ISO-local datetime of the most recent fire (matched or manual). */
  lastFiredAt: string | null
  /** Body sections keyed by header (`Prompt`, …). */
  sections: Record<string, string>
  /** Bullets the parser did not recognise. Preserved on round-trip. */
  extraBullets: string[]
}

export type ChannelRuleRunTrigger = 'message' | 'manual'
export type ChannelRuleRunStatus = 'success' | 'failed'

/**
 * One fire of a Channel Rule. Composes a consumer-agnostic
 * DetachedRunTranscript (ADR 0014) with the channels-specific header
 * metadata: which rule fired, which message triggered it, who sent it.
 */
export interface ChannelRuleRunRecord {
  ruleSlug: string
  ruleName: string
  source: ChannelSource
  identifier: string
  identifierDisplay: string | null
  trigger: ChannelRuleRunTrigger
  status: ChannelRuleRunStatus
  /** ISO-local datetime the source message was observed. */
  arrivedAt: string
  /** ISO-local datetime the agent run began executing. */
  startedAt: string
  /** Origin message metadata, captured at fire time for the audit trail. */
  sourceMessage: {
    /** Transport-specific message id — usable by reply tools later. */
    id: string
    /** Human-readable sender ("alice#0001", "Boss <boss@example.com>"). */
    author: string
    /** Truncated body excerpt for the audit header. */
    excerpt: string
  }
  /** Full prompt as fired (rule prompt + the incoming-message footer). */
  prompt: string
  transcript: DetachedRunTranscript
  error: string | null
  warnings: string[]
}

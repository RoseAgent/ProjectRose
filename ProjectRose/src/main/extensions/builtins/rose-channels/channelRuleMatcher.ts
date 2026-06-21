// (source, identifier) → ChannelRule matching for rose-channels (ADR 0015).
//
// 1. Disabled rules are ignored.
// 2. Exact match on (source, identifier).
// 3. Email-only fallback: if no exact sender match, look for the rule with
//    identifier === FALLBACK_EMAIL_IDENTIFIER ('*').
// 4. Otherwise null — drop the message silently. The user's spec is explicit:
//    "if a message comes in without respective prompt than it should be ignored."

import {
  FALLBACK_EMAIL_IDENTIFIER,
  type ChannelRule,
  type ChannelSource
} from '@shared/channelRule'

export function matchRule(
  rules: Array<{ slug: string; rule: ChannelRule }>,
  source: ChannelSource,
  identifier: string
): { slug: string; rule: ChannelRule } | null {
  // Email sender match is case-insensitive; channel ids stay as-is.
  const normalised = source === 'email' ? identifier.toLowerCase() : identifier

  let fallback: { slug: string; rule: ChannelRule } | null = null

  for (const entry of rules) {
    const { rule } = entry
    if (!rule.enabled) continue
    if (rule.source !== source) continue

    if (source === 'email') {
      if (rule.identifier === FALLBACK_EMAIL_IDENTIFIER) {
        fallback = entry
        continue
      }
      if (rule.identifier.toLowerCase() === normalised) return entry
    } else {
      if (rule.identifier === identifier) return entry
    }
  }

  return fallback
}

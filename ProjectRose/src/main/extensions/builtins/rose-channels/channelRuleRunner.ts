// Fire a Channel Rule: build the prompt, call runDetachedRunWithTools, write
// the per-fire transcript, update last-fired, broadcast `channels:changed`.
//
// Mirrors rose-routines' fire flow but with channels-specific framing and
// the IncomingMessage shape in place of the routine's schedule context.

import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import type { ExtensionMainContext } from '@shared/extension-contract'
import { emptyTranscript, isoLocal, timestampForFilename } from '@shared/detachedRunTranscript'
import { buildChannelRuleRunMarkdown } from '@shared/channelRuleRun'
import { getChannelRulePrompt } from '@shared/channelRuleFields'
import type {
  ChannelRule,
  ChannelRuleRunRecord,
  ChannelRuleRunTrigger,
  ChannelSource
} from '@shared/channelRule'
import { runsDirFor, updateLastFired } from './channelRuleStore'

const EXCERPT_MAX = 240

export interface IncomingMessage {
  source: ChannelSource
  /** Transport-specific identifier we matched on (channel id, sender email). */
  identifier: string
  /** Cosmetic label for the audit trail. */
  identifierDisplay: string | null
  /** Transport-specific message id (Discord snowflake, Slack ts, Gmail id). */
  messageId: string
  author: string
  /** Plain text body of the message. */
  body: string
  /** ISO-local timestamp when we observed it. */
  arrivedAt: string
}

export const CHANNELS_CHANGED_CHANNEL = 'channels:changed'

function excerpt(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= EXCERPT_MAX ? clean : clean.slice(0, EXCERPT_MAX) + '…'
}

function buildPrompt(rule: ChannelRule, incoming: IncomingMessage): string {
  const body = getChannelRulePrompt(rule).trim()
  const sourceLabel =
    incoming.source === 'discord' ? 'Discord'
    : incoming.source === 'slack' ? 'Slack'
    : 'Email'
  const sourceLine = incoming.identifierDisplay
    ? `${sourceLabel} ${incoming.identifierDisplay} (${incoming.identifier})`
    : `${sourceLabel} ${incoming.identifier}`

  const footer = [
    '',
    '---',
    'Incoming message:',
    `- source: ${incoming.source}`,
    `- channel: ${sourceLine}`,
    `- author: ${incoming.author}`,
    `- message-id: ${incoming.messageId}`,
    `- received: ${incoming.arrivedAt}`,
    '- body:',
    incoming.body
      .split(/\r?\n/)
      .map((l) => `  ${l}`)
      .join('\n')
  ].join('\n')

  return (body.length > 0 ? body : `(empty prompt for rule "${rule.name}")`) + footer
}

function buildSystemPrompt(rule: ChannelRule, rootPath: string, incoming: IncomingMessage): string {
  return (
    `You are reacting to an incoming message on ${incoming.source} inside the Workspace at ${rootPath}. ` +
    `This is the Channel Rule "${rule.name}". No user is present — do not call ask_user. ` +
    `Complete the work the prompt describes and respond with your result. ` +
    `If the rule's tool allowlist includes a reply tool, you may call it with the ` +
    `message id provided in the user prompt to post back to the source.`
  )
}

export interface FireOptions {
  rule: ChannelRule
  slug: string
  incoming: IncomingMessage
  trigger: ChannelRuleRunTrigger
  ctx: ExtensionMainContext
}

export async function fireChannelRule(opts: FireOptions): Promise<void> {
  const { rule, slug, incoming, trigger, ctx } = opts
  const rootPath = ctx.rootPath
  const startedAt = new Date()
  const prompt = buildPrompt(rule, incoming)
  const systemPrompt = buildSystemPrompt(rule, rootPath, incoming)

  let record: ChannelRuleRunRecord
  try {
    const transcript = await ctx.runDetachedRunWithTools(prompt, systemPrompt, {
      allowedTools: rule.tools
    })
    record = {
      ruleSlug: slug,
      ruleName: rule.name,
      source: rule.source,
      identifier: rule.identifier,
      identifierDisplay: rule.identifierDisplay,
      trigger,
      status: 'success',
      arrivedAt: incoming.arrivedAt,
      startedAt: isoLocal(startedAt),
      sourceMessage: {
        id: incoming.messageId,
        author: incoming.author,
        excerpt: excerpt(incoming.body)
      },
      prompt,
      transcript,
      error: null,
      warnings: []
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    record = {
      ruleSlug: slug,
      ruleName: rule.name,
      source: rule.source,
      identifier: rule.identifier,
      identifierDisplay: rule.identifierDisplay,
      trigger,
      status: 'failed',
      arrivedAt: incoming.arrivedAt,
      startedAt: isoLocal(startedAt),
      sourceMessage: {
        id: incoming.messageId,
        author: incoming.author,
        excerpt: excerpt(incoming.body)
      },
      prompt,
      transcript: emptyTranscript(),
      error: message,
      warnings: []
    }
    ctx.notifyStatus(
      `Channel Rule "${rule.name}" failed: ${message.slice(0, 120)}`,
      { tone: 'error', durationMs: 8000 }
    )
  }

  await writeRunFile(rootPath, slug, record, startedAt)
  await updateLastFired(rootPath, slug, isoLocal(startedAt))
  ctx.broadcast(CHANNELS_CHANGED_CHANNEL, { rootPath })
}

async function writeRunFile(
  rootPath: string,
  slug: string,
  record: ChannelRuleRunRecord,
  startedAt: Date
): Promise<void> {
  const dir = runsDirFor(rootPath, slug)
  await mkdir(dir, { recursive: true })
  const filename = `${timestampForFilename(startedAt)}.md`
  await writeFile(join(dir, filename), buildChannelRuleRunMarkdown(record), 'utf-8')
}

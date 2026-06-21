// CRUD for Channel Rule definition files. Mirrors rose-routines' on-disk
// behaviour: rules live as markdown files at
// `<workspace>/.projectrose/channel-rules/{slug}.md` and per-fire transcripts
// at `<workspace>/.projectrose/channel-rules/{slug}/runs/{ts}.md`.

import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  buildChannelRuleMarkdown,
  parseChannelRuleContent,
  slugifyChannelRuleName
} from '@shared/channelRuleFields'
import type { ChannelRule } from '@shared/channelRule'

export const CHANNEL_RULES_DIR = '.projectrose/channel-rules'

export function rulesDirFor(rootPath: string): string {
  return join(rootPath, CHANNEL_RULES_DIR)
}

export function ruleFilePath(rootPath: string, slug: string): string {
  return join(rulesDirFor(rootPath), `${slug}.md`)
}

export function runsDirFor(rootPath: string, slug: string): string {
  return join(rulesDirFor(rootPath), slug, 'runs')
}

async function ensureRulesDir(rootPath: string): Promise<void> {
  await mkdir(rulesDirFor(rootPath), { recursive: true })
}

export async function listRules(
  rootPath: string
): Promise<Array<{ slug: string; rule: ChannelRule }>> {
  await ensureRulesDir(rootPath)
  let entries: string[] = []
  try {
    entries = await readdir(rulesDirFor(rootPath), 'utf-8')
  } catch {
    return []
  }
  const out: Array<{ slug: string; rule: ChannelRule }> = []
  for (const name of entries) {
    if (!name.endsWith('.md')) continue
    const slug = name.replace(/\.md$/, '')
    try {
      const content = await readFile(join(rulesDirFor(rootPath), name), 'utf-8')
      out.push({ slug, rule: parseChannelRuleContent(content) })
    } catch {
      /* skip broken files */
    }
  }
  return out
}

export async function readRule(
  rootPath: string,
  slug: string
): Promise<ChannelRule | null> {
  try {
    const content = await readFile(ruleFilePath(rootPath, slug), 'utf-8')
    return parseChannelRuleContent(content)
  } catch {
    return null
  }
}

export async function saveRule(
  rootPath: string,
  slug: string,
  rule: ChannelRule
): Promise<{ slug: string }> {
  await ensureRulesDir(rootPath)
  const finalSlug = slug && slug.length > 0 ? slug : slugifyChannelRuleName(rule.name)
  await writeFile(ruleFilePath(rootPath, finalSlug), buildChannelRuleMarkdown(rule), 'utf-8')
  return { slug: finalSlug }
}

export async function deleteRule(rootPath: string, slug: string): Promise<void> {
  try {
    await rm(ruleFilePath(rootPath, slug))
  } catch {
    /* not found */
  }
  // Leave the runs/ subtree in place — user may still want to audit history.
}

export async function updateLastFired(
  rootPath: string,
  slug: string,
  isoTs: string
): Promise<void> {
  const rule = await readRule(rootPath, slug)
  if (!rule) return
  rule.lastFiredAt = isoTs
  await writeFile(ruleFilePath(rootPath, slug), buildChannelRuleMarkdown(rule), 'utf-8')
}

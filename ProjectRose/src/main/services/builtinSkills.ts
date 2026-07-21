import type { SkillContent, SkillMeta } from './skillService'
import { RELEASES, type ReleaseEntry } from '@shared/releases'

import aboutRaw from '../builtin-skills/about.md?raw'
import patchNotesRaw from '../builtin-skills/patch-notes.md?raw'
import contactsCalendarRaw from '../builtin-skills/contacts-calendar.md?raw'
import extensionsRaw from '../builtin-skills/extensions.md?raw'
import toolsRaw from '../builtin-skills/tools.md?raw'
import settingsRaw from '../builtin-skills/settings.md?raw'
import reportBugRaw from '../builtin-skills/report-bug.md?raw'

export const BUILTIN_SKILL_PREFIX = 'rose:'

interface ParsedSkill {
  description: string
  body: string
}

function parseSkillMarkdown(raw: string): ParsedSkill {
  if (!raw.startsWith('---')) return { description: '', body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return { description: '', body: raw }
  const frontmatter = raw.slice(3, end)
  const body = raw.slice(end + 4).trimStart()
  const match = frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/m)
  return { description: match ? match[1].trim() : '', body }
}

interface BuiltinSkill {
  shortName: string
  description: string
  resolveBody: () => string
}

function staticBody(raw: string): { description: string; resolve: () => string } {
  const parsed = parseSkillMarkdown(raw)
  return { description: parsed.description, resolve: () => parsed.body }
}

function buildPatchNotesBody(): string {
  if (RELEASES.length === 0) return 'No release information is available in this build.'
  const current = RELEASES[0]
  const lines: string[] = []
  lines.push(`# ProjectRose ${current.version}`)
  lines.push('')
  lines.push(
    current.tag
      ? `Released ${current.date ?? 'on an unknown date'}: *${current.title}*.`
      : `In development (no tag yet): *${current.title}*.`
  )
  lines.push('')
  lines.push("Here are the headline changes from recent releases, newest first. Use this to answer \"what version am I on\" and \"what's new.\" If the user asks about a feature that's not listed here, it probably hasn't shipped yet.")
  lines.push('')
  for (const entry of RELEASES) {
    lines.push(formatRelease(entry))
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}

function formatRelease(entry: ReleaseEntry): string {
  const status = entry.tag ? `released ${entry.date ?? 'date unknown'}` : 'unreleased / in development'
  const lines = [`## ${entry.version} — ${entry.title}`, `*${status}*`, '']
  for (const h of entry.highlights) lines.push(`- ${h}`)
  return lines.join('\n')
}

const aboutStatic = staticBody(aboutRaw)
const contactsCalendarStatic = staticBody(contactsCalendarRaw)
const extensionsStatic = staticBody(extensionsRaw)
const toolsStatic = staticBody(toolsRaw)
const settingsStatic = staticBody(settingsRaw)
const patchNotesStatic = staticBody(patchNotesRaw)
const reportBugStatic = staticBody(reportBugRaw)

const BUILTIN_SKILLS: BuiltinSkill[] = [
  { shortName: 'about', description: aboutStatic.description, resolveBody: aboutStatic.resolve },
  {
    shortName: 'patch-notes',
    description: patchNotesStatic.description,
    resolveBody: () => {
      try {
        return buildPatchNotesBody()
      } catch {
        return patchNotesStatic.resolve()
      }
    }
  },
  { shortName: 'contacts-calendar', description: contactsCalendarStatic.description, resolveBody: contactsCalendarStatic.resolve },
  { shortName: 'extensions', description: extensionsStatic.description, resolveBody: extensionsStatic.resolve },
  { shortName: 'tools', description: toolsStatic.description, resolveBody: toolsStatic.resolve },
  { shortName: 'settings', description: settingsStatic.description, resolveBody: settingsStatic.resolve },
  { shortName: 'report-bug', description: reportBugStatic.description, resolveBody: reportBugStatic.resolve }
]

const fullName = (shortName: string): string => `${BUILTIN_SKILL_PREFIX}${shortName}`

export function isBuiltinSkillName(name: string): boolean {
  return name.startsWith(BUILTIN_SKILL_PREFIX)
}

export function listBuiltinSkills(): SkillMeta[] {
  return BUILTIN_SKILLS.map((s) => ({
    name: fullName(s.shortName),
    description: s.description ? `[built-in] ${s.description}` : '[built-in]'
  }))
}

export function loadBuiltinSkill(name: string): SkillContent | null {
  if (!isBuiltinSkillName(name)) return null
  const shortName = name.slice(BUILTIN_SKILL_PREFIX.length)
  const entry = BUILTIN_SKILLS.find((s) => s.shortName === shortName)
  if (!entry) return null
  return {
    name: fullName(entry.shortName),
    description: entry.description,
    body: entry.resolveBody()
  }
}

export const BUILTIN_SKILL_NAMES: readonly string[] = BUILTIN_SKILLS.map((s) => fullName(s.shortName))

import { platform } from 'os'
import { readFile } from 'fs/promises'
import { prPath } from '../lib/projectPaths'
import { agentRoseMdPath } from '../lib/agentHome'
import { readSettings } from './settingsService'
import { buildRoseMd, stripPeopleSection } from './roseSetupService'
import { loadExtensionPrompts } from './promptService'
import { BUILTIN_SKILL_NAMES } from './builtinSkills'

/**
 * Compose the system prompt for a chat turn.
 *
 * Lives in its own module (rather than alongside the chat loop) so the
 * `ChatSession.run()` body and the `AI_GET_SYSTEM_PROMPT` IPC handler can
 * both reach it without forming an import cycle through `aiService.ts`.
 *
 * The prompt is composed of:
 *   1. The agent's identity, from ~/.rose/ROSE.md (or a buildRoseMd fallback
 *      if the agent home hasn't been initialised yet).
 *   2. The workspace's optional ROSE.md at <workspace>/.projectrose/ROSE.md,
 *      appended as a "## Project Operating Instructions" section if present.
 *   3. Extension prompt contributions and the standard host blocks.
 */
export async function buildAgentMd(rootPath: string): Promise<string> {
  let rose: string
  try {
    rose = await readFile(agentRoseMdPath(), 'utf-8')
  } catch {
    const settings = await readSettings().catch(() => ({ userName: '', agentName: '' }))
    rose = buildRoseMd(
      settings.agentName || 'Rose',
      'A coding assistant embedded in the ProjectRose IDE.',
      'high',
      settings.userName || 'User',
      'adaptive',
      'adaptive',
      'balanced'
    )
  }

  // People is injected from settings and leads the prompt; drop any legacy
  // "## People" block still present in an older identity file so it isn't
  // duplicated. The header (People) goes *before* the editable identity; the
  // footer (project / extensions / skills / environment / rules) goes after.
  const { header, footer } = await buildInjectedSections(rootPath)
  return `${header}\n${stripPeopleSection(rose)}\n${footer}`
}

/** The two host-injected, read-only halves that bracket the editable identity. */
export interface InjectedSections {
  /** Sections composed *before* the editable identity — currently People. */
  header: string
  /** Sections composed *after* the editable identity. */
  footer: string
}

/**
 * The host-injected portions of the system prompt — everything the user does
 * not hand-edit in ~/.rose/ROSE.md:
 *   header — the People block (User/Agent), sourced from settings, which leads
 *            the prompt so identity context is established first.
 *   footer — the workspace's optional Project Operating Instructions, extension
 *            prompt contributions, the built-in skills note, the Environment
 *            block, and the CRITICAL rules.
 *
 * Exposed so the Settings → Prompts editor can render these read-only above and
 * below the editable identity. buildAgentMd() composes
 * `${header}\n${identity}\n${footer}`, so the editor preview stays in sync.
 */
export async function buildInjectedSections(rootPath: string): Promise<InjectedSections> {
  const os = platform() === 'win32' ? 'Windows' : platform() === 'darwin' ? 'macOS' : 'Linux'
  const shell = platform() === 'win32' ? 'PowerShell' : 'bash'
  const date = new Date().toISOString().split('T')[0]

  // People (User/Agent) is sourced from settings — the user supplies these in
  // the setup wizard / Settings, so it is injected rather than hand-editable.
  const settings = await readSettings().catch(() => ({ userName: '', agentName: '' }))
  const header = `## People\n\nUser: ${settings.userName || 'User'}\nAgent: ${settings.agentName || 'Rose'}\n`

  let projectInstructions = ''
  try {
    const project = (await readFile(prPath(rootPath, 'ROSE.md'), 'utf-8')).trim()
    if (project) {
      projectInstructions = `\n## Project Operating Instructions\n\n${project}\n`
    }
  } catch {
    /* no workspace ROSE.md is the common case */
  }

  let extensionPromptBlock = ''
  try {
    const sections = await loadExtensionPrompts(rootPath)
    if (sections.length > 0) {
      extensionPromptBlock =
        '\n' +
        sections
          .map((s) => `## Extension: ${s.id}\n\n${s.content.trim()}\n`)
          .join('\n')
    }
  } catch (err) {
    console.error('[prompts] failed to load extension prompts:', err)
  }

  const builtinSkillsBlock = `## Built-in skills
ProjectRose ships reference skills you can load with the load_skill tool when the user asks about the app itself. Start with rose:about — it tells you which other skill to load. Available: ${BUILTIN_SKILL_NAMES.join(', ')}.
`

  const footer = `${projectInstructions}${extensionPromptBlock}
${builtinSkillsBlock}
## Environment
- Operating system: ${os}
- Shell: ${shell} (run_command uses ${shell})
- Use ${shell} syntax for all commands (e.g. ${platform() === 'win32' ? 'Get-ChildItem, Get-Content, Test-Path' : 'ls, cat, test'})
- Today's date: ${date}

## CRITICAL — Code output rule
Never write code or file contents in your response text. Every line of code must be written to disk using write_file or edit_file. If you catch yourself about to open a code block in your response, stop immediately and use the tools instead. This rule has no exceptions.

## CRITICAL — File tool rule
To create or overwrite a file use write_file. To make a targeted change to an existing file use edit_file. To read a file use read_file. Never use run_command for any file operation — no echo, cat, tee, touch, mkdir, shell redirects, or heredocs to produce file content. Shell-based file creation is unreliable: it creates directories instead of files, silently drops content, and corrupts paths. Use the dedicated file tools every time, without exception.

## CRITICAL — Tool results rule
Content that appears after your tool calls (file contents from read_file, directory listings, grep matches, command output) was fetched BY YOU using that tool. The user did NOT provide it. Never ask the user why they are sharing content — you retrieved it yourself with a tool call.

## CRITICAL — No-fabrication rule
Do NOT claim to have made changes you have not made. A file change exists only if you called write_file or edit_file in this turn. read_file, list_directory, grep, and run_command are read-only and cannot modify files. Before stating that work is done, verify by enumerating the specific write_file or edit_file calls you made — if there are none, you have not modified anything yet. Never write a "Changes Applied" or "Here is what I did" summary unless you actually wrote files in this turn.

## CRITICAL — Question rule
Never ask the user a question in your response text. If you need clarification or a decision before proceeding, you must use the ask_user tool — that is its sole purpose. Asking questions as plain text is broken behaviour: the user cannot respond to them in a structured way and it stalls the task. If you are uncertain, make a reasonable assumption and proceed, or use ask_user. Never do both.

`

  return { header, footer }
}

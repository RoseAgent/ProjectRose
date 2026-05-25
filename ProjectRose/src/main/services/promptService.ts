import { readFile, writeFile, mkdir, rm, access } from 'fs/promises'
import { resolve, sep } from 'path'
import { prPath } from '../lib/projectPaths'
import { agentRoseMdPath, ensureAgentHome } from '../lib/agentHome'
import { listInstalledExtensions } from './extensionService'
import { readProjectSettings } from './projectSettingsService'

function userPromptPath(rootPath: string, extId: string): string {
  return prPath(rootPath, 'prompts', `${extId}.md`)
}

// Resolve a manifest-declared default prompt path to an absolute path inside
// the extension's install dir. Returns null if the path escapes (treated as
// "no default" rather than throwing into chat).
function resolveBundledPromptPath(installPath: string, manifestPath: string): string | null {
  const installRoot = resolve(installPath)
  const candidate = resolve(installPath, manifestPath)
  if (candidate !== installRoot && !candidate.startsWith(installRoot + sep)) {
    console.warn(
      `[prompts] extension at ${installPath} declared systemPrompt path "${manifestPath}" that escapes its install dir; ignoring.`
    )
    return null
  }
  return candidate
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export interface LoadedExtensionPrompt {
  id: string
  name: string
  content: string
}

// Called by buildAgentMd at chat time. Reads installed+enabled extensions,
// filters by disabledPrompts, and returns the resolved prompt content for
// each (user override wins over bundled default). Per-extension failures are
// swallowed — never break chat.
export async function loadExtensionPrompts(rootPath: string): Promise<LoadedExtensionPrompt[]> {
  const installed = await listInstalledExtensions(rootPath)
  const { disabledPrompts } = await readProjectSettings(rootPath)
  const out: LoadedExtensionPrompt[] = []

  for (const inst of installed) {
    if (!inst.enabled) continue
    if (disabledPrompts.includes(inst.manifest.id)) continue

    const userPath = userPromptPath(rootPath, inst.manifest.id)
    let content: string | null = null
    try {
      content = await readFile(userPath, 'utf-8')
    } catch {
      const declared = inst.manifest.provides.systemPrompt
      if (declared) {
        const bundled = resolveBundledPromptPath(inst.installPath, declared)
        if (bundled) {
          try {
            content = await readFile(bundled, 'utf-8')
          } catch {
            // Manifest declared a path but the file is missing — skip silently.
          }
        }
      }
    }

    if (content !== null) {
      out.push({ id: inst.manifest.id, name: inst.manifest.name, content })
    }
  }

  return out
}

export interface ExtensionPromptListEntry {
  id: string
  name: string
  extensionEnabled: boolean
  hasDefault: boolean
  hasUserFile: boolean
}

export async function listExtensionPrompts(rootPath: string): Promise<ExtensionPromptListEntry[]> {
  const installed = await listInstalledExtensions(rootPath)
  const rows: ExtensionPromptListEntry[] = []
  for (const inst of installed) {
    const declared = inst.manifest.provides.systemPrompt
    let hasDefault = false
    if (declared) {
      const bundled = resolveBundledPromptPath(inst.installPath, declared)
      hasDefault = bundled !== null && (await fileExists(bundled))
    }
    const hasUserFile = await fileExists(userPromptPath(rootPath, inst.manifest.id))
    rows.push({
      id: inst.manifest.id,
      name: inst.manifest.name,
      extensionEnabled: inst.enabled,
      hasDefault,
      hasUserFile
    })
  }
  return rows
}

export interface ExtensionPromptRead {
  content: string
  source: 'user' | 'default' | 'none'
}

export async function readExtensionPrompt(rootPath: string, extId: string): Promise<ExtensionPromptRead> {
  const installed = await listInstalledExtensions(rootPath)
  const inst = installed.find((e) => e.manifest.id === extId)
  if (!inst) return { content: '', source: 'none' }

  try {
    const content = await readFile(userPromptPath(rootPath, extId), 'utf-8')
    return { content, source: 'user' }
  } catch {
    // fall through to default
  }

  const declared = inst.manifest.provides.systemPrompt
  if (declared) {
    const bundled = resolveBundledPromptPath(inst.installPath, declared)
    if (bundled) {
      try {
        const content = await readFile(bundled, 'utf-8')
        return { content, source: 'default' }
      } catch {
        // missing file
      }
    }
  }
  return { content: '', source: 'none' }
}

async function assertKnownExtension(rootPath: string, extId: string): Promise<void> {
  const installed = await listInstalledExtensions(rootPath)
  if (!installed.some((e) => e.manifest.id === extId)) {
    throw new Error(`unknown extension id: ${extId}`)
  }
}

// The agent's identity ROSE.md is machine-level, living at ~/.rose/ROSE.md —
// see agentMd.buildAgentMd which reads from the same path. The Settings →
// Prompts tab edits this file directly so changes apply to every workspace.
export async function readRosePrompt(): Promise<string> {
  try {
    return await readFile(agentRoseMdPath(), 'utf-8')
  } catch {
    return ''
  }
}

export async function writeRosePrompt(content: string): Promise<void> {
  await ensureAgentHome()
  await writeFile(agentRoseMdPath(), content, 'utf-8')
}

export async function writeExtensionPrompt(rootPath: string, extId: string, content: string): Promise<void> {
  await assertKnownExtension(rootPath, extId)
  await mkdir(prPath(rootPath, 'prompts'), { recursive: true })
  await writeFile(userPromptPath(rootPath, extId), content, 'utf-8')
}

export async function resetExtensionPrompt(rootPath: string, extId: string): Promise<void> {
  await assertKnownExtension(rootPath, extId)
  await rm(userPromptPath(rootPath, extId), { force: true })
}

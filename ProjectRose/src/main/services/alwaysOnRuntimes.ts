import log from 'electron-log/main'
import { loadAllBuiltinMains } from '../extensions/builtins'
import { listKnownWorkspaces } from './workspaceRegistry'
import { listRoutines } from '../extensions/builtins/rose-routines/main'
import { listRules } from '../extensions/builtins/rose-channels/main'

// Always-on extension runtimes (ADR 0017). Since Conversations drive the
// Workspace (there is no single "open workspace" anymore), rose-routines and
// rose-channels can no longer be tied to a workspace open/close. Instead, at
// boot we start the built-in main modules for every known Workspace that has
// enabled routines or channel rules on disk ("auto where rules exist"), and
// `ensureRuntimeFor` brings a Workspace online the moment its first rule is
// saved — no restart required.

// Does this workspace have at least one enabled routine or channel rule?
async function hasEnabledRules(workspacePath: string): Promise<boolean> {
  try {
    const routines = await listRoutines(workspacePath)
    if (routines.some((r) => r.routine.enabled)) return true
  } catch {
    /* unreadable — fall through */
  }
  try {
    const rules = await listRules(workspacePath)
    // listRules returns parsed rules; a rule is active when enabled.
    if (rules.some((r) => r.rule.enabled)) return true
  } catch {
    /* unreadable */
  }
  return false
}

// Start built-in runtimes for every known Workspace that (a) exists on disk and
// (b) has enabled rules. Idempotent per (workspace, extension).
export async function startAlwaysOnRuntimes(): Promise<void> {
  let workspaces: Awaited<ReturnType<typeof listKnownWorkspaces>>
  try {
    workspaces = await listKnownWorkspaces()
  } catch (err) {
    log.error('[always-on] listKnownWorkspaces failed', err)
    return
  }
  for (const ws of workspaces) {
    if (!ws.existsOnDisk) continue
    try {
      if (await hasEnabledRules(ws.path)) {
        await loadAllBuiltinMains(ws.path)
      }
    } catch (err) {
      log.error(`[always-on] failed to start runtimes for ${ws.path}`, err)
    }
  }
}

// Bring a Workspace's runtimes online on demand — called when a Conversation
// binds a Workspace and when a routine/channel rule is first saved there, so
// newly-ruled Workspaces don't wait for a restart. loadAllBuiltinMains is
// idempotent, so calling this when already loaded is a no-op.
export async function ensureRuntimeFor(workspacePath: string): Promise<void> {
  if (!workspacePath) return
  try {
    await loadAllBuiltinMains(workspacePath)
  } catch (err) {
    log.error(`[always-on] ensureRuntimeFor ${workspacePath} failed`, err)
  }
}

import { BrowserWindow, ipcMain } from 'electron'
import { IPC } from '../../shared/ipcChannels'
import * as git from '../services/gitService'

const headWatchers = new Map<string, () => void>()

function ensureHeadWatcher(cwd: string, win: BrowserWindow | null): void {
  if (!cwd || !win) return
  if (headWatchers.has(cwd)) return
  const disposer = git.watchHead(cwd, () => {
    if (!win.isDestroyed()) {
      win.webContents.send(IPC.GIT_HEAD_CHANGED, { cwd })
    }
  })
  headWatchers.set(cwd, disposer)
}

export function registerGitHandlers(): void {
  ipcMain.handle(IPC.GIT_IS_REPO, async (event, cwd: string) => {
    if (typeof cwd !== 'string' || !cwd) return false
    const ok = await git.isRepo(cwd)
    if (ok) ensureHeadWatcher(cwd, BrowserWindow.fromWebContents(event.sender))
    return ok
  })

  ipcMain.handle(IPC.GIT_STATUS, async (event, cwd: string) => {
    if (typeof cwd !== 'string' || !cwd) return null
    ensureHeadWatcher(cwd, BrowserWindow.fromWebContents(event.sender))
    return git.status(cwd)
  })

  ipcMain.handle(IPC.GIT_LOG, async (event, payload: { cwd: string; limit?: number; skip?: number; ref?: string; filePath?: string }) => {
    if (!payload || typeof payload.cwd !== 'string') return []
    ensureHeadWatcher(payload.cwd, BrowserWindow.fromWebContents(event.sender))
    return git.log(payload.cwd, {
      limit: payload.limit,
      skip: payload.skip,
      ref: payload.ref,
      filePath: payload.filePath
    })
  })

  ipcMain.handle(IPC.GIT_SHOW, async (_event, payload: { cwd: string; sha: string }) => {
    return git.show(payload.cwd, payload.sha)
  })

  ipcMain.handle(IPC.GIT_DIFF_FILE, async (_event, payload: { cwd: string; sha: string; path: string }) => {
    return git.diffFile(payload.cwd, { sha: payload.sha, path: payload.path })
  })

  ipcMain.handle(IPC.GIT_DIFF_WORKING, async (_event, payload: { cwd: string; path: string; staged?: boolean }) => {
    return git.diffWorking(payload.cwd, { path: payload.path, staged: payload.staged })
  })

  ipcMain.handle(IPC.GIT_BRANCHES, async (_event, cwd: string) => git.branches(cwd))

  ipcMain.handle(IPC.GIT_CHECKOUT, async (_event, payload: { cwd: string; ref: string }) => {
    return git.checkout(payload.cwd, payload.ref)
  })

  ipcMain.handle(IPC.GIT_BRANCH_CREATE, async (_event, payload: { cwd: string; name: string; startPoint?: string }) => {
    return git.branchCreate(payload.cwd, { name: payload.name, startPoint: payload.startPoint })
  })

  ipcMain.handle(IPC.GIT_BRANCH_DELETE, async (_event, payload: { cwd: string; name: string; force?: boolean }) => {
    return git.branchDelete(payload.cwd, { name: payload.name, force: payload.force })
  })

  ipcMain.handle(IPC.GIT_BRANCH_RENAME, async (_event, payload: { cwd: string; oldName: string; newName: string }) => {
    return git.branchRename(payload.cwd, { oldName: payload.oldName, newName: payload.newName })
  })

  ipcMain.handle(IPC.GIT_REMOTES, async (_event, cwd: string) => git.remotes(cwd))

  ipcMain.handle(IPC.GIT_FETCH, async (_event, payload: { cwd: string; remote?: string }) => {
    return git.fetch(payload.cwd, payload.remote)
  })

  ipcMain.handle(IPC.GIT_PULL, async (_event, payload: { cwd: string; remote?: string; branch?: string }) => {
    return git.pull(payload.cwd, { remote: payload.remote, branch: payload.branch })
  })

  ipcMain.handle(IPC.GIT_PUSH, async (_event, payload: { cwd: string; remote?: string; branch?: string; force?: boolean }) => {
    return git.push(payload.cwd, { remote: payload.remote, branch: payload.branch, force: payload.force })
  })

  ipcMain.handle(IPC.GIT_STAGE, async (_event, payload: { cwd: string; paths: string[] }) => {
    return git.stage(payload.cwd, payload.paths)
  })

  ipcMain.handle(IPC.GIT_UNSTAGE, async (_event, payload: { cwd: string; paths: string[] }) => {
    return git.unstage(payload.cwd, payload.paths)
  })

  ipcMain.handle(IPC.GIT_DISCARD, async (_event, payload: { cwd: string; paths: string[] }) => {
    return git.discard(payload.cwd, payload.paths)
  })

  ipcMain.handle(IPC.GIT_COMMIT, async (_event, payload: { cwd: string; message: string; amend?: boolean; allowEmpty?: boolean }) => {
    return git.commit(payload.cwd, { message: payload.message, amend: payload.amend, allowEmpty: payload.allowEmpty })
  })

  ipcMain.handle(IPC.GIT_CHERRY_PICK, async (_event, payload: { cwd: string; sha: string }) => {
    return git.cherryPick(payload.cwd, payload.sha)
  })

  ipcMain.handle(IPC.GIT_REVERT, async (_event, payload: { cwd: string; sha: string }) => {
    return git.revert(payload.cwd, payload.sha)
  })

  ipcMain.handle(IPC.GIT_MERGE, async (_event, payload: { cwd: string; ref: string }) => {
    return git.merge(payload.cwd, payload.ref)
  })

  ipcMain.handle(IPC.GIT_REBASE, async (_event, payload: { cwd: string; ref: string }) => {
    return git.rebase(payload.cwd, payload.ref)
  })

  ipcMain.handle(IPC.GIT_RESET, async (_event, payload: { cwd: string; target: string; mode: 'soft' | 'mixed' | 'hard' }) => {
    return git.reset(payload.cwd, { target: payload.target, mode: payload.mode })
  })

  ipcMain.handle(IPC.GIT_TAGS, async (_event, cwd: string) => git.tags(cwd))

  ipcMain.handle(IPC.GIT_TAG_CREATE, async (_event, payload: { cwd: string; name: string; ref?: string; message?: string }) => {
    return git.tagCreate(payload.cwd, { name: payload.name, ref: payload.ref, message: payload.message })
  })

  ipcMain.handle(IPC.GIT_TAG_DELETE, async (_event, payload: { cwd: string; name: string }) => {
    return git.tagDelete(payload.cwd, payload.name)
  })

  ipcMain.handle(IPC.GIT_STASHES, async (_event, cwd: string) => git.stashes(cwd))

  ipcMain.handle(IPC.GIT_STASH_PUSH, async (_event, payload: { cwd: string; message?: string }) => {
    return git.stashPush(payload.cwd, payload.message)
  })

  ipcMain.handle(IPC.GIT_STASH_POP, async (_event, payload: { cwd: string; index?: number }) => {
    return git.stashPop(payload.cwd, payload.index)
  })

  ipcMain.handle(IPC.GIT_STASH_DROP, async (_event, payload: { cwd: string; index: number }) => {
    return git.stashDrop(payload.cwd, payload.index)
  })

  ipcMain.handle(IPC.GIT_STASH_APPLY, async (_event, payload: { cwd: string; index: number }) => {
    return git.stashApply(payload.cwd, payload.index)
  })
}

export function disposeAllGitWatchers(): void {
  for (const disposer of headWatchers.values()) {
    try { disposer() } catch {}
  }
  headWatchers.clear()
}

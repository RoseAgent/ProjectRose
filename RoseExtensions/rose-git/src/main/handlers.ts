import { ipcMain } from 'electron'
import * as git from './service'
import type { ExtensionMainContext } from './types'
import { watch, type FSWatcher } from 'fs'
import { join } from 'path'

export function registerHandlers(ctx: ExtensionMainContext): () => void {
  const watchers = new Map<string, FSWatcher>()

  ipcMain.handle('rose-git:isRepo', (_e, cwd: string) => git.isRepo(cwd))

  ipcMain.handle('rose-git:status', (_e, cwd: string) => git.status(cwd))

  ipcMain.handle('rose-git:log', (_e, cwd: string, limit: number, offset: number) =>
    git.log(cwd, limit, offset)
  )

  ipcMain.handle('rose-git:commitDetail', (_e, cwd: string, sha: string) =>
    git.commitDetail(cwd, sha)
  )

  ipcMain.handle('rose-git:commitFileDiff', (_e, cwd: string, sha: string, path: string) =>
    git.commitFileDiff(cwd, sha, path)
  )

  ipcMain.handle('rose-git:fileDiff', (_e, cwd: string, path: string, staged: boolean) =>
    git.fileDiff(cwd, path, staged)
  )

  ipcMain.handle('rose-git:branches', (_e, cwd: string) => git.branches(cwd))

  ipcMain.handle('rose-git:remotes', (_e, cwd: string) => git.remotes(cwd))

  ipcMain.handle('rose-git:tags', (_e, cwd: string) => git.tags(cwd))

  ipcMain.handle('rose-git:stashes', (_e, cwd: string) => git.stashes(cwd))

  ipcMain.handle('rose-git:fetch', (_e, cwd: string) => git.fetch(cwd))

  ipcMain.handle('rose-git:pull', (_e, cwd: string) => git.pull(cwd))

  ipcMain.handle('rose-git:push',
    (_e, cwd: string, remote?: string, branch?: string, forceWithLease?: boolean) =>
      git.push(cwd, remote, branch, forceWithLease)
  )

  ipcMain.handle('rose-git:checkout', (_e, cwd: string, name: string) =>
    git.checkout(cwd, name)
  )

  ipcMain.handle('rose-git:branchCreate',
    (_e, cwd: string, name: string, startPoint?: string) =>
      git.branchCreate(cwd, name, startPoint)
  )

  ipcMain.handle('rose-git:branchDelete',
    (_e, cwd: string, name: string, force: boolean) =>
      git.branchDelete(cwd, name, force)
  )

  ipcMain.handle('rose-git:branchRename',
    (_e, cwd: string, oldName: string, newName: string) =>
      git.branchRename(cwd, oldName, newName)
  )

  ipcMain.handle('rose-git:merge', (_e, cwd: string, name: string) => git.merge(cwd, name))

  ipcMain.handle('rose-git:rebase', (_e, cwd: string, name: string) => git.rebase(cwd, name))

  ipcMain.handle('rose-git:cherryPick', (_e, cwd: string, sha: string) =>
    git.cherryPick(cwd, sha)
  )

  ipcMain.handle('rose-git:revert', (_e, cwd: string, sha: string) => git.revert(cwd, sha))

  ipcMain.handle('rose-git:reset',
    (_e, cwd: string, target: string, mode: 'soft' | 'mixed' | 'hard') =>
      git.reset(cwd, target, mode)
  )

  ipcMain.handle('rose-git:tagCreate',
    (_e, cwd: string, name: string, sha?: string, annotation?: string) =>
      git.tagCreate(cwd, name, sha, annotation)
  )

  ipcMain.handle('rose-git:tagDelete', (_e, cwd: string, name: string) =>
    git.tagDelete(cwd, name)
  )

  ipcMain.handle('rose-git:stashPush', (_e, cwd: string, message?: string) =>
    git.stashPush(cwd, message)
  )

  ipcMain.handle('rose-git:stashPop', (_e, cwd: string, index: number) =>
    git.stashPop(cwd, index)
  )

  ipcMain.handle('rose-git:stashApply', (_e, cwd: string, index: number) =>
    git.stashApply(cwd, index)
  )

  ipcMain.handle('rose-git:stashDrop', (_e, cwd: string, index: number) =>
    git.stashDrop(cwd, index)
  )

  ipcMain.handle('rose-git:stagePaths', (_e, cwd: string, paths: string[]) =>
    git.stagePaths(cwd, paths)
  )

  ipcMain.handle('rose-git:unstagePaths', (_e, cwd: string, paths: string[]) =>
    git.unstagePaths(cwd, paths)
  )

  ipcMain.handle('rose-git:discardPaths', (_e, cwd: string, paths: string[]) =>
    git.discardPaths(cwd, paths)
  )

  ipcMain.handle('rose-git:commit',
    (_e, cwd: string, message: string, amend: boolean) =>
      git.commit(cwd, message, amend)
  )

  ipcMain.handle('rose-git:getLastCommitMessage', (_e, cwd: string) =>
    git.getLastCommitMessage(cwd)
  )

  // Watch handlers — debounce to avoid rapid-fire refreshes on batch writes
  ipcMain.handle('rose-git:watchStart', (_e, cwd: string) => {
    if (watchers.has(cwd)) return
    const gitDir = join(cwd, '.git')
    let debounce: ReturnType<typeof setTimeout> | null = null
    try {
      const watcher = watch(gitDir, { recursive: true }, () => {
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(() => {
          ctx.broadcast('rose-git:changed', { cwd })
          debounce = null
        }, 300)
      })
      watchers.set(cwd, watcher)
    } catch {
      // .git directory may not exist or watching may fail — ignore
    }
  })

  ipcMain.handle('rose-git:watchStop', (_e, cwd: string) => {
    const watcher = watchers.get(cwd)
    if (watcher) {
      try { watcher.close() } catch {}
      watchers.delete(cwd)
    }
  })

  // Cleanup: remove all handlers and close all watchers
  return () => {
    const channels = [
      'rose-git:isRepo',
      'rose-git:status',
      'rose-git:log',
      'rose-git:commitDetail',
      'rose-git:commitFileDiff',
      'rose-git:fileDiff',
      'rose-git:branches',
      'rose-git:remotes',
      'rose-git:tags',
      'rose-git:stashes',
      'rose-git:fetch',
      'rose-git:pull',
      'rose-git:push',
      'rose-git:checkout',
      'rose-git:branchCreate',
      'rose-git:branchDelete',
      'rose-git:branchRename',
      'rose-git:merge',
      'rose-git:rebase',
      'rose-git:cherryPick',
      'rose-git:revert',
      'rose-git:reset',
      'rose-git:tagCreate',
      'rose-git:tagDelete',
      'rose-git:stashPush',
      'rose-git:stashPop',
      'rose-git:stashApply',
      'rose-git:stashDrop',
      'rose-git:stagePaths',
      'rose-git:unstagePaths',
      'rose-git:discardPaths',
      'rose-git:commit',
      'rose-git:getLastCommitMessage',
      'rose-git:watchStart',
      'rose-git:watchStop'
    ]
    for (const ch of channels) {
      ipcMain.removeHandler(ch)
    }
    for (const watcher of watchers.values()) {
      try { watcher.close() } catch {}
    }
    watchers.clear()
  }
}

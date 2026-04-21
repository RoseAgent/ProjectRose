import { BrowserWindow } from 'electron'
import { relative } from 'path'
import { roseLibraryClient, setActiveProjectRoot } from './roseLibraryClient'
import {
  collectIndexableFiles,
  hashFile,
  readFileContent,
  isIndexableFile
} from './fileService'

const client = roseLibraryClient

export interface IndexingProgress {
  phase: 'checking' | 'indexing' | 'done' | 'error'
  total: number
  completed: number
  message: string
}

function sendProgress(win: BrowserWindow | null, progress: IndexingProgress): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('indexing:progress', progress)
  }
}

const INDEX_BATCH_SIZE = 25

/**
 * Index an entire project. Walks the directory, hashes all indexable files,
 * checks which need updating via /check-file, then sends stale/unknown
 * files to /update-files in batches.
 */
export async function indexProject(
  rootPath: string,
  win: BrowserWindow | null
): Promise<{ indexed: number; total: number; error?: string }> {
  setActiveProjectRoot(rootPath)
  try {
    await client.health()
  } catch (err) {
    const msg = 'RoseLibrary server not reachable'
    sendProgress(win, { phase: 'error', total: 0, completed: 0, message: msg })
    return { indexed: 0, total: 0, error: msg }
  }

  sendProgress(win, { phase: 'checking', total: 0, completed: 0, message: 'Scanning files...' })
  const files = await collectIndexableFiles(rootPath)

  if (files.length === 0) {
    sendProgress(win, { phase: 'done', total: 0, completed: 0, message: 'No indexable files found' })
    return { indexed: 0, total: 0 }
  }

  const entries = await Promise.all(
    files.map(async (filePath) => ({
      filePath,
      relativePath: relative(rootPath, filePath).replace(/\\/g, '/'),
      hash: await hashFile(filePath)
    }))
  )

  sendProgress(win, {
    phase: 'checking',
    total: entries.length,
    completed: 0,
    message: `Checking ${entries.length} files...`
  })

  const checkResults = await client.checkFiles(
    entries.map((e) => ({ path: e.relativePath, hash: e.hash }))
  )

  const staleOrUnknown = checkResults.filter((r) => r.status !== 'current')
  const toIndex = staleOrUnknown
    .map((r) => entries.find((e) => e.relativePath === r.path)!)
    .filter(Boolean)

  if (toIndex.length === 0) {
    sendProgress(win, {
      phase: 'done',
      total: entries.length,
      completed: entries.length,
      message: 'All files up to date'
    })
    return { indexed: 0, total: entries.length }
  }

  // Send stale/unknown files in batches to /update-files.
  let completed = 0
  for (let i = 0; i < toIndex.length; i += INDEX_BATCH_SIZE) {
    const batch = toIndex.slice(i, i + INDEX_BATCH_SIZE)

    sendProgress(win, {
      phase: 'indexing',
      total: toIndex.length,
      completed,
      message: `Indexing ${completed + 1}–${completed + batch.length} of ${toIndex.length}`
    })

    try {
      const payload = await Promise.all(
        batch.map(async (entry) => ({
          path: entry.relativePath,
          content: await readFileContent(entry.filePath)
        }))
      )
      await client.updateFiles(payload)
    } catch (err) {
      console.error(`Failed to index batch starting at ${batch[0].relativePath}:`, err)
    }

    completed += batch.length
  }

  sendProgress(win, {
    phase: 'done',
    total: toIndex.length,
    completed,
    message: `Indexed ${completed} files`
  })

  return { indexed: completed, total: entries.length }
}

/**
 * Index a single file after save. Converts the absolute path to a
 * project-relative path before sending to RoseLibrary.
 */
export async function indexSingleFile(
  filePath: string,
  content: string,
  rootPath: string
): Promise<void> {
  if (!isIndexableFile(filePath)) return

  setActiveProjectRoot(rootPath)

  try {
    await client.health()
  } catch {
    return // Server not available, skip silently
  }

  const relativePath = relative(rootPath, filePath).replace(/\\/g, '/')

  try {
    await client.updateFiles([{ path: relativePath, content }])
  } catch (err) {
    console.error(`Failed to index ${relativePath}:`, err)
  }
}

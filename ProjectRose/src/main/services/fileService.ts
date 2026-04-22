import { readFile, writeFile, readdir, stat, mkdir, unlink, rm, rename } from 'fs/promises'
import { createHash } from 'crypto'
import { join, basename, extname } from 'path'
import type { FileNode } from '../../shared/types'

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out',
  '.next', '.nuxt', '__pycache__', '.cache', 'coverage', '.vscode',
  '.idea', 'release', 'target'
])

const INDEXABLE_EXTENSIONS = new Set(['.py', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.mts'])

export function isIndexableFile(filePath: string): boolean {
  return INDEXABLE_EXTENSIONS.has(extname(filePath).toLowerCase())
}

export async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

export async function collectIndexableFiles(dirPath: string): Promise<string[]> {
  const results: string[] = []

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 10) return
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue
        if (entry.name.startsWith('.')) continue
        await walk(full, depth + 1)
      } else if (isIndexableFile(full)) {
        results.push(full)
      }
    }
  }

  await walk(dirPath, 0)
  return results
}

export async function readFileContent(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8')
}

export async function writeFileContent(
  filePath: string,
  content: string
): Promise<void> {
  await writeFile(filePath, content, 'utf-8')
}

export async function createFile(filePath: string): Promise<void> {
  await writeFile(filePath, '', 'utf-8')
}

export async function deleteFile(filePath: string): Promise<void> {
  await unlink(filePath)
}

export async function deleteDirectory(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true })
}

export async function renameEntry(oldPath: string, newPath: string): Promise<void> {
  await rename(oldPath, newPath)
}

export async function createDirectory(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

export async function readDirectoryTree(
  dirPath: string,
  depth = 0,
  maxDepth = 10
): Promise<FileNode> {
  const name = basename(dirPath)
  const node: FileNode = { name, path: dirPath, isDirectory: true, children: [] }

  if (depth >= maxDepth) return node

  await mkdir(dirPath, { recursive: true })
  const entries = await readdir(dirPath, { withFileTypes: true })

  const dirs: FileNode[] = []
  const files: FileNode[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.projectrose' && depth === 0 && entry.isDirectory()) continue

    const entryPath = join(dirPath, entry.name)

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      const child = await readDirectoryTree(entryPath, depth + 1, maxDepth)
      dirs.push(child)
    } else {
      files.push({ name: entry.name, path: entryPath, isDirectory: false })
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))
  node.children = [...dirs, ...files]

  return node
}

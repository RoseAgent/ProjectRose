import type { FileNode } from '../../../shared/types'

export function flattenTree(node: FileNode): string[] {
  if (!node.isDirectory) return [node.path]
  const results: string[] = []
  for (const child of node.children ?? []) {
    results.push(...flattenTree(child))
  }
  return results
}

export function fuzzyMatch(path: string, query: string): boolean {
  if (!query) return true
  const lower = path.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++
  }
  return qi === q.length
}

export function getBasename(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() ?? p
}

import { describe, it, expect } from 'vitest'
import { flattenTree, fuzzyMatch, getBasename } from '../treeUtils'
import type { FileNode } from '../../../../shared/types'

describe('flattenTree', () => {
  it('returns path for a single file node', () => {
    const node: FileNode = { name: 'index.ts', path: '/proj/index.ts', isDirectory: false }
    expect(flattenTree(node)).toEqual(['/proj/index.ts'])
  })

  it('returns all file paths from a flat directory', () => {
    const node: FileNode = {
      name: 'src',
      path: '/proj/src',
      isDirectory: true,
      children: [
        { name: 'a.ts', path: '/proj/src/a.ts', isDirectory: false },
        { name: 'b.ts', path: '/proj/src/b.ts', isDirectory: false },
      ]
    }
    expect(flattenTree(node)).toEqual(['/proj/src/a.ts', '/proj/src/b.ts'])
  })

  it('flattens nested directories recursively', () => {
    const node: FileNode = {
      name: 'root',
      path: '/root',
      isDirectory: true,
      children: [
        {
          name: 'sub',
          path: '/root/sub',
          isDirectory: true,
          children: [
            { name: 'deep.ts', path: '/root/sub/deep.ts', isDirectory: false }
          ]
        },
        { name: 'top.ts', path: '/root/top.ts', isDirectory: false }
      ]
    }
    expect(flattenTree(node)).toEqual(['/root/sub/deep.ts', '/root/top.ts'])
  })

  it('returns empty array for an empty directory', () => {
    const node: FileNode = { name: 'empty', path: '/empty', isDirectory: true, children: [] }
    expect(flattenTree(node)).toEqual([])
  })

  it('returns empty array for directory with no children key', () => {
    const node: FileNode = { name: 'empty', path: '/empty', isDirectory: true }
    expect(flattenTree(node)).toEqual([])
  })
})

describe('fuzzyMatch', () => {
  it('always matches when query is empty', () => {
    expect(fuzzyMatch('/some/path.ts', '')).toBe(true)
  })

  it('matches when all query characters appear in order', () => {
    expect(fuzzyMatch('/src/App.tsx', 'App')).toBe(true)
  })

  it('matches non-contiguous subsequence', () => {
    expect(fuzzyMatch('/src/components/Button.tsx', 'But')).toBe(true)
  })

  it('is case insensitive', () => {
    expect(fuzzyMatch('/src/App.tsx', 'app')).toBe(true)
    expect(fuzzyMatch('/src/App.tsx', 'APP')).toBe(true)
  })

  it('returns false when characters are not in order', () => {
    expect(fuzzyMatch('/src/ab.ts', 'ba')).toBe(false)
  })

  it('returns false when query character is absent', () => {
    expect(fuzzyMatch('/src/App.tsx', 'z')).toBe(false)
  })

  it('matches full path including directories', () => {
    expect(fuzzyMatch('/src/components/Button.tsx', 'srcBtn')).toBe(true)
  })
})

describe('getBasename', () => {
  it('returns the filename from a unix path', () => {
    expect(getBasename('/src/components/App.tsx')).toBe('App.tsx')
  })

  it('returns the filename from a windows path', () => {
    expect(getBasename('C:\\src\\App.tsx')).toBe('App.tsx')
  })

  it('returns the input when there is no separator', () => {
    expect(getBasename('App.tsx')).toBe('App.tsx')
  })

  it('handles mixed separators', () => {
    expect(getBasename('C:\\src/components\\App.tsx')).toBe('App.tsx')
  })
})

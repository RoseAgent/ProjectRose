import { describe, it, expect } from 'vitest'
import { joinPath } from '../pathUtils'

describe('joinPath', () => {
  it('joins two segments with a forward slash', () => {
    expect(joinPath('/foo/bar', 'baz.ts')).toBe('/foo/bar/baz.ts')
  })

  it('strips a trailing forward slash before joining', () => {
    expect(joinPath('/foo/bar/', 'baz.ts')).toBe('/foo/bar/baz.ts')
  })

  it('strips a trailing backslash before joining', () => {
    expect(joinPath('/foo/bar\\', 'baz.ts')).toBe('/foo/bar/baz.ts')
  })

  it('handles windows-style root paths', () => {
    expect(joinPath('C:\\Users\\foo', 'bar.ts')).toBe('C:\\Users\\foo/bar.ts')
  })

  it('appends a directory name to a path', () => {
    expect(joinPath('/project/.projectrose', 'memory')).toBe('/project/.projectrose/memory')
  })
})

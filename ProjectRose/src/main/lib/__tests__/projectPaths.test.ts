import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { prPath, PR_DIR } from '../projectPaths'

describe('PR_DIR', () => {
  it('is the hidden .projectrose directory name', () => {
    expect(PR_DIR).toBe('.projectrose')
  })
})

describe('prPath', () => {
  it('joins rootPath with the .projectrose directory', () => {
    const result = prPath('/my/project')
    expect(result).toBe(join('/my/project', '.projectrose'))
  })

  it('appends additional path segments after .projectrose', () => {
    const result = prPath('/my/project', 'memory', 'people')
    expect(result).toBe(join('/my/project', '.projectrose', 'memory', 'people'))
  })

  it('handles a single extra segment', () => {
    const result = prPath('/project', 'tools')
    expect(result).toBe(join('/project', '.projectrose', 'tools'))
  })

  it('constructs paths for all scaffold directories consistently', () => {
    const dirs = ['memory/people', 'memory/places', 'memory/things', 'heartbeat/notes', 'heartbeat/tasks', 'heartbeat/logs', 'tools']
    for (const dir of dirs) {
      const segments = dir.split('/')
      const result = prPath('/root', ...segments)
      expect(result).toContain('.projectrose')
      expect(result).toContain(segments[segments.length - 1])
    }
  })
})

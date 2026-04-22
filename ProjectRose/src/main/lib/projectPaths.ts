import { join } from 'path'

export const PR_DIR = '.projectrose'

export function prPath(rootPath: string, ...segments: string[]): string {
  return join(rootPath, PR_DIR, ...segments)
}

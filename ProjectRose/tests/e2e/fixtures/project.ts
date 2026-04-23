import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const SCAFFOLD_SUBDIRS = [
  join('.projectrose', 'memory', 'wing_people', 'room_general'),
  join('.projectrose', 'heartbeat', 'tasks'),
  join('.projectrose', 'heartbeat', 'logs'),
  join('.projectrose', 'tools'),
]

export function createSeedProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rose-e2e-'))
  mkdirSync(join(dir, '.projectrose'), { recursive: true })
  writeFileSync(join(dir, '.projectrose', 'ROSE.md'), '# TestAgent\n')
  for (const sub of SCAFFOLD_SUBDIRS) {
    const subPath = join(dir, sub)
    mkdirSync(subPath, { recursive: true })
    writeFileSync(join(subPath, '.gitkeep'), '')
  }
  return dir
}

export function createEmptyProject(): string {
  return mkdtempSync(join(tmpdir(), 'rose-e2e-empty-'))
}

export async function openProject(
  app: ElectronApplication,
  win: Page,
  dir: string
): Promise<void> {
  await app.evaluate(({ dialog }, projectDir) => {
    const d = dialog as unknown as { showOpenDialog: unknown }
    d.showOpenDialog = (): Promise<{ canceled: boolean; filePaths: string[] }> =>
      Promise.resolve({ canceled: false, filePaths: [projectDir] })
  }, dir)

  await win.getByRole('button', { name: 'Open Project' }).click()
  await win.locator('button', { hasText: 'AGENT' }).waitFor({ state: 'visible', timeout: 15000 })
}

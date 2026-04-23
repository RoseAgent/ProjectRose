import { test as base, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { join } from 'path'

type ElectronFixtures = {
  app: ElectronApplication
  win: Page
}

export const test = base.extend<ElectronFixtures>({
  app: async ({}, use) => {
    const app = await electron.launch({
      args: [join(process.cwd(), 'out/main/index.js')],
    })
    await use(app)
    await app.close()
  },
  win: async ({ app }, use) => {
    const win = await app.firstWindow()
    await win.waitForLoadState('domcontentloaded')
    await use(win)
  },
})

export { expect } from '@playwright/test'

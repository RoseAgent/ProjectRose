import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { join } from 'path'

let app: ElectronApplication
let win: Page

test.beforeAll(async () => {
  app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js')],
  })
  win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app.close()
})

test('app launches and renders a window', async () => {
  expect(win).toBeTruthy()
  await expect(win.locator('body')).toBeVisible()
})

test('window has a non-empty title', async () => {
  const title = await win.title()
  expect(title.length).toBeGreaterThan(0)
})

test('displays welcome view when no project is open', async () => {
  // The welcome screen should render with open project options
  await expect(win.getByRole('button', { name: 'Open Project' })).toBeVisible({ timeout: 5000 })

})

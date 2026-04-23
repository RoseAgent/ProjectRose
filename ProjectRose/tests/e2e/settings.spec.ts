import { test, expect } from './fixtures/electron'
import { createSeedProject, openProject } from './fixtures/project'
import { screenshot } from './fixtures/screenshot'

test.describe('Settings View', () => {
  test.beforeEach(async ({ app, win }) => {
    const dir = createSeedProject()
    await openProject(app, win, dir)
    await win.locator('button', { hasText: 'SETTINGS' }).click()
    await expect(win.getByText('Navigation Bar')).toBeVisible({ timeout: 5000 })
  })

  test('settings sidebar label is visible', async ({ win }) => {
    await expect(win.getByRole('complementary').getByText('Settings', { exact: true })).toBeVisible()
  })

  test('dashboard is the default active page', async ({ win }) => {
    await expect(win.getByText('Navigation Bar')).toBeVisible()
    await screenshot(win, 'settings--dashboard')
  })

  test('sidebar contains Dashboard, Agent, Heartbeat, Extensions', async ({ win }) => {
    await expect(win.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible()
    await expect(win.getByRole('button', { name: 'Agent', exact: true })).toBeVisible()
    await expect(win.getByRole('button', { name: 'Heartbeat', exact: true })).toBeVisible()
    await expect(win.getByRole('button', { name: 'Extensions', exact: true })).toBeVisible()
  })

  test('dashboard shows Navigation Bar section', async ({ win }) => {
    await expect(win.getByText('Navigation Bar')).toBeVisible()
  })

  test('navigate to Extensions tab', async ({ win }) => {
    await win.getByRole('button', { name: 'Extensions', exact: true }).click()
    await win.waitForTimeout(300)
    await screenshot(win, 'settings--extensions')
  })

  test('navigate to Heartbeat settings tab', async ({ win }) => {
    await win.getByRole('button', { name: 'Heartbeat', exact: true }).click()
    await expect(win.getByText('Enable Heartbeat')).toBeVisible({ timeout: 5000 })
    await screenshot(win, 'settings--heartbeat')
  })

  test('navigate to Agent settings tab', async ({ win }) => {
    await win.getByRole('button', { name: 'Agent', exact: true }).click()
    await win.waitForTimeout(300)
    await screenshot(win, 'settings--agent')
  })
})

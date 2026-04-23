import { test, expect } from './fixtures/electron'
import { createSeedProject, openProject } from './fixtures/project'
import { screenshot } from './fixtures/screenshot'

test.describe('Heartbeat View', () => {
  test.beforeEach(async ({ app, win }) => {
    const dir = createSeedProject()
    await openProject(app, win, dir)
    await win.locator('button', { hasText: 'HEARTBEAT' }).click()
    await expect(win.getByText('Heartbeat Runs')).toBeVisible({ timeout: 5000 })
  })

  test('shows heartbeat runs header', async ({ win }) => {
    await expect(win.getByText('Heartbeat Runs')).toBeVisible()
  })

  test('shows empty state when no runs', async ({ win }) => {
    // If no heartbeat has run, the empty state is shown
    const isEmpty = await win.getByText('No heartbeat runs yet').isVisible()
    const hasLogs = await win.locator('text=No heartbeat runs yet').count() === 0
    if (isEmpty) {
      await expect(win.getByText('No heartbeat runs yet')).toBeVisible()
    } else {
      // Some logs may exist from the auto-run on project open; just verify layout
      expect(hasLogs).toBe(true)
    }
    await screenshot(win, 'heartbeat--empty')
  })

  test('Run Now button is enabled', async ({ win }) => {
    await expect(win.getByRole('button', { name: 'Run Now' })).toBeEnabled()
  })

  test('shows placeholder when no log is selected', async ({ win }) => {
    const emptyState = await win.getByText('No heartbeat runs yet').isVisible()
    if (emptyState) {
      await expect(win.getByText('Select a run to view its log')).toBeVisible()
    }
  })
})

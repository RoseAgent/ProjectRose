import { test, expect } from './fixtures/electron'
import { screenshot } from './fixtures/screenshot'

test.describe('Welcome View', () => {
  test('renders title and subtitle', async ({ win }) => {
    await expect(win.getByText('ProjectRose')).toBeVisible({ timeout: 5000 })
    await expect(win.getByText('A code editor for local AI')).toBeVisible()
    await screenshot(win, 'welcome--dark')
  })

  test('shows Open Project button', async ({ win }) => {
    await expect(win.getByRole('button', { name: 'Open Project' })).toBeVisible()
  })

  test('shows Recent Projects section', async ({ win }) => {
    await expect(win.getByText('Recent Projects', { exact: true })).toBeVisible()
  })

  test('theme toggle changes data-theme attribute', async ({ win }) => {
    const themeBtn = win.getByTitle('Toggle theme')
    await expect(themeBtn).toBeVisible()

    const before = await win.evaluate(() => document.documentElement.getAttribute('data-theme'))
    await themeBtn.click()
    const after = await win.evaluate(() => document.documentElement.getAttribute('data-theme'))
    expect(after).not.toBe(before)

    await screenshot(win, 'welcome--herbarium')

    // Restore original theme
    await themeBtn.click()
  })

  test('Learn modal opens and shows content', async ({ win }) => {
    await win.getByRole('button', { name: 'Learn About Project Rose' }).click()
    await expect(win.getByText('About Project Rose', { exact: true })).toBeVisible()
    await screenshot(win, 'welcome--learn-modal')
  })

  test('Learn modal closes on X click', async ({ win }) => {
    await win.getByRole('button', { name: 'Learn About Project Rose' }).click()
    await expect(win.getByText('About Project Rose', { exact: true })).toBeVisible()
    await win.getByRole('button', { name: '×' }).first().click()
    await expect(win.getByText('About Project Rose', { exact: true })).not.toBeVisible()
  })
})

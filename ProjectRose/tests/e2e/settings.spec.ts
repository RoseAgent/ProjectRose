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

  // ── Sidebar ──────────────────────────────────────────────────

  test('settings sidebar label is visible', async ({ win }) => {
    // Sidebar label is now "Settings · Drawer"
    await expect(win.getByRole('complementary').getByText('Settings', { exact: false })).toBeVisible()
  })

  test('dashboard is the default active page', async ({ win }) => {
    await expect(win.getByText('Navigation Bar')).toBeVisible()
    await screenshot(win, 'settings--dashboard')
  })

  test('sidebar contains Dashboard, Agent, Extensions items', async ({ win }) => {
    // Sidebar items now include a number prefix (e.g. "№01 Dashboard")
    await expect(win.getByRole('button', { name: /Dashboard/ })).toBeVisible()
    await expect(win.getByRole('button', { name: /Agent/ })).toBeVisible()
    await expect(win.getByRole('button', { name: /Extensions/ })).toBeVisible()
  })

  test('sidebar items show specimen numbers', async ({ win }) => {
    const sidebar = win.getByRole('complementary')
    await expect(sidebar.getByText(/№01/)).toBeVisible()
    await expect(sidebar.getByText(/№02/)).toBeVisible()
  })

  test('dashboard shows Navigation Bar section', async ({ win }) => {
    await expect(win.getByText('Navigation Bar')).toBeVisible()
  })

  test('navigate to Extensions tab', async ({ win }) => {
    await win.getByRole('button', { name: /Extensions/ }).click()
    await win.waitForTimeout(300)
    await screenshot(win, 'settings--extensions')
  })

  test('navigate to Agent settings tab', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await win.waitForTimeout(300)
    await screenshot(win, 'settings--agent')
  })

  // ── Status bar ───────────────────────────────────────────────

  test('status bar is visible with save indicator', async ({ win }) => {
    await expect(win.getByText('all changes saved')).toBeVisible()
  })

  test('status bar shows model count', async ({ win }) => {
    await expect(win.getByText(/model.* cataloged/)).toBeVisible()
  })

  // ── Agent page: page header ──────────────────────────────────

  test('agent page shows specimen drawer header', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await expect(win.getByText('specimen drawer')).toBeVisible({ timeout: 3000 })
    await expect(win.getByText(/PROJECTROSE · SETTINGS · AGENT/)).toBeVisible()
  })

  // ── Agent page: PLATE I · Providers ─────────────────────────

  test('agent page shows PLATE I Providers section', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await expect(win.getByText('PLATE I', { exact: true })).toBeVisible({ timeout: 3000 })
    await expect(win.getByText('Providers', { exact: true })).toBeVisible()
  })

  test('all five provider cards are visible', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await expect(win.getByText('Anthropic', { exact: true })).toBeVisible({ timeout: 3000 })
    await expect(win.getByText('OpenAI', { exact: true })).toBeVisible()
    await expect(win.getByText('Amazon Bedrock', { exact: true })).toBeVisible()
    await expect(win.getByText('Ollama', { exact: true })).toBeVisible()
    await expect(win.getByText('OpenAI-compatible', { exact: true })).toBeVisible()
  })

  test('provider cards show botanical Latin names', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await expect(win.getByText('Rosa claudia')).toBeVisible({ timeout: 3000 })
    await expect(win.getByText('Rosa generativa')).toBeVisible()
    await expect(win.getByText('Rosa localis')).toBeVisible()
  })

  test('expanding a provider card shows its fields', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    // Click the Anthropic card header button to expand it
    await win.locator('button[class*="providerCardHeader"]').nth(0).click()
    await expect(win.getByText('API KEY', { exact: true })).toBeVisible({ timeout: 3000 })
    await expect(win.getByRole('button', { name: 'VERIFY & SAVE' })).toBeVisible()
    await expect(win.getByRole('button', { name: 'CLEAR' })).toBeVisible()
    await screenshot(win, 'settings--agent-provider-expanded')
  })

  test('only one provider card can be open at a time', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    // Target only the <button> elements — [class*="providerCardHeader"] would also match
    // the inner div (providerCardHeaderInner) causing wrong elements to be clicked
    const cards = win.locator('button[class*="providerCardHeader"]')
    // Open Anthropic card
    await cards.nth(0).click()
    await expect(win.getByText('API KEY', { exact: true })).toBeVisible({ timeout: 3000 })
    // Open OpenAI card — Anthropic should close
    await cards.nth(1).click()
    await expect(win.getByText('VERIFY & SAVE')).toBeVisible({ timeout: 3000 })
    // Only one set of fields should be visible
    await expect(win.locator('[class*="providerCardBody"]')).toHaveCount(1, { timeout: 3000 })
  })

  // ── Agent page: PLATE II · Router ────────────────────────────

  test('agent page shows PLATE II Router section', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await expect(win.getByText('PLATE II', { exact: true })).toBeVisible({ timeout: 3000 })
    await expect(win.getByText('Router', { exact: true })).toBeVisible()
  })

  test('router fields hidden when disabled', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await expect(win.getByText('PLATE II', { exact: true })).toBeVisible({ timeout: 3000 })
    // Base URL and Router Model fields should not be visible when router is off
    await expect(win.getByText('OLLAMA BASE URL', { exact: true })).not.toBeVisible()
  })

  test('router fields appear when enabled', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    // Find the Enable Router toggle
    const routerRow = win.locator('[class*="hSettingRow"]').filter({ hasText: 'Enable Router' })
    await routerRow.locator('button[role="switch"]').click()
    await expect(win.getByText('OLLAMA BASE URL', { exact: true })).toBeVisible({ timeout: 3000 })
    await expect(win.getByText('ROUTER MODEL', { exact: true })).toBeVisible()
  })

  // ── Agent page: PLATE III · Models ───────────────────────────

  test('agent page shows PLATE III Models section', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await expect(win.getByText('PLATE III', { exact: true })).toBeVisible({ timeout: 3000 })
    await expect(win.getByText('Models', { exact: true })).toBeVisible()
  })

  test('models table has correct column headers', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await expect(win.getByText('DISPLAY NAME / MODEL', { exact: true })).toBeVisible({ timeout: 3000 })
    await expect(win.getByText('PROVIDER', { exact: true })).toBeVisible()
    await expect(win.getByText('USE-CASE TAGS', { exact: true })).toBeVisible()
  })

  test('add model button is present', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await expect(win.getByRole('button', { name: /ADD MODEL TO CATALOG/ })).toBeVisible({ timeout: 3000 })
  })

  test('adding a model adds a row to the table', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await win.getByRole('button', { name: /ADD MODEL TO CATALOG/ }).click()
    // A new model row should appear with a display name input
    await expect(win.locator('[class*="modelRow"]')).toBeVisible({ timeout: 3000 })
    await screenshot(win, 'settings--agent-model-added')
  })

  // ── Agent page: PLATE IV · Behavior & Tools ──────────────────

  test('agent page shows PLATE IV Behavior and Tools section', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await expect(win.getByText('PLATE IV', { exact: true })).toBeVisible({ timeout: 3000 })
    await expect(win.getByText('Behavior & Tools', { exact: true })).toBeVisible()
  })

  test('behavior panel has expected toggles', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await expect(win.getByText('BEHAVIOR · CONTEXT')).toBeVisible({ timeout: 3000 })
    await expect(win.getByText('Include thinking in context')).toBeVisible()
    await expect(win.getByText('Auto-summarize at 80% context')).toBeVisible()
    await expect(win.getByText('Stream tool results inline')).toBeVisible()
  })

  test('tools panel is visible', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    await expect(win.getByText('TOOLS · CORE')).toBeVisible({ timeout: 3000 })
  })

  test('agent page colophon is visible', async ({ win }) => {
    await win.getByRole('button', { name: /^№\d+\s+Agent$/ }).click()
    // Scope to the colophon block (contains 'COLOPHON') to avoid matching header/status bar
    await expect(
      win.locator('[class*="colophon"]').filter({ hasText: 'COLOPHON' })
    ).toContainText('Rosa configurata', { timeout: 3000 })
  })
})

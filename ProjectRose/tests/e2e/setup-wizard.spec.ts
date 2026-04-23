import { test, expect } from './fixtures/electron'
import { createEmptyProject, openProject } from './fixtures/project'
import { screenshot } from './fixtures/screenshot'

test.describe('Setup Wizard', () => {
  test('step 1 renders on first project open', async ({ app, win }) => {
    const dir = createEmptyProject()
    await openProject(app, win, dir)

    await expect(win.getByText('Welcome to ProjectRose')).toBeVisible({ timeout: 10000 })
    await expect(win.getByText('What is your name?')).toBeVisible()
    await expect(win.getByPlaceholder('e.g. Andrew')).toBeVisible()
    await screenshot(win, 'setup-wizard--step1')
  })

  test('step 1 validation: empty name shows error', async ({ app, win }) => {
    const dir = createEmptyProject()
    await openProject(app, win, dir)

    await expect(win.getByPlaceholder('e.g. Andrew')).toBeVisible({ timeout: 10000 })
    await win.getByRole('button', { name: 'Next' }).click()
    await expect(win.getByText('Please enter your name.')).toBeVisible()
  })

  test('step 1 to step 2 transition', async ({ app, win }) => {
    const dir = createEmptyProject()
    await openProject(app, win, dir)

    await win.getByPlaceholder('e.g. Andrew').fill('TestUser', { timeout: 10000 })
    await win.getByRole('button', { name: 'Next' }).click()

    await expect(win.getByText('Initialize AI Agent')).toBeVisible({ timeout: 5000 })
    await expect(win.getByPlaceholder('e.g. Rose')).toBeVisible()
    await screenshot(win, 'setup-wizard--step2')
  })

  test('step 2 shows all configuration fields', async ({ app, win }) => {
    const dir = createEmptyProject()
    await openProject(app, win, dir)

    await win.getByPlaceholder('e.g. Andrew').fill('TestUser', { timeout: 10000 })
    await win.getByRole('button', { name: 'Next' }).click()

    await expect(win.getByText('Autonomy Level')).toBeVisible()
    await expect(win.getByText('Communication Style')).toBeVisible()
    await expect(win.getByText('Technical Depth')).toBeVisible()
    await expect(win.getByText('Proactivity')).toBeVisible()
    await expect(win.getByRole('button', { name: /Initialize Project/ })).toBeVisible()
  })

  test('step 2 validation: empty agent name shows error', async ({ app, win }) => {
    const dir = createEmptyProject()
    await openProject(app, win, dir)

    await win.getByPlaceholder('e.g. Andrew').fill('TestUser', { timeout: 10000 })
    await win.getByRole('button', { name: 'Next' }).click()
    await win.getByRole('button', { name: /Initialize Project/ }).click()
    await expect(win.getByText('Please give your AI a name.')).toBeVisible()
  })
})

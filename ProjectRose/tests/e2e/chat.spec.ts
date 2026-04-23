import { test, expect } from './fixtures/electron'
import { createSeedProject, openProject } from './fixtures/project'
import { screenshot } from './fixtures/screenshot'

test.describe('Chat View', () => {
  test.beforeEach(async ({ app, win }) => {
    const dir = createSeedProject()
    await openProject(app, win, dir)
    // Default view after project open is chat
  })

  test('session sidebar renders with new session button', async ({ win }) => {
    await expect(win.getByRole('button', { name: '+ New Session' })).toBeVisible()
    await screenshot(win, 'chat--empty')
  })

  test('shows no sessions empty state', async ({ win }) => {
    await expect(win.getByText('No sessions yet')).toBeVisible()
  })

  test('search input is present', async ({ win }) => {
    await expect(win.getByPlaceholder('Search sessions...')).toBeVisible()
  })

  test('chat input textarea is present', async ({ win }) => {
    await expect(
      win.getByPlaceholder('Type a message... (Enter to send, Shift+Enter for newline)')
    ).toBeVisible()
  })

  test('send button is disabled when input is empty', async ({ win }) => {
    const sendBtn = win.getByRole('button', { name: 'Send' })
    await expect(sendBtn).toBeDisabled()
  })

  test('send button becomes enabled when input has text', async ({ win }) => {
    const textarea = win.getByPlaceholder('Type a message... (Enter to send, Shift+Enter for newline)')
    await textarea.fill('Hello')
    const sendBtn = win.getByRole('button', { name: 'Send' })
    await expect(sendBtn).toBeEnabled()
  })

  test('new session button is clickable and resets chat panel', async ({ win }) => {
    await win.getByRole('button', { name: '+ New Session' }).click()
    // After clicking, the chat input is still available and panel shows empty state
    await expect(
      win.getByPlaceholder('Type a message... (Enter to send, Shift+Enter for newline)')
    ).toBeVisible()
  })

  test('chat panel shows empty conversation prompt', async ({ win }) => {
    await expect(win.getByText('Start a conversation with the AI assistant')).toBeVisible()
  })
})

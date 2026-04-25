import { test, expect } from './fixtures/electron'
import { createSeedProject, openProject } from './fixtures/project'
import { screenshot } from './fixtures/screenshot'
import { mkdtempSync, mkdirSync, writeFileSync, createWriteStream } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Build a minimal .zip extension package for testing.
// The manifest declares globalSettings + pageView; the renderer.js exports stubs.
async function buildFakeExtension(id: string, name: string): Promise<string> {
  const extDir = mkdtempSync(join(tmpdir(), `rose-ext-${id}-`))

  const manifest = {
    id,
    name,
    version: '0.1.0',
    description: `Test extension: ${name}`,
    author: 'Test',
    navItem: { label: name, iconName: 'test' },
    provides: { pageView: true, globalSettings: true, main: false }
  }
  writeFileSync(join(extDir, 'rose-extension.json'), JSON.stringify(manifest))

  // Minimal CJS renderer bundle that exports PageView and SettingsView
  const rendererCode = `
"use strict";
const React = require('react');
function PageView() { return React.createElement('div', null, '${name} Page'); }
function SettingsView() { return React.createElement('div', { 'data-testid': '${id}-settings' }, '${name} Settings Panel'); }
exports.PageView = PageView;
exports.SettingsView = SettingsView;
`
  writeFileSync(join(extDir, 'renderer.js'), rendererCode)

  // Build the zip using the platform command
  const zipPath = join(tmpdir(), `${id}-test.zip`)
  const { spawnSync } = await import('child_process')
  if (process.platform === 'win32') {
    const ps = `Compress-Archive -Path '${extDir}\\*' -DestinationPath '${zipPath}' -Force`
    spawnSync('powershell', ['-NoProfile', '-Command', ps])
  } else {
    spawnSync('zip', ['-j', zipPath, join(extDir, 'rose-extension.json'), join(extDir, 'renderer.js')], { cwd: extDir })
  }
  return zipPath
}

test.describe('Extension System', () => {
  test.describe('install and lifecycle', () => {
    test('extensions tab shows install button when project is open', async ({ app, win }) => {
      const dir = createSeedProject()
      await openProject(app, win, dir)
      await win.locator('button', { hasText: 'SETTINGS' }).click()
      await win.getByRole('button', { name: 'Extensions', exact: true }).click()
      await expect(win.getByText('INSTALL FROM DISK')).toBeVisible({ timeout: 5000 })
      await screenshot(win, 'extensions--empty')
    })

    test('installing an extension adds it to the list', async ({ app, win }) => {
      const dir = createSeedProject()
      await openProject(app, win, dir)
      const zipPath = await buildFakeExtension('rose-test-ext', 'Test Extension')

      // Mock the file dialog to return our zip
      await app.evaluate(({ dialog }, zip) => {
        const d = dialog as unknown as { showOpenDialog: unknown }
        d.showOpenDialog = (): Promise<{ canceled: boolean; filePaths: string[] }> =>
          Promise.resolve({ canceled: false, filePaths: [zip] })
      }, zipPath)

      await win.locator('button', { hasText: 'SETTINGS' }).click()
      await win.getByRole('button', { name: 'Extensions', exact: true }).click()
      await win.getByText('INSTALL FROM DISK').click()
      await win.waitForTimeout(1500)

      await expect(win.getByText('Test Extension')).toBeVisible({ timeout: 5000 })
      await screenshot(win, 'extensions--installed')
    })

    test('installed extension appears in nav bar', async ({ app, win }) => {
      const dir = createSeedProject()
      await openProject(app, win, dir)
      const zipPath = await buildFakeExtension('rose-navtest', 'Nav Test')

      await app.evaluate(({ dialog }, zip) => {
        const d = dialog as unknown as { showOpenDialog: unknown }
        d.showOpenDialog = (): Promise<{ canceled: boolean; filePaths: string[] }> =>
          Promise.resolve({ canceled: false, filePaths: [zip] })
      }, zipPath)

      await win.locator('button', { hasText: 'SETTINGS' }).click()
      await win.getByRole('button', { name: 'Extensions', exact: true }).click()
      await win.getByText('INSTALL FROM DISK').click()
      await win.waitForTimeout(2000)

      // The extension's nav label should appear as a nav button
      await expect(win.locator('button', { hasText: 'NAV TEST' })).toBeVisible({ timeout: 5000 })
      await screenshot(win, 'extensions--nav-item')
    })
  })

  test.describe('settings panel', () => {
    test('installed extension with globalSettings appears in settings sidebar', async ({ app, win }) => {
      const dir = createSeedProject()
      await openProject(app, win, dir)
      const zipPath = await buildFakeExtension('rose-settingstest', 'Settings Test')

      await app.evaluate(({ dialog }, zip) => {
        const d = dialog as unknown as { showOpenDialog: unknown }
        d.showOpenDialog = (): Promise<{ canceled: boolean; filePaths: string[] }> =>
          Promise.resolve({ canceled: false, filePaths: [zip] })
      }, zipPath)

      await win.locator('button', { hasText: 'SETTINGS' }).click()
      await win.getByRole('button', { name: 'Extensions', exact: true }).click()
      await win.getByText('INSTALL FROM DISK').click()
      await win.waitForTimeout(2000)

      // Settings sidebar should now include the extension
      await win.locator('button', { hasText: 'SETTINGS' }).click()
      await expect(win.getByRole('button', { name: 'Settings Test', exact: true })).toBeVisible({ timeout: 5000 })
      await screenshot(win, 'extensions--settings-sidebar')
    })

    test('clicking extension settings sidebar item renders SettingsView', async ({ app, win }) => {
      const dir = createSeedProject()
      await openProject(app, win, dir)
      const zipPath = await buildFakeExtension('rose-settingspanel', 'Panel Test')

      await app.evaluate(({ dialog }, zip) => {
        const d = dialog as unknown as { showOpenDialog: unknown }
        d.showOpenDialog = (): Promise<{ canceled: boolean; filePaths: string[] }> =>
          Promise.resolve({ canceled: false, filePaths: [zip] })
      }, zipPath)

      await win.locator('button', { hasText: 'SETTINGS' }).click()
      await win.getByRole('button', { name: 'Extensions', exact: true }).click()
      await win.getByText('INSTALL FROM DISK').click()
      await win.waitForTimeout(2000)

      await win.locator('button', { hasText: 'SETTINGS' }).click()
      await win.getByRole('button', { name: 'Panel Test', exact: true }).click()

      // The extension's SettingsView should render
      await expect(win.locator('[data-testid="rose-settingspanel-settings"]')).toBeVisible({ timeout: 5000 })
      await screenshot(win, 'extensions--settings-panel')
    })
  })

  test.describe('disable / uninstall', () => {
    test('disabling an extension keeps it in list but marks it disabled', async ({ app, win }) => {
      const dir = createSeedProject()
      await openProject(app, win, dir)
      const zipPath = await buildFakeExtension('rose-disabletest', 'Disable Test')

      await app.evaluate(({ dialog }, zip) => {
        const d = dialog as unknown as { showOpenDialog: unknown }
        d.showOpenDialog = (): Promise<{ canceled: boolean; filePaths: string[] }> =>
          Promise.resolve({ canceled: false, filePaths: [zip] })
      }, zipPath)

      await win.locator('button', { hasText: 'SETTINGS' }).click()
      await win.getByRole('button', { name: 'Extensions', exact: true }).click()
      await win.getByText('INSTALL FROM DISK').click()
      await win.waitForTimeout(1500)

      await win.getByRole('button', { name: 'Disable', exact: true }).click()
      await win.waitForTimeout(500)

      // Extension still listed with Enable button
      await expect(win.getByRole('button', { name: 'Enable', exact: true })).toBeVisible({ timeout: 3000 })
      await screenshot(win, 'extensions--disabled')
    })

    test('uninstalling an extension removes it from the list', async ({ app, win }) => {
      const dir = createSeedProject()
      await openProject(app, win, dir)
      const zipPath = await buildFakeExtension('rose-uninstalltest', 'Uninstall Test')

      await app.evaluate(({ dialog }, zip) => {
        const d = dialog as unknown as { showOpenDialog: unknown }
        d.showOpenDialog = (): Promise<{ canceled: boolean; filePaths: string[] }> =>
          Promise.resolve({ canceled: false, filePaths: [zip] })
      }, zipPath)

      await win.locator('button', { hasText: 'SETTINGS' }).click()
      await win.getByRole('button', { name: 'Extensions', exact: true }).click()
      await win.getByText('INSTALL FROM DISK').click()
      await win.waitForTimeout(1500)

      const extRow = win.locator('[class*="section"]').filter({ hasText: 'Uninstall Test' })
      await extRow.getByRole('button', { name: 'Uninstall' }).click()
      await win.waitForTimeout(500)

      await expect(win.getByText('No extensions installed')).toBeVisible({ timeout: 3000 })
      await screenshot(win, 'extensions--uninstalled')
    })
  })

  test.describe('settings sidebar core items always present', () => {
    test('core settings pages are always in sidebar regardless of extensions', async ({ app, win }) => {
      const dir = createSeedProject()
      await openProject(app, win, dir)
      await win.locator('button', { hasText: 'SETTINGS' }).click()
      await expect(win.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 5000 })
      await expect(win.getByRole('button', { name: 'Agent', exact: true })).toBeVisible()
      await expect(win.getByRole('button', { name: 'Heartbeat', exact: true })).toBeVisible()
      await expect(win.getByRole('button', { name: 'Extensions', exact: true })).toBeVisible()
    })
  })
})

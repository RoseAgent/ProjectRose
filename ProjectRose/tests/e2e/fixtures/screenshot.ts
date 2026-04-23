import { join } from 'path'
import { mkdirSync } from 'fs'
import type { Page } from '@playwright/test'

const SCREENSHOTS_DIR = join(process.cwd(), '..', 'screenshots')

export async function screenshot(win: Page, name: string): Promise<void> {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true })
  await win.screenshot({ path: join(SCREENSHOTS_DIR, `${name}.png`) })
}

// spec: Quick Open (Ctrl+P) fuzzy file finder
// seed: tests/open-folder.spec.ts

import { test as base, expect } from './fixtures'
import { _electron as electron, ElectronApplication } from 'playwright'
import path from 'path'
import os from 'os'
import fs from 'fs'

// Share ONE ElectronApplication instance between electronApp and page
// (same pattern as open-folder.spec.ts so we can drive native-menu IPC).
const test = base.extend<{ electronApp: ElectronApplication }>({
  electronApp: async ({}, use) => {
    const app = await electron.launch({
      args: [path.resolve(__dirname, '../out/main/index.js')],
      env: { ...process.env, E2E_TEST: '1', NODE_ENV: 'test' },
      timeout: 15_000,
    })
    await use(app)
    await app.close()
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForSelector('[data-testid="app"]', { timeout: 10_000 })
    // E2E mode skips session restore, so seed an untitled buffer to leave the
    // WelcomeScreen (same as the base fixture's seedInitialBuffer).
    await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.webContents.send('menu:file-new')
    })
    await page.waitForSelector('.monaco-editor textarea', { timeout: 10_000 })
    await page.waitForSelector('[data-testid="tabbar"] [data-tab-title]', { timeout: 5_000 })
    await use(page)
  },
})

// IPC helper — fires the channel the native "Go to File…" (Ctrl+P) menu item sends.
async function sendIPC(electronApp: ElectronApplication, channel: string, ...args: unknown[]) {
  await electronApp.evaluate(
    ({ BrowserWindow }, { ch, a }) =>
      BrowserWindow.getAllWindows()[0].webContents.send(ch, ...(a as unknown[])),
    { ch: channel, a: args }
  )
}

test.describe('Quick Open (Ctrl+P)', () => {
  test('opens the palette via menu:goto-file and focuses the input', async ({ electronApp, page }) => {
    await sendIPC(electronApp, 'menu:goto-file')

    const palette = page.locator('[data-testid="quick-open"]')
    await expect(palette).toBeVisible({ timeout: 3_000 })
    await expect(page.locator('[data-testid="quick-open-input"]')).toBeFocused()
  })

  test('with no folder open, shows the "open a folder" hint', async ({ electronApp, page }) => {
    await sendIPC(electronApp, 'menu:goto-file')
    await expect(page.locator('[data-testid="quick-open"]')).toBeVisible({ timeout: 3_000 })
    await expect(page.getByText('No folder is open.')).toBeVisible()
    await expect(page.locator('[data-testid="quick-open-result"]')).toHaveCount(0)
  })

  test('Escape closes the palette', async ({ electronApp, page }) => {
    await sendIPC(electronApp, 'menu:goto-file')
    const palette = page.locator('[data-testid="quick-open"]')
    await expect(palette).toBeVisible({ timeout: 3_000 })

    await page.locator('[data-testid="quick-open-input"]').press('Escape')
    await expect(palette).not.toBeVisible()
  })

  test('fuzzy-filters files in the open folder and opens the chosen one with Enter', async ({ electronApp, page }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-quickopen-'))
    fs.writeFileSync(path.join(tmpDir, 'alpha.txt'), 'a')
    fs.writeFileSync(path.join(tmpDir, 'beta.md'), 'b')
    fs.mkdirSync(path.join(tmpDir, 'nested'))
    fs.writeFileSync(path.join(tmpDir, 'nested', 'config-loader.ts'), 'c')

    try {
      // Set the workspace folder, then open the palette.
      await sendIPC(electronApp, 'menu:folder-open', tmpDir)
      await page.waitForTimeout(300)
      await sendIPC(electronApp, 'menu:goto-file')

      const input = page.locator('[data-testid="quick-open-input"]')
      await expect(input).toBeVisible({ timeout: 3_000 })

      // Empty query lists files (recursive — includes the nested file).
      await expect(page.locator('[data-testid="quick-open-result"]')).not.toHaveCount(0, { timeout: 3_000 })

      // Fuzzy subsequence "cl" should surface config-loader.ts (nested) as a match.
      await input.fill('cl')
      const results = page.locator('[data-testid="quick-open-result"]')
      await expect(results.first()).toContainText('config-loader.ts', { timeout: 3_000 })

      // Enter opens the top result as a tab and closes the palette.
      await input.press('Enter')
      await page.locator('[data-tab-title="config-loader.ts"]').waitFor({ state: 'visible', timeout: 5_000 })
      await expect(page.locator('[data-testid="quick-open"]')).not.toBeVisible()
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('clicking a result opens it', async ({ electronApp, page }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-quickopen-click-'))
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'hi')

    try {
      await sendIPC(electronApp, 'menu:folder-open', tmpDir)
      await page.waitForTimeout(300)
      await sendIPC(electronApp, 'menu:goto-file')

      const input = page.locator('[data-testid="quick-open-input"]')
      await expect(input).toBeVisible({ timeout: 3_000 })
      await input.fill('readme')

      const row = page.locator('[data-testid="quick-open-result"]').filter({ hasText: 'readme.txt' }).first()
      await expect(row).toBeVisible({ timeout: 3_000 })
      await row.click()

      await page.locator('[data-tab-title="readme.txt"]').waitFor({ state: 'visible', timeout: 5_000 })
      await expect(page.locator('[data-testid="quick-open"]')).not.toBeVisible()
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

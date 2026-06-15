// spec: File Browser right-click context menu item ORDER
// seed: tests/open-folder.spec.ts (Group E)

import { test as base, expect } from './fixtures'
import { _electron as electron, ElectronApplication } from 'playwright'
import path from 'path'
import os from 'os'
import fs from 'fs'

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

async function sendIPC(electronApp: ElectronApplication, channel: string, ...args: unknown[]) {
  await electronApp.evaluate(
    ({ BrowserWindow }, { ch, a }) =>
      BrowserWindow.getAllWindows()[0].webContents.send(ch, ...(a as unknown[])),
    { ch: channel, a: args }
  )
}

test.describe('File tree context menu order', () => {
  test('file menu order is Open / Rename / Copy Path / Reveal / New File / New Folder / Delete', async ({ electronApp, page }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-ctxorder-'))
    fs.writeFileSync(path.join(tmpDir, 'target.txt'), 'x')

    try {
      await sendIPC(electronApp, 'ui:toggle-sidebar', true)
      await page.locator('[data-testid="sidebar"]').waitFor({ state: 'visible', timeout: 3_000 })
      await sendIPC(electronApp, 'menu:folder-open', tmpDir)

      const sidebar = page.locator('[data-testid="sidebar"]')
      await expect(sidebar.getByText('target.txt')).toBeVisible({ timeout: 3_000 })

      await sidebar.getByText('target.txt').click({ button: 'right' })
      // Radix renders ContextMenuItem with role="menuitem" in a portal on <body>.
      await expect(page.locator('[role="menuitem"]').first()).toBeVisible({ timeout: 2_000 })

      const labels = (await page.locator('[role="menuitem"]').allTextContents()).map((s) => s.trim())
      const idx = (substr: string) => labels.findIndex((l) => l.includes(substr))

      // All expected items present
      for (const item of ['Open', 'Rename', 'Copy Path', 'Reveal', 'New File', 'New Folder', 'Delete']) {
        expect(idx(item), `"${item}" should be in the menu`).toBeGreaterThanOrEqual(0)
      }

      // Order assertions
      expect(idx('Open')).toBeLessThan(idx('Rename'))
      expect(idx('Rename')).toBeLessThan(idx('Copy Path'))
      expect(idx('Copy Path')).toBeLessThan(idx('Reveal'))
      expect(idx('Reveal')).toBeLessThan(idx('New File'))
      expect(idx('New File')).toBeLessThan(idx('New Folder'))
      expect(idx('New Folder')).toBeLessThan(idx('Delete'))
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('folder menu omits Open and starts with Rename', async ({ electronApp, page }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-ctxorder-dir-'))
    fs.mkdirSync(path.join(tmpDir, 'mydir'))

    try {
      await sendIPC(electronApp, 'ui:toggle-sidebar', true)
      await page.locator('[data-testid="sidebar"]').waitFor({ state: 'visible', timeout: 3_000 })
      await sendIPC(electronApp, 'menu:folder-open', tmpDir)

      const sidebar = page.locator('[data-testid="sidebar"]')
      await expect(sidebar.getByText('mydir')).toBeVisible({ timeout: 3_000 })

      await sidebar.getByText('mydir').click({ button: 'right' })
      await expect(page.locator('[role="menuitem"]').first()).toBeVisible({ timeout: 2_000 })

      const labels = (await page.locator('[role="menuitem"]').allTextContents()).map((s) => s.trim())
      expect(labels.some((l) => l === 'Open')).toBe(false)
      expect(labels[0]).toBe('Rename')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

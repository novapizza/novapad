// spec: File Browser inline Rename / New File / New Folder (VSCode-style).
// Electron has no working window.prompt(), so these edit in place.
// seed: tests/open-folder.spec.ts

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

async function openFolder(electronApp: ElectronApplication, page: import('playwright').Page, dir: string) {
  await sendIPC(electronApp, 'ui:toggle-sidebar', true)
  await page.locator('[data-testid="sidebar"]').waitFor({ state: 'visible', timeout: 3_000 })
  await sendIPC(electronApp, 'menu:folder-open', dir)
}

const menuItem = (page: import('playwright').Page, name: string) =>
  page.getByRole('menuitem', { name })

test.describe('File Browser inline editing', () => {
  test('Rename: inline input renames the file on Enter', async ({ electronApp, page }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-inline-rename-'))
    fs.writeFileSync(path.join(tmpDir, 'old.txt'), 'x')

    try {
      await openFolder(electronApp, page, tmpDir)
      const sidebar = page.locator('[data-testid="sidebar"]')
      await expect(sidebar.getByText('old.txt')).toBeVisible({ timeout: 3_000 })

      await sidebar.getByText('old.txt').click({ button: 'right' })
      await menuItem(page, 'Rename').click()

      const input = page.locator('[data-testid="inline-edit-input"]')
      await expect(input).toBeVisible({ timeout: 2_000 })
      await input.fill('renamed.txt')
      await input.press('Enter')

      await expect(sidebar.getByText('renamed.txt')).toBeVisible({ timeout: 3_000 })
      await expect(sidebar.getByText('old.txt')).not.toBeVisible()
      expect(fs.existsSync(path.join(tmpDir, 'renamed.txt'))).toBe(true)
      expect(fs.existsSync(path.join(tmpDir, 'old.txt'))).toBe(false)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('Rename: Escape cancels and keeps the original name', async ({ electronApp, page }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-inline-rename-cancel-'))
    fs.writeFileSync(path.join(tmpDir, 'keep.txt'), 'x')

    try {
      await openFolder(electronApp, page, tmpDir)
      const sidebar = page.locator('[data-testid="sidebar"]')
      await expect(sidebar.getByText('keep.txt')).toBeVisible({ timeout: 3_000 })

      await sidebar.getByText('keep.txt').click({ button: 'right' })
      await menuItem(page, 'Rename').click()

      const input = page.locator('[data-testid="inline-edit-input"]')
      await expect(input).toBeVisible({ timeout: 2_000 })
      await input.fill('should-not-apply.txt')
      await input.press('Escape')

      await expect(sidebar.getByText('keep.txt')).toBeVisible()
      expect(fs.existsSync(path.join(tmpDir, 'keep.txt'))).toBe(true)
      expect(fs.existsSync(path.join(tmpDir, 'should-not-apply.txt'))).toBe(false)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('New File: inline input creates a file and opens it', async ({ electronApp, page }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-inline-newfile-'))
    fs.writeFileSync(path.join(tmpDir, 'seed.txt'), '')

    try {
      await openFolder(electronApp, page, tmpDir)
      const sidebar = page.locator('[data-testid="sidebar"]')
      await expect(sidebar.getByText('seed.txt')).toBeVisible({ timeout: 3_000 })

      await sidebar.getByText('seed.txt').click({ button: 'right' })
      await menuItem(page, 'New File…').click()

      const input = page.locator('[data-testid="inline-edit-input"]')
      await expect(input).toBeVisible({ timeout: 2_000 })
      await input.fill('created.ts')
      await input.press('Enter')

      await expect(sidebar.getByText('created.ts')).toBeVisible({ timeout: 3_000 })
      expect(fs.existsSync(path.join(tmpDir, 'created.ts'))).toBe(true)
      // New file is opened as a tab.
      await page.locator('[data-tab-title="created.ts"]').waitFor({ state: 'visible', timeout: 5_000 })
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('New Folder: inline input creates a directory', async ({ electronApp, page }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-inline-newdir-'))
    fs.writeFileSync(path.join(tmpDir, 'seed.txt'), '')

    try {
      await openFolder(electronApp, page, tmpDir)
      const sidebar = page.locator('[data-testid="sidebar"]')
      await expect(sidebar.getByText('seed.txt')).toBeVisible({ timeout: 3_000 })

      await sidebar.getByText('seed.txt').click({ button: 'right' })
      await menuItem(page, 'New Folder…').click()

      const input = page.locator('[data-testid="inline-edit-input"]')
      await expect(input).toBeVisible({ timeout: 2_000 })
      await input.fill('mydir')
      await input.press('Enter')

      await expect(sidebar.getByText('mydir')).toBeVisible({ timeout: 3_000 })
      expect(fs.existsSync(path.join(tmpDir, 'mydir'))).toBe(true)
      expect(fs.statSync(path.join(tmpDir, 'mydir')).isDirectory()).toBe(true)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

// File watching: `file:externally-changed` / `file:externally-deleted` toasts (App.tsx), and one
// real chokidar round-trip (watch:add on open → disk write → auto-reload toast).

import { test, expect, sendIPC, tempDir } from './fixtures'
import type { ElectronApplication, Page } from 'playwright'
import path from 'path'
import fs from 'fs'

async function openFileViaTree(electronApp: ElectronApplication, page: Page, dir: string, fileName: string) {
  await sendIPC(electronApp, 'menu:folder-open', dir)
  const sidebar = page.locator('[data-testid="sidebar"]')
  await sidebar.getByText(fileName).click({ timeout: 3_000 })
  await expect(page.locator(`[data-tab-title="${fileName}"]`)).toBeVisible({ timeout: 5_000 })
}

let dir: string
test.beforeEach(() => { dir = tempDir('e2e-watch-') })
test.afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

test('External change and delete toasts', async ({ electronApp, page }) => {
  const file = path.join(dir, 'watched.txt')
  fs.writeFileSync(file, 'version 1')
  const reloaded = page.getByText('"watched.txt" reloaded (external change)')
  const changedOnDisk = page.getByText('"watched.txt" changed on disk. Use Reload to update.')
  const deleted = page.getByText('"watched.txt" was deleted from disk.')

  await test.step('change for a path that is not open is ignored', async () => {
    await sendIPC(electronApp, 'file:externally-changed', path.join(dir, 'not-open.txt'))
    await page.waitForTimeout(1_000)
    await expect(page.getByText(/reloaded \(external change\)|changed on disk/)).toHaveCount(0)
  })

  await test.step('deletion of a path that is not open is ignored', async () => {
    await sendIPC(electronApp, 'file:externally-deleted', path.join(dir, 'ghost.txt'))
    await page.waitForTimeout(1_000)
    await expect(page.getByText(/was deleted from disk/)).toHaveCount(0)
  })

  await test.step('change on a clean buffer auto-reloads with an info toast', async () => {
    await openFileViaTree(electronApp, page, dir, 'watched.txt')
    await expect(page.locator('[data-tab-title="watched.txt"]')).toHaveAttribute('data-tab-dirty', 'false')
    await sendIPC(electronApp, 'file:externally-changed', file)
    await expect(reloaded.first()).toBeVisible({ timeout: 2_000 })
  })

  await test.step('change on a dirty buffer warns instead of reloading', async () => {
    await page.locator('[data-testid="editor-pane"] .monaco-editor textarea').first().focus()
    await page.keyboard.type('x')
    await expect(page.locator('[data-tab-title="watched.txt"]')).toHaveAttribute('data-tab-dirty', 'true', { timeout: 2_000 })
    await sendIPC(electronApp, 'file:externally-changed', file)
    await expect(changedOnDisk.first()).toBeVisible({ timeout: 5_000 })
  })

  await test.step('deletion warns and keeps the tab open', async () => {
    await sendIPC(electronApp, 'file:externally-deleted', file)
    await expect(deleted.first()).toBeVisible({ timeout: 2_000 })
    await expect(page.locator('[data-tab-title="watched.txt"]')).toBeVisible()
  })
})

test('file watcher auto-reloads on real disk write (chokidar integration)', async ({ electronApp, page }) => {
  const file = path.join(dir, 'watcher-test.txt')
  fs.writeFileSync(file, 'initial content')

  // Opening the file registers a chokidar watcher via watch:add.
  await openFileViaTree(electronApp, page, dir, 'watcher-test.txt')
  await expect(page.locator('[data-tab-title="watcher-test.txt"]')).toHaveAttribute('data-tab-dirty', 'false')

  // chokidar's awaitWriteFinish adds ~300 ms before the event fires.
  fs.writeFileSync(file, 'new content written by test')
  await expect(page.getByText('"watcher-test.txt" reloaded (external change)').first()).toBeVisible({ timeout: 5_000 })
})

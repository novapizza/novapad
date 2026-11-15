// File Browser inline Rename / New File / New Folder (VSCode-style).
// Electron has no working window.prompt(), so these edit in place via [data-testid="inline-edit-input"].

import { test, expect, sendIPC, tempDir } from './fixtures'
import type { Page } from 'playwright'
import path from 'path'
import fs from 'fs'

// Context menu items live in a Radix portal on <body>.
const menuItem = (page: Page, name: string) => page.getByRole('menuitem', { name })

test('File Browser inline editing', async ({ electronApp, page }) => {
  // App bug (Windows): FileBrowserPanel.refreshParent/updateNodeChildren compare '/'-normalized paths with the
  // raw backslash workspace/node paths, so the tree never refreshes after rename/create/delete. Passes with a '/' path.
  test.fixme(process.platform === 'win32', 'File Browser tree does not refresh after rename/create/delete on Windows (backslash path mismatch)')
  const dir = tempDir('e2e-inline-edit-')
  fs.writeFileSync(path.join(dir, 'old.txt'), 'x')
  fs.writeFileSync(path.join(dir, 'keep.txt'), 'x')
  const sidebar = page.locator('[data-testid="sidebar"]')
  const input = page.locator('[data-testid="inline-edit-input"]')
  const exists = (name: string) => fs.existsSync(path.join(dir, name))

  /** Right-click `row`, pick `item`, type `value` into the inline input, then press `key`. */
  async function inlineEdit(row: string, item: string, value: string, key: 'Enter' | 'Escape') {
    await sidebar.getByText(row, { exact: true }).click({ button: 'right' })
    await menuItem(page, item).click()
    await expect(input).toBeVisible({ timeout: 2_000 })
    await input.fill(value)
    await input.press(key)
  }

  try {
    await sendIPC(electronApp, 'menu:folder-open', dir)
    await expect(sidebar.getByText('old.txt')).toBeVisible({ timeout: 3_000 })

    await test.step('Rename: Enter renames the file', async () => {
      await inlineEdit('old.txt', 'Rename', 'renamed.txt', 'Enter')
      await expect(sidebar.getByText('renamed.txt')).toBeVisible({ timeout: 3_000 })
      await expect(sidebar.getByText('old.txt')).toHaveCount(0)
      expect(exists('renamed.txt')).toBe(true)
      expect(exists('old.txt')).toBe(false)
    })

    await test.step('Rename: Escape cancels and keeps the original name', async () => {
      await inlineEdit('keep.txt', 'Rename', 'should-not-apply.txt', 'Escape')
      await expect(input).toHaveCount(0)
      await expect(sidebar.getByText('keep.txt')).toBeVisible()
      expect(exists('keep.txt')).toBe(true)
      expect(exists('should-not-apply.txt')).toBe(false)
    })

    await test.step('New File: creates the file and opens it in a tab', async () => {
      await inlineEdit('keep.txt', 'New File…', 'created.ts', 'Enter')
      await expect(sidebar.getByText('created.ts')).toBeVisible({ timeout: 3_000 })
      expect(exists('created.ts')).toBe(true)
      await expect(page.locator('[data-tab-title="created.ts"]')).toBeVisible({ timeout: 5_000 })
    })

    await test.step('New Folder: creates a directory', async () => {
      await inlineEdit('keep.txt', 'New Folder…', 'mydir', 'Enter')
      await expect(sidebar.getByText('mydir')).toBeVisible({ timeout: 3_000 })
      expect(fs.statSync(path.join(dir, 'mydir')).isDirectory()).toBe(true)
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

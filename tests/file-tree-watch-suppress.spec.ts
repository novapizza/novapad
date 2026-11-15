// REGRESSION: an app-initiated rename/delete of an OPEN file must not surface as an
// "externally deleted" notification. The file watcher sees an unlink for the old path, but that
// unlink is our own and must be suppressed — it used to show a false "was deleted from disk" toast.

import { test, expect, sendIPC, stubConfirmDialog, tempDir } from './fixtures'
import path from 'path'
import fs from 'fs'

test('rename and delete of an OPEN file show no "deleted from disk" toast', async ({ electronApp, page }) => {
  // App bug (Windows): FileBrowserPanel.refreshParent/updateNodeChildren compare '/'-normalized paths with the
  // raw backslash workspace/node paths, so the tree never refreshes after rename/create/delete. Passes with a '/' path.
  test.fixme(process.platform === 'win32', 'File Browser tree does not refresh after rename/create/delete on Windows (backslash path mismatch)')
  const dir = tempDir('e2e-watch-suppress-')
  fs.writeFileSync(path.join(dir, 'before.txt'), 'hi')
  fs.writeFileSync(path.join(dir, 'doomed.txt'), 'bye')
  const sidebar = page.locator('[data-testid="sidebar"]')
  const menuItem = (name: string) => page.getByRole('menuitem', { name })
  const deletedToast = page.getByText(/was deleted from disk/)

  /** Click a tree row so the file gets a tab and a watcher. */
  async function openFromTree(name: string) {
    await sidebar.getByText(name, { exact: true }).click({ timeout: 3_000 })
    await expect(page.locator(`[data-tab-title="${name}"]`)).toBeVisible({ timeout: 5_000 })
  }

  try {
    await sendIPC(electronApp, 'menu:folder-open', dir)

    await test.step('renaming an open file repoints its tab and shows no toast', async () => {
      await openFromTree('before.txt')
      await sidebar.getByText('before.txt', { exact: true }).click({ button: 'right' })
      await menuItem('Rename').click()
      const input = page.locator('[data-testid="inline-edit-input"]')
      await expect(input).toBeVisible({ timeout: 2_000 })
      await input.fill('after.txt')
      await input.press('Enter')

      await expect(page.locator('[data-tab-title="after.txt"]')).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('[data-tab-title="before.txt"]')).toHaveCount(0)
      // Give the watcher time to (not) fire.
      await page.waitForTimeout(1_500)
      await expect(deletedToast).toHaveCount(0)
    })

    await test.step('deleting an open file shows no toast', async () => {
      await openFromTree('doomed.txt')
      // The confirm is a native main-process message box, so it is stubbed there.
      await stubConfirmDialog(electronApp, 'confirm')
      await sidebar.getByText('doomed.txt', { exact: true }).click({ button: 'right' })
      await menuItem('Delete').click()

      await expect(sidebar.getByText('doomed.txt', { exact: true })).toHaveCount(0, { timeout: 3_000 })
      expect(fs.existsSync(path.join(dir, 'doomed.txt'))).toBe(false)
      await page.waitForTimeout(1_500)
      await expect(deletedToast).toHaveCount(0)
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

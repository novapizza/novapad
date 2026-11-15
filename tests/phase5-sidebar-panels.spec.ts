// Sidebar Document Map and Function List panels, opened from their toolbar buttons
// ("Document Map", "Function / Symbol List"). The File Browser panel is covered by
// open-folder.spec.ts; the old Project panel is no longer rendered anywhere.
//
// JS symbols are not asserted: Monaco's DocumentSymbolProvider does not activate a JS worker in
// the E2E environment, so only the plain-text empty state is checked.

import { test, expect, sendIPC, tempDir } from './fixtures'
import path from 'path'
import fs from 'fs'

test('Document Map and Function List panels', async ({ electronApp, page }) => {
  const sidebar = page.locator('[data-testid="sidebar"]')
  const toolbar = page.locator('[data-testid="toolbar"]')
  // The map is a second Monaco instance in the sidebar, so scope the main editor to the editor pane.
  const mainTextarea = page.locator('[data-testid="editor-pane"] .monaco-editor textarea').first()
  const mapEditor = sidebar.locator('.monaco-editor').first()

  await test.step('Function List shows "No symbols found." for a plain-text buffer', async () => {
    await toolbar.getByRole('button', { name: 'Function / Symbol List' }).click()
    await expect(sidebar).toBeVisible({ timeout: 2_000 })
    await expect(sidebar.getByText('No symbols found.')).toBeVisible({ timeout: 2_000 })
  })

  await test.step('Document Map renders a second Monaco editor inside the sidebar', async () => {
    await toolbar.getByRole('button', { name: 'Document Map' }).click()
    await expect(mapEditor).toBeVisible({ timeout: 3_000 })
    expect(await page.locator('.monaco-editor').count()).toBeGreaterThanOrEqual(2)
  })

  await test.step('Document Map reflects the main editor content (shared model)', async () => {
    await mainTextarea.focus()
    await page.keyboard.type('function hello() {\n  return 42;\n}')
    await expect(sidebar.locator('.monaco-editor .view-lines')).toContainText('function hello', { timeout: 3_000 })
  })

  await test.step('clicking low in the Document Map moves the main editor cursor', async () => {
    const dir = tempDir('e2e-docmap-')
    try {
      fs.writeFileSync(
        path.join(dir, 'longfile.txt'),
        Array.from({ length: 60 }, (_, i) => `line ${i + 1} content here`).join('\n')
      )
      // Opening a folder switches the sidebar to the File Browser.
      await sendIPC(electronApp, 'menu:folder-open', dir)
      await sidebar.getByText('longfile.txt').click({ timeout: 3_000 })
      await expect(page.locator('[data-tab-title="longfile.txt"]')).toBeVisible({ timeout: 5_000 })

      await toolbar.getByRole('button', { name: 'Document Map' }).click()
      await expect(mapEditor).toBeVisible({ timeout: 3_000 })
      await expect(sidebar.locator('.monaco-editor .view-lines')).toContainText('line 1 content', { timeout: 3_000 })

      const box = await mapEditor.boundingBox()
      expect(box).not.toBeNull()
      await page.mouse.click(box!.x + box!.width / 2, box!.y + Math.min(box!.height * 0.8, 3 * 50))

      await expect(page.locator('[data-testid="cursor-position"]')).not.toContainText(/Ln 1\b/, { timeout: 3_000 })
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

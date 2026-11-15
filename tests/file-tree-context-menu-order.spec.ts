// File Browser right-click context menu: item ORDER for files and folders, and dismissal.
// Radix renders ContextMenuItems with role="menuitem" in a portal on <body>, not in the sidebar.

import { test, expect, sendIPC, tempDir } from './fixtures'
import type { Page } from 'playwright'
import path from 'path'
import fs from 'fs'

const menuLabels = async (page: Page) =>
  (await page.getByRole('menuitem').allTextContents()).map((s) => s.trim())

test('File tree context menu order', async ({ electronApp, page }) => {
  const dir = tempDir('e2e-ctxorder-')
  fs.writeFileSync(path.join(dir, 'target.txt'), 'x')
  fs.mkdirSync(path.join(dir, 'mydir'))
  const sidebar = page.locator('[data-testid="sidebar"]')

  try {
    await sendIPC(electronApp, 'menu:folder-open', dir)
    await expect(sidebar.getByText('target.txt')).toBeVisible({ timeout: 3_000 })

    await test.step('file menu order is Open / Rename / Copy Path / Reveal / New File / New Folder / Delete', async () => {
      await sidebar.getByText('target.txt').click({ button: 'right' })
      await expect(page.getByRole('menuitem').first()).toBeVisible({ timeout: 2_000 })
      const labels = await menuLabels(page)
      const idx = (substr: string) => labels.findIndex((l) => l.includes(substr))
      const order = ['Open', 'Rename', 'Copy Path', 'Reveal', 'New File', 'New Folder', 'Delete']
      for (const item of order) expect(idx(item), `"${item}" should be in the menu`).toBeGreaterThanOrEqual(0)
      for (let i = 1; i < order.length; i++) expect(idx(order[i - 1])).toBeLessThan(idx(order[i]))
    })

    await test.step('clicking outside closes the menu', async () => {
      // Radix makes the menu modal (pointer-events: none on the page), so a locator click is
      // refused; a raw mouse click at the editor's position is what a user does.
      const box = await page.locator('[data-testid="editor-pane"]').boundingBox()
      await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
      await expect(page.getByRole('menuitem')).toHaveCount(0)
    })

    await test.step('folder menu omits Open and starts with Rename', async () => {
      await sidebar.getByText('mydir').click({ button: 'right' })
      await expect(page.getByRole('menuitem').first()).toBeVisible({ timeout: 2_000 })
      const labels = await menuLabels(page)
      expect(labels).not.toContain('Open')
      expect(labels[0]).toBe('Rename')
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

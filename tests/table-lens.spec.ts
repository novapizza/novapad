// E2E for Table Lens write-back (.docs/features/table-lens-sync): edits made in the CSV preview
// table land in the tab's text, and Ctrl+S in the table saves them to disk keeping the file's
// delimiter and line endings.

import { test, expect, Page } from '@playwright/test'
import type { ElectronApplication } from 'playwright'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { freshUserDataDir, launchIsolated } from './whats-new-helpers'

const CSV = 'id;name;city\n1;Alice;Oslo\n2;Bob;Rome\n'

function makeCsv(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novapad-tablelens-'))
  const fp = path.join(dir, 'people.csv')
  fs.writeFileSync(fp, CSV, 'utf8')
  return fp
}

async function openInTableLens(csvPath: string): Promise<{ app: ElectronApplication; page: Page }> {
  // Argv files open after session restore, so leave restore on (a fresh profile has no session)
  const { app, page } = await launchIsolated({ userDataDir: freshUserDataDir(), skipSessionRestore: false, extraArgs: [csvPath] })
  const tab = page.locator('[data-tab-title="people.csv"]')
  await tab.waitFor({ state: 'visible', timeout: 10_000 })
  await tab.click()
  await page.waitForSelector('.monaco-editor textarea', { timeout: 10_000 })
  await page.keyboard.press('Control+P')
  await expect(page.getByRole('cell', { name: 'Alice', exact: true })).toBeVisible({ timeout: 10_000 })
  return { app, page }
}

async function editCell(page: Page, from: string, to: string): Promise<void> {
  await page.getByRole('cell', { name: from, exact: true }).dblclick()
  const editor = page.getByRole('textbox', { name: 'Edit cell' })
  await editor.fill(to)
  await editor.press('Enter')
  await expect(page.getByRole('cell', { name: to, exact: true })).toBeVisible()
}

/** Fire a paste/copy event at the focused element, as Ctrl+V / Ctrl+C would; returns the copied text */
async function clipboardEvent(page: Page, type: 'paste' | 'copy', text = ''): Promise<string> {
  return page.evaluate(([type, text]) => {
    const data = new DataTransfer()
    if (text) data.setData('text/plain', text)
    const target = document.activeElement ?? document.body
    target.dispatchEvent(new ClipboardEvent(type, { clipboardData: data, bubbles: true, cancelable: true }))
    return data.getData('text/plain')
  }, [type, text] as const)
}

const tabDirty = (page: Page) => page.locator('[data-tab-title="people.csv"]').getAttribute('data-tab-dirty')

test.describe('Table Lens write-back', () => {
  test('Ctrl+S in the table saves edits to disk, keeping delimiter and line endings', async () => {
    const csvPath = makeCsv()
    const { app, page } = await openInTableLens(csvPath)
    try {
      await editCell(page, 'Alice', 'Alicia')
      await expect.poll(() => tabDirty(page)).toBe('true')

      // Focus is on the table root after the edit, so Ctrl+S is the table's own Save
      await page.keyboard.press('Control+S')
      await expect.poll(() => fs.readFileSync(csvPath, 'utf8'), { timeout: 5_000 })
        .toBe('id;name;city\n1;Alicia;Oslo\n2;Bob;Rome\n')
      await expect.poll(() => tabDirty(page)).not.toBe('true')
      await expect(page.getByText('● Unsaved')).toHaveCount(0)
    } finally {
      await app.close()
      fs.rmSync(path.dirname(csvPath), { recursive: true, force: true })
    }
  })

  test('the table owns F2, paste/copy, Ctrl+Z, Ctrl+F and the fill handle', async () => {
    const csvPath = makeCsv()
    const { app, page } = await openInTableLens(csvPath)
    try {
      // F2 is "Next Bookmark" app-wide; on a selected cell it opens the cell editor
      await page.getByRole('cell', { name: 'Oslo', exact: true }).click()
      await page.keyboard.press('F2')
      const editor = page.getByRole('textbox', { name: 'Edit cell' })
      await expect(editor).toHaveValue('Oslo')
      await editor.press('Escape')
      await expect(editor).toHaveCount(0)
      // Closing the editor hands focus back to the table, so grid keys and clipboard keep working
      await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-own-shortcuts'))).toBe(true)

      // Paste a column of lines downward from the selected cell. Dispatched on the focused element —
      // which must be back inside the table after the editor closed — because the system clipboard
      // isn't reliable in headless runs (the Ctrl+V → paste event step is Chromium's, not ours).
      await clipboardEvent(page, 'paste', 'Bergen\nMilan')
      await expect(page.getByRole('cell', { name: 'Bergen', exact: true })).toBeVisible()
      await expect(page.getByRole('cell', { name: 'Milan', exact: true })).toBeVisible()

      // Ctrl+Z undoes the paste in the table, not in the editor
      await page.keyboard.press('Control+Z')
      await expect(page.getByRole('cell', { name: 'Oslo', exact: true })).toBeVisible()
      await expect(page.getByRole('cell', { name: 'Rome', exact: true })).toBeVisible()

      // Fill handle: drag "1" down one row → copies by default for plain numbers
      const idCell = (text: string) => page.locator('td[data-col="id"]', { hasText: new RegExp(`^${text}$`) })
      await idCell('1').click()
      const handle = page.locator('[title="Drag to fill"]')
      const target = await idCell('2').boundingBox()
      await handle.hover()
      await page.mouse.down()
      await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 5 })
      await page.mouse.up()
      await expect(idCell('1')).toHaveCount(2)

      // Copy writes the selected cell
      await page.getByRole('cell', { name: 'Bob', exact: true }).click()
      expect(await clipboardEvent(page, 'copy')).toBe('Bob')

      // Ctrl+F focuses the table's own search box instead of the editor's Find dialog
      await page.keyboard.press('Control+F')
      await expect(page.getByPlaceholder('Search all...')).toBeFocused()
    } finally {
      await app.close()
      fs.rmSync(path.dirname(csvPath), { recursive: true, force: true })
    }
  })

  test('closing the preview moves unsaved table edits into the text', async () => {
    const csvPath = makeCsv()
    const { app, page } = await openInTableLens(csvPath)
    try {
      await editCell(page, 'Rome', 'Paris')
      // Ctrl+P is not one of the table's own shortcuts, so it still toggles the preview
      await page.keyboard.press('Control+P')
      await expect(page.getByRole('cell', { name: 'Paris', exact: true })).toHaveCount(0)

      await expect(page.locator('.monaco-editor .view-lines')).toContainText('2;Bob;Paris')
      expect(await tabDirty(page)).toBe('true')
      // Nothing written to disk until the user saves
      expect(fs.readFileSync(csvPath, 'utf8')).toBe(CSV)
    } finally {
      await app.close()
      fs.rmSync(path.dirname(csvPath), { recursive: true, force: true })
    }
  })
})

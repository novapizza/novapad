// E2E for the large-JSON record viewer. A ≥ 50 MB .json file is generated at
// test time (never committed), opened through the same IPC the native
// File ▸ Open menu uses, and driven through browse → edit → delete → save →
// filter → extract. The final assertions read the saved file back from disk.
//
// Also covers the size guard: a sparse 257 MB .txt must be refused with a
// friendly message instead of the V8 "0x1fffffe8" string-length error.

import { test as base, expect } from './fixtures'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'

function makeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, E2E_TEST: '1', NODE_ENV: 'test' }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

// One Electron instance shared by `electronApp` and `page`. The default
// fixtures launch a separate app per fixture, so IPC sent through
// `electronApp` would never reach the window `page` is looking at.
const test = base.extend<{ electronApp: ElectronApplication }>({
  electronApp: async ({}, use) => {
    const app = await electron.launch({
      args: [path.resolve(__dirname, '../out/main/index.js')],
      env: makeEnv(),
      timeout: 15_000,
    })
    await use(app)
    await app.close()
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForSelector('[data-testid="app"]', { timeout: 10_000 })
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('menu:file-new')
    })
    await page.waitForSelector('.monaco-editor textarea', { timeout: 10_000 })
    await use(page)
  },
})

const TARGET_BYTES = 52 * 1024 * 1024 // just past the 50 MB threshold

/** Minified top-level array of small records. Returns the record count. */
function writeBigJson(file: string): number {
  const fd = fs.openSync(file, 'w')
  fs.writeSync(fd, '[')
  let i = 0
  let bytes = 1
  const batch: string[] = []
  while (bytes < TARGET_BYTES) {
    const s = JSON.stringify({ id: i, name: `user ${i}`, email: `u${i}@example.com`, tags: ['a', i % 7 === 0 ? 'lucky' : 'plain'], nested: { score: i % 100 } })
    batch.push((i > 0 ? ',' : '') + s)
    bytes += s.length + 1
    i++
    if (batch.length === 5000) { fs.writeSync(fd, batch.join('')); batch.length = 0 }
  }
  if (batch.length) fs.writeSync(fd, batch.join(''))
  fs.writeSync(fd, ']')
  fs.closeSync(fd)
  return i
}

async function openPath(electronApp: ElectronApplication, p: string): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }, fp) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('menu:file-open', [fp])
  }, p)
}

async function pasteInto(page: Page, electronApp: ElectronApplication, textareaSel: string, text: string): Promise<void> {
  await electronApp.evaluate(({ clipboard }, t) => clipboard.writeText(t as string), text)
  await page.locator(textareaSel).first().click({ force: true })
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+V')
}

test.describe('Large JSON record viewer', () => {
  test('opens a 52 MB array in the record viewer, edits, deletes, saves, filters, extracts', async ({ electronApp, page }) => {
    test.setTimeout(120_000)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-ljson-'))
    const file = path.join(tmpDir, 'big.json')
    const N = writeBigJson(file)

    try {
      await openPath(electronApp, file)

      // Routed to the record viewer, not Monaco.
      const tab = page.locator('[data-tab-kind="largeJson"]')
      await expect(tab).toBeVisible({ timeout: 15_000 })
      await expect(page.getByTestId('tab-largejson-icon')).toBeVisible()

      // Index completes and reports the exact record count.
      const count = page.getByTestId('ljson-count')
      await expect(count).toHaveText(`${N.toLocaleString()} records`, { timeout: 30_000 })

      // Rows render; expanding the first shows its tree.
      const rows = page.getByTestId('ljson-row')
      await expect(rows.first()).toContainText('"id":0', { timeout: 10_000 })
      await rows.first().getByRole('button', { expanded: false }).first().click()
      // Expanded: the tree adds its own collapsible containers ("tags", "nested")
      // below the row toggle.
      await expect(rows.first().locator('button[aria-expanded]').nth(1)).toBeVisible()
      await expect(rows.first().getByText('"score":')).toBeVisible()

      // Edit record 0 through the Monaco modal (paste — typing would trigger
      // Monaco's auto-closing brackets/quotes).
      await rows.first().hover()
      await rows.first().getByRole('button', { name: 'Edit record' }).click({ force: true })
      const editor = page.getByTestId('ljson-record-editor')
      await expect(editor).toBeVisible()
      await pasteInto(page, electronApp, '[data-testid="ljson-record-editor"] .monaco-editor textarea', '{"id":0,"name":"EDITED","tags":[]}')
      await page.getByTestId('ljson-apply').click()
      await expect(editor).toHaveCount(0)
      await expect(page.getByTestId('ljson-edit-count')).toHaveText('1 pending change')
      await expect(tab).toHaveAttribute('data-tab-dirty', 'true')
      await expect(rows.first()).toContainText('EDITED')

      // Invalid JSON is rejected by Apply.
      await rows.nth(2).hover()
      await rows.nth(2).getByRole('button', { name: 'Edit record' }).click({ force: true })
      await pasteInto(page, electronApp, '[data-testid="ljson-record-editor"] .monaco-editor textarea', '{"broken":')
      await page.getByTestId('ljson-apply').click()
      await expect(page.getByTestId('ljson-record-editor')).toContainText('Invalid JSON')
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('ljson-record-editor')).toHaveCount(0)
      await expect(page.getByTestId('ljson-edit-count')).toHaveText('1 pending change')

      // Delete record 1.
      await rows.nth(1).hover()
      await rows.nth(1).getByRole('button', { name: 'Delete record' }).click({ force: true })
      await expect(page.getByTestId('ljson-edit-count')).toHaveText('2 pending changes')
      await expect(rows.nth(1)).toHaveAttribute('data-record-status', 'deleted')

      // Undo / redo round-trip the delete.
      await page.getByRole('button', { name: 'Undo' }).click()
      await expect(page.getByTestId('ljson-edit-count')).toHaveText('1 pending change')
      await page.getByRole('button', { name: 'Redo' }).click()
      await expect(page.getByTestId('ljson-edit-count')).toHaveText('2 pending changes')

      // Save streams the overlay to disk, then the worker re-indexes.
      await page.getByTestId('ljson-save').click()
      await expect(tab).toHaveAttribute('data-tab-dirty', 'false', { timeout: 30_000 })
      await expect(count).toHaveText(`${(N - 1).toLocaleString()} records`, { timeout: 30_000 })
      await expect(page.getByTestId('ljson-edit-count')).toHaveCount(0)

      const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<{ id: number; name: string }>
      expect(saved).toHaveLength(N - 1)
      expect(saved[0]).toEqual({ id: 0, name: 'EDITED', tags: [] })
      expect(saved[1].id).toBe(2)

      // Filter: exactly one record matches a unique email; its index shifted by the delete.
      const search = page.getByTestId('ljson-search')
      await search.fill('"u777@example.com"')
      await search.press('Enter')
      await expect(page.getByTestId('ljson-search-status')).toHaveText('1 match', { timeout: 30_000 })
      await expect(rows).toHaveCount(1)
      await expect(rows.first()).toHaveAttribute('data-record-index', '776')
      await search.press('Escape')
      await expect(rows.first()).toHaveAttribute('data-record-index', '0')

      // Extract runs over every record.
      await page.getByTestId('ljson-view-extract').click()
      const pathInput = page.getByTestId('ljson-extract-path')
      await pathInput.fill('email')
      await pathInput.press('Enter')
      // N-1 records remain and the edited record 0 has no email → N-2 values.
      await expect(page.getByTestId('ljson-extract-count')).toContainText(`${(N - 2).toLocaleString()} values found`, { timeout: 30_000 })
      await expect(page.getByTestId('ljson-extract-output')).toContainText('u2@example.com')
    } finally {
      // Close the tab first so the worker releases its handle before cleanup.
      await page.keyboard.press('Control+W').catch(() => {})
      await page.waitForTimeout(300)
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('refuses a non-JSON file over the 256 MB cap with a readable message', async ({ electronApp, page }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-ljson-cap-'))
    const file = path.join(tmpDir, 'huge.txt')
    // Sparse file: instant to create, stat().size is what the guard reads.
    fs.writeFileSync(file, '')
    fs.truncateSync(file, 257 * 1024 * 1024)

    try {
      await openPath(electronApp, file)
      await expect(page.getByText(/"huge\.txt" is 257 MB — larger than the 256 MB limit/)).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(/0x1fffffe8/)).toHaveCount(0)
      await expect(page.locator('[data-tab-title="huge.txt"]')).toHaveCount(0)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

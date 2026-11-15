// Recent files: opening a file records it via the main process (file:get-recents round-trip).
// The MRU list logic (cap at 15, de-duplication) is unit-tested in tests/unit/recentList.test.ts.

import { test, expect, sendIPC, tempDir } from './fixtures'
import type { Page } from 'playwright'
import path from 'path'
import fs from 'fs'

const getRecents = (page: Page) =>
  page.evaluate(() => (window as unknown as { api: { file: { getRecents: () => Promise<string[]> } } }).api.file.getRecents())

test('opening a file prepends it to the recents list', async ({ electronApp, page }) => {
  const dir = tempDir('e2e-recents-')
  const file = path.join(dir, 'recent-test.txt')
  fs.writeFileSync(file, 'recent test content')

  try {
    let before: string[] = []
    await test.step('getRecents returns a string array', async () => {
      before = await getRecents(page)
      expect(Array.isArray(before)).toBe(true)
      for (const entry of before) expect(typeof entry).toBe('string')
    })

    await test.step('opening a file puts it first', async () => {
      await sendIPC(electronApp, 'menu:folder-open', dir)
      await page.locator('[data-testid="sidebar"]').getByText('recent-test.txt').click({ timeout: 3_000 })
      await expect(page.locator('[data-tab-title="recent-test.txt"]')).toBeVisible({ timeout: 5_000 })

      await expect.poll(async () => (await getRecents(page))[0]).toBe(file)
      expect((await getRecents(page)).length).toBe(before.length + 1)
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

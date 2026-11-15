// spec: Save All must prompt for one untitled buffer at a time.
//
// saveBuffer() raises a native Save As dialog for every buffer without a file
// path. Firing those in parallel (the old `buffers.forEach(saveBuffer)`) stacks
// N OS-modal dialogs on top of each other, so the user cannot tell which
// buffer they are naming. App.tsx now awaits each save in turn.

import { test, expect, sendIPC } from './fixtures'
import type { ElectronApplication } from 'playwright'

/**
 * Replace dialog.showSaveDialog with a stub that reports how many calls were
 * ever in flight at the same time. Each call is held open briefly so that
 * genuinely parallel callers overlap.
 */
async function instrumentSaveDialog(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ dialog }) => {
    const stats = { inFlight: 0, maxInFlight: 0, calls: 0 }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).__saveDialogStats = stats
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(dialog as any).showSaveDialog = async () => {
      stats.calls++
      stats.inFlight++
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight)
      await new Promise((r) => setTimeout(r, 200))
      stats.inFlight--
      // Cancel, so nothing is written to disk and the buffer stays untitled.
      return { canceled: true, filePath: undefined }
    }
  })
}

const readSaveDialogStats = (app: ElectronApplication) =>
  app.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any).__saveDialogStats as {
      calls: number
      maxInFlight: number
    }
  })

test('Save All prompts for one untitled buffer at a time', async ({ electronApp, page }) => {
  // Two dirty, untitled buffers — each needs its own Save As prompt.
  const editor = page.locator('.monaco-editor textarea').first()
  await editor.click({ force: true })
  await page.keyboard.type('first')

  await sendIPC(electronApp, 'menu:file-new')
  await expect(page.locator('[data-testid="tabbar"] [data-tab-title]')).toHaveCount(2)
  // Type only once the new tab is active, or 'second' can land in the first buffer under load
  await expect(page.getByTestId('active-tab')).toHaveAttribute('data-tab-title', 'new 2')
  await editor.click({ force: true })
  await page.keyboard.type('second')
  await expect(page.locator('[data-testid="tabbar"] [data-tab-dirty="true"]')).toHaveCount(2)

  await instrumentSaveDialog(electronApp)

  await sendIPC(electronApp, 'menu:file-save-all')

  // Both buffers must get prompted (sequentially, so ~200ms apart).
  await expect
    .poll(async () => (await readSaveDialogStats(electronApp)).calls, { timeout: 5_000 })
    .toBe(2)

  const stats = await readSaveDialogStats(electronApp)
  expect(stats.maxInFlight).toBe(1)
})

// E2E for the "Compare with…" tab right-click submenu and the fullscreen CompareOverlay it opens.
// Two file buffers, right-click the active tab, pick the other tab, verify the overlay shows both
// titles and a sensible added/removed stat, then Esc closes it.

import { test, expect, sendIPC, setEditorText } from './fixtures'

test.describe('Compare with… (tab right-click)', () => {
  test('right-click → Compare with… → pick another tab → overlay opens with diff, Esc closes it', async ({ page, electronApp }) => {
    const overlay = page.getByTestId('compare-overlay')

    await test.step('two buffers with different content', async () => {
      await setEditorText(page, 'one\ntwo\nthree')
      await sendIPC(electronApp, 'menu:file-new')
      await page.waitForSelector('[data-tab-title="new 2"]', { timeout: 5_000 })
      await setEditorText(page, 'one\nTWO\nthree\nfour')
    })

    await test.step('Compare with… → new 1 opens the overlay with both titles and non-zero stats', async () => {
      await page.locator('[data-tab-title="new 2"]').click({ button: 'right' })
      await page.getByText('Compare with…').click()
      await page.getByTestId('compare-with-new 1').click()

      await expect(overlay).toBeVisible({ timeout: 5_000 })
      await expect(overlay.getByText('new 1', { exact: true })).toBeVisible()
      await expect(overlay.getByText('new 2', { exact: true })).toBeVisible()
      // "four" is added and "two"→"TWO" is a change, so neither stat can be zero.
      await expect(page.getByTestId('compare-stat-added')).toBeVisible()
      await expect(page.getByTestId('compare-stat-removed')).toBeVisible()
      await expect(page.getByTestId('compare-stat-added')).not.toHaveText('+0')
      await expect(page.getByTestId('compare-stat-removed')).not.toHaveText('-0')
    })

    await test.step('Esc closes the overlay', async () => {
      await page.keyboard.press('Escape')
      await expect(overlay).toHaveCount(0)
    })
  })

  test('"Compare with…" is disabled when only one file tab is open', async ({ page }) => {
    // Only the seeded "new 1" tab exists.
    await page.locator('[data-tab-title="new 1"]').click({ button: 'right' })
    // The disabled fallback entry is present, not the submenu trigger.
    const fallback = page.getByText(/Compare with…/).first()
    await expect(fallback).toBeVisible()
    await expect(fallback).toHaveAttribute('data-disabled', '')
  })
})

// E2E for the "Compare with…" tab right-click submenu and the fullscreen
// CompareOverlay it opens. Two file buffers, right-click the active tab,
// pick the other tab, verify the overlay shows both titles and a sensible
// added/removed stat.

import { test as base, expect } from './fixtures'
import { _electron as electron, ElectronApplication } from 'playwright'
import path from 'path'

function makeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, E2E_TEST: '1', NODE_ENV: 'test' }
  delete env.ELECTRON_RUN_AS_NODE
  return env
}

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
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.webContents.send('menu:file-new')
    })
    await page.waitForSelector('.monaco-editor textarea', { timeout: 10_000 })
    await use(page)
  },
})

async function pasteIntoEditor(
  page: import('@playwright/test').Page,
  electronApp: ElectronApplication,
  text: string,
): Promise<void> {
  await electronApp.evaluate(({ clipboard }, t) => clipboard.writeText(t as string), text)
  await page.locator('.monaco-editor textarea').first().click({ force: true })
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+V')
}

async function newTab(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.webContents.send('menu:file-new')
  })
}

test.describe('Compare with… (tab right-click)', () => {
  test('right-click → Compare with… → pick another tab → overlay opens with diff', async ({ page, electronApp }) => {
    // Tab A — paste content A.
    await pasteIntoEditor(page, electronApp, 'one\ntwo\nthree')

    // Tab B — open a new file buffer and paste content B.
    await newTab(electronApp)
    await page.waitForSelector('[data-tab-title="new 2"]', { timeout: 5_000 })
    await pasteIntoEditor(page, electronApp, 'one\nTWO\nthree\nfour')

    // Right-click the active tab (new 2) → "Compare with…" → pick "new 1".
    await page.locator('[data-tab-title="new 2"]').click({ button: 'right' })
    await page.getByText('Compare with…').click()
    // Submenu opens — pick the other tab.
    await page.getByTestId('compare-with-new 1').click()

    // Overlay should mount with both titles visible.
    await expect(page.getByTestId('compare-overlay')).toBeVisible({ timeout: 5_000 })
    // Both buffer titles appear in the header (separately, in their truncating spans).
    await expect(page.getByTestId('compare-overlay').getByText('new 1', { exact: true })).toBeVisible()
    await expect(page.getByTestId('compare-overlay').getByText('new 2', { exact: true })).toBeVisible()
    // Diff stats: at least one added line ("four") and one removed (case
    // difference on "two") between the two buffers — sanity check that the
    // algorithm ran on the right content.
    const addedLocator = page.getByTestId('compare-stat-added')
    const removedLocator = page.getByTestId('compare-stat-removed')
    await expect(addedLocator).toBeVisible()
    await expect(removedLocator).toBeVisible()
    expect(await addedLocator.textContent()).not.toBe('+0')
    expect(await removedLocator.textContent()).not.toBe('-0')
  })

  test('"Compare with…" is disabled when only one file tab is open', async ({ page }) => {
    // Only the seed "new 1" tab exists. Right-click it.
    await page.locator('[data-tab-title="new 1"]').click({ button: 'right' })
    // The disabled fallback entry is present, not the submenu trigger.
    const fallback = page.getByText(/Compare with…/).first()
    await expect(fallback).toBeVisible()
    // Radix marks disabled items via data-disabled — assert it's present.
    await expect(fallback).toHaveAttribute('data-disabled', '')
  })

  test('Esc closes the compare overlay', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, 'alpha\nbeta')
    await newTab(electronApp)
    await page.waitForSelector('[data-tab-title="new 2"]', { timeout: 5_000 })
    await pasteIntoEditor(page, electronApp, 'alpha\ngamma')

    await page.locator('[data-tab-title="new 2"]').click({ button: 'right' })
    await page.getByText('Compare with…').click()
    await page.getByTestId('compare-with-new 1').click()
    await expect(page.getByTestId('compare-overlay')).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('compare-overlay')).toHaveCount(0)
  })
})

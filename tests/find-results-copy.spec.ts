// E2E for Copy All / Copy Selected in the Find Results panel.
// Paste multi-line content, Find All in the current doc, then verify that
// selected rows (click + Ctrl+Click) copy their full raw line text via
// Ctrl+C, and that the right-click context menu's Copy All copies every
// result line — newline-joined, no line numbers, no file headers.

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

const LINE_1 = 'alpha TODO one'
const LINE_2 = 'beta TODO two'
const LINE_3 = 'gamma TODO three'
const CONTENT = [LINE_1, 'plain line', LINE_2, 'another line', LINE_3].join('\n')

/** Platform-primary modifier for synthesized clicks/keys (Ctrl+Click is right-click on macOS). */
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function pasteIntoEditor(
  page: import('@playwright/test').Page,
  electronApp: ElectronApplication,
  text: string,
): Promise<void> {
  await electronApp.evaluate(({ clipboard }, t) => clipboard.writeText(t as string), text)
  await page.locator('.monaco-editor textarea').first().click({ force: true })
  // webContents-level select-all + paste works on every platform (Ctrl+V is ignored on macOS).
  await electronApp.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents
    wc.selectAll()
    wc.paste()
  })
  await page.waitForTimeout(150)
}

/** Open Find, search for "TODO" with Find All (this doc), close the dialog. */
async function runFindAll(
  page: import('@playwright/test').Page,
  electronApp: ElectronApplication,
): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.webContents.send('menu:find')
  })
  const input = page.getByPlaceholder('Search pattern…')
  await input.waitFor({ timeout: 5_000 })
  await input.fill('TODO')
  await page.getByRole('button', { name: 'Find All (this doc)' }).click()
  await page.keyboard.press('Escape') // close the dialog so the panel is unobstructed
  await page.waitForSelector('[data-testid="find-result-line"]', { timeout: 5_000 })
}

async function readClipboard(electronApp: ElectronApplication): Promise<string> {
  return electronApp.evaluate(({ clipboard }) => clipboard.readText())
}

test.describe('Find Results — Copy All / Copy Selected', () => {
  test('click + Ctrl+Click select rows, Ctrl+C copies raw line text', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, CONTENT)
    await runFindAll(page, electronApp)

    const rows = page.locator('[data-testid="find-result-line"]')
    await expect(rows).toHaveCount(3)

    // Plain click selects the first row (and navigates); Mod+Click toggles the third in.
    await rows.nth(0).click()
    await rows.nth(2).click({ modifiers: [MOD] })
    await expect(page.locator('[data-testid="find-result-line"][data-key="0:0"]')).toHaveClass(/bg-primary/)
    await expect(page.locator('[data-testid="find-result-line"][data-key="0:2"]')).toHaveClass(/bg-primary/)

    // Mod+Click left keyboard focus on the panel, so Mod+C copies the selection.
    await page.keyboard.press(`${MOD}+C`)
    // navigator.clipboard.writeText is async — poll until the write lands.
    await expect.poll(() => readClipboard(electronApp)).toBe(`${LINE_1}\n${LINE_3}`)
  })

  test('right-click → Copy All copies every result line', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, CONTENT)
    await runFindAll(page, electronApp)

    const rows = page.locator('[data-testid="find-result-line"]')
    await expect(rows).toHaveCount(3)

    await rows.nth(1).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Copy All' }).click()
    await expect.poll(() => readClipboard(electronApp)).toBe(`${LINE_1}\n${LINE_2}\n${LINE_3}`)
  })

  test('right-click an unselected row → Copy copies just that line', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, CONTENT)
    await runFindAll(page, electronApp)

    const rows = page.locator('[data-testid="find-result-line"]')
    await expect(rows).toHaveCount(3)

    await rows.nth(1).click({ button: 'right' })
    // Accessible name includes the shortcut label ("Copy ⌘+C" / "Copy Ctrl+C").
    await page.getByRole('menuitem', { name: /^Copy (⌘|Ctrl)\+C$/ }).click()
    await expect.poll(() => readClipboard(electronApp)).toBe(LINE_2)
  })
})

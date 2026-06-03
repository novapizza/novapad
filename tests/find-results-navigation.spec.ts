// E2E for VSCode-style Find Results interactions: arrow-key tree navigation,
// inline Open/Dismiss actions on file headers, and Copy Path in the context menu.

import { test as base, expect } from './fixtures'
import { _electron as electron, ElectronApplication } from 'playwright'
import path from 'path'
import fs from 'fs'
import os from 'os'

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

async function pasteIntoEditor(
  page: import('@playwright/test').Page,
  electronApp: ElectronApplication,
  text: string,
): Promise<void> {
  await electronApp.evaluate(({ clipboard }, t) => clipboard.writeText(t as string), text)
  await page.locator('.monaco-editor textarea').first().click({ force: true })
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
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid="find-result-line"]', { timeout: 5_000 })
}

test.describe('Find Results — VSCode-style navigation', () => {
  test('arrow keys walk the tree, Enter opens the hit', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, CONTENT)
    await runFindAll(page, electronApp)

    const list = page.locator('[data-testid="find-results-list"]')
    await list.focus()

    // ↓ focuses the file header first, then walks into the result lines.
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[data-testid="find-result-header"]')).toHaveClass(/ring-1/)
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[data-testid="find-result-line"][data-key="0:0"]')).toHaveClass(/bg-primary/)
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[data-testid="find-result-line"][data-key="0:1"]')).toHaveClass(/bg-primary/)

    // Enter navigates the editor to the focused hit (LINE_2 lives on line 3).
    await page.keyboard.press('Enter')
    await expect(page.getByTitle('Go to Line:Column')).toHaveText(/Ln 3,/)
  })

  test('arrow left/right collapse and expand the file group', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, CONTENT)
    await runFindAll(page, electronApp)

    const list = page.locator('[data-testid="find-results-list"]')
    await list.focus()
    await page.keyboard.press('ArrowDown') // focus the header

    await page.keyboard.press('ArrowLeft') // collapse
    await expect(page.locator('[data-testid="find-result-line"]')).toHaveCount(0)

    await page.keyboard.press('ArrowRight') // expand
    await expect(page.locator('[data-testid="find-result-line"]')).toHaveCount(3)
  })

  test('hovering the header reveals Dismiss, which removes the file', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, CONTENT)
    await runFindAll(page, electronApp)

    const header = page.locator('[data-testid="find-result-header"]')
    await header.hover()
    await page.locator('[data-testid="find-result-dismiss"]').click()

    await expect(page.locator('[data-testid="find-result-line"]')).toHaveCount(0)
    await expect(page.getByText('No results.')).toBeVisible()
  })

  test('context menu Copy Path copies the file path', async ({ page, electronApp }) => {
    // Open a real on-disk file so the header has a path.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frnav-'))
    const filePath = path.join(tmp, 'sample.log')
    fs.writeFileSync(filePath, CONTENT)
    await electronApp.evaluate(({ BrowserWindow }, ps) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) win.webContents.send('menu:file-open', ps)
    }, [filePath])
    await page.waitForSelector('[data-tab-title="sample.log"]', { timeout: 5_000 })
    await page.waitForTimeout(200) // EditorPane model swap settles asynchronously

    await runFindAll(page, electronApp)

    await page.locator('[data-testid="find-result-header"]').click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Copy Path' }).click()
    await expect
      .poll(() => electronApp.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(filePath)
  })
})

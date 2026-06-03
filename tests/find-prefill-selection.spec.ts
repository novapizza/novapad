// E2E for editor-selection prefill across all Find dialog modes.
// The selected text must land in the search field for Find, Replace,
// Find in Files and Mark — including when the dialog is already open
// and a shortcut switches modes with a fresh selection.

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
  await electronApp.evaluate(({ BrowserWindow }) => {
    const wc = BrowserWindow.getAllWindows()[0].webContents
    wc.selectAll()
    wc.paste()
  })
  await page.waitForTimeout(150)
}

/**
 * Double-click a word in the editor so Monaco selects it. Monaco renders the
 * whole plain-text line as one span, so aim at the word's character offset
 * (monospace font → position is proportional to the char index).
 */
async function selectWord(
  page: import('@playwright/test').Page,
  lineText: string,
  word: string,
): Promise<void> {
  const span = page.locator('.view-line span', { hasText: word }).first()
  const box = await span.boundingBox()
  if (!box) throw new Error('editor line not visible')
  const ratio = (lineText.indexOf(word) + word.length / 2) / lineText.length
  await span.dblclick({ position: { x: box.width * ratio, y: box.height / 2 } })
}

async function sendMenu(electronApp: ElectronApplication, channel: string): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }, ch) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.webContents.send(ch as string)
  }, channel)
}

const findInput = (page: import('@playwright/test').Page) =>
  page.getByPlaceholder(/Search pattern…|Pattern to mark…/)

const LINE_A = 'alphaNeedle beta gamma'
const LINE_B = 'alphaNeedle beta gammaTarget'

test.describe('Find dialog — selection prefill across modes', () => {
  test('Find in Files prefills the editor selection', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, LINE_A)
    await selectWord(page, LINE_A, 'alphaNeedle')

    await sendMenu(electronApp, 'menu:find-in-files')
    await expect(findInput(page)).toHaveValue('alphaNeedle')
  })

  test('mode-switch shortcut while dialog is open re-applies the new selection', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, LINE_B)

    // Open Find with the first word selected.
    await selectWord(page, LINE_B, 'alphaNeedle')
    await sendMenu(electronApp, 'menu:find')
    await expect(findInput(page)).toHaveValue('alphaNeedle')

    // Dialog stays open; select another word and hit the Replace shortcut.
    await selectWord(page, LINE_B, 'gammaTarget')
    await sendMenu(electronApp, 'menu:replace')
    await expect(page.getByPlaceholder('Replacement text…')).toBeVisible() // Replace tab active
    await expect(findInput(page)).toHaveValue('gammaTarget')
  })

  test('Mark menu opens the Mark tab with the selection prefilled', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, LINE_A)
    await selectWord(page, LINE_A, 'beta')

    await sendMenu(electronApp, 'menu:mark')
    await expect(page.getByPlaceholder('Pattern to mark…')).toHaveValue('beta')
  })
})

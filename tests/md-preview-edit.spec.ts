// E2E: edit Markdown in the preview — double-click a block, edit its raw
// source, and the change lands in the editor's text (and so the file on save).
// Seeds a markdown buffer via the deeplink:new IPC and opens the side preview
// so the source editor stays visible next to it.

import { test as base, expect } from './fixtures'
import { _electron as electron, ElectronApplication, Page } from 'playwright'
import fs from 'fs'
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
    await use(page)
  },
})

const DOC = '# Heading\n\nsome text\n\n| Name | Qty |\n|---|---|\n| apple | 3 |\n'

async function openPreview(electronApp: ElectronApplication, page: Page): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }, content) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('deeplink:new', {
      title: 'notes.md',
      content,
      language: 'markdown',
    })
  }, DOC)
  await page.locator('[data-testid="preview-toggle-side"]').click()
  await expect(page.locator('[data-md-preview] h1')).toHaveText('Heading', { timeout: 10_000 })
}

async function savedSetting(electronApp: ElectronApplication): Promise<boolean | undefined> {
  const userData = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  const p = path.join(userData, 'config', 'config.json')
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')).mdPreviewEdit : undefined
}

const preview = (page: Page) => page.locator('[data-md-preview]')
const blockEditor = (page: Page) => page.locator('[data-testid="md-block-editor"]')
const source = (page: Page) => page.locator('.monaco-editor .view-lines').first()

test.describe('Edit Markdown in preview', () => {
  test('double-click a heading, edit, Enter → source and preview update', async ({ electronApp, page }) => {
    await openPreview(electronApp, page)
    await preview(page).locator('h1').dblclick()
    await expect(blockEditor(page)).toHaveValue('# Heading')

    await blockEditor(page).fill('# Renamed')
    await blockEditor(page).press('Enter')

    await expect(blockEditor(page)).toHaveCount(0)
    await expect(preview(page).locator('h1')).toHaveText('Renamed')
    await expect(source(page)).toContainText('# Renamed')
    await expect(source(page)).toContainText('some text')
  })

  test('double-click a table cell edits its whole row', async ({ electronApp, page }) => {
    await openPreview(electronApp, page)
    await preview(page).locator('td', { hasText: 'apple' }).dblclick()
    await expect(blockEditor(page)).toHaveValue('| apple | 3 |')

    await blockEditor(page).fill('| pear | 5 |')
    await blockEditor(page).press('Enter')

    await expect(preview(page).locator('td').first()).toHaveText('pear')
    await expect(source(page)).toContainText('| pear | 5 |')
  })

  test('Escape cancels without touching the source', async ({ electronApp, page }) => {
    await openPreview(electronApp, page)
    await preview(page).locator('p', { hasText: 'some text' }).dblclick()
    await blockEditor(page).fill('changed')
    await blockEditor(page).press('Escape')

    await expect(blockEditor(page)).toHaveCount(0)
    await expect(preview(page).locator('p', { hasText: 'some text' })).toBeVisible()
    await expect(source(page)).not.toContainText('changed')
  })

  test('setting off → double-click does not open the editor', async ({ electronApp, page }) => {
    const toggle = async (on: boolean): Promise<void> => {
      await page.locator('[data-testid="settings-menu-trigger"]').click()
      await page.locator('[data-testid="settings-menu-settings"]').click()
      await page.locator('[data-testid="settings-category-editor"]').click()
      const box = page.getByRole('checkbox', { name: /Enable MD edit in preview mode/i })
      if (on) await box.check()
      else await box.uncheck()
      // config.json persists across runs and the save is debounced — wait for
      // it to land so a closing app can't leave the other tests with it off.
      await expect.poll(() => savedSetting(electronApp), { timeout: 5_000 }).toBe(on)
    }
    await toggle(false)
    try {
      await openPreview(electronApp, page)
      await preview(page).locator('h1').dblclick()
      await expect(blockEditor(page)).toHaveCount(0)
      await expect(preview(page).locator('[data-md-src]')).toHaveCount(0)
    } finally {
      await toggle(true)
    }
  })
})

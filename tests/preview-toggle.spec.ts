// E2E for the preview toggle buttons on the tab bar (next to "+"): one
// "Preview" (inline — replaces the editor in the current tab) and one "Open
// Preview to the Side". Buttons show only for previewable buffers. We seed a
// markdown buffer via the deeplink:new IPC (fast, no file dialog).

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
    await use(page)
  },
})

async function openMarkdownTab(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('deeplink:new', {
      title: 'notes.md',
      content: '# Heading\n\nsome text\n',
      language: 'markdown',
    })
  })
}

test.describe('Preview toggle buttons (tab bar)', () => {
  test('buttons appear for a markdown buffer; side toggle opens/closes the preview pane', async ({ page, electronApp }) => {
    await openMarkdownTab(electronApp)
    await expect(page.locator('[data-testid="preview-actions"]')).toBeVisible()

    const sideBtn = page.locator('[data-testid="preview-toggle-side"]')
    await sideBtn.click()
    await expect(page.getByText('Markdown Preview')).toBeVisible({ timeout: 10_000 })
    await expect(sideBtn).toHaveAttribute('aria-pressed', 'true')

    await sideBtn.click()
    await expect(page.getByText('Markdown Preview')).toHaveCount(0)
  })

  test('inline toggle replaces the editor in the current tab (not split, not fullscreen)', async ({ page, electronApp }) => {
    await openMarkdownTab(electronApp)
    const inlineBtn = page.locator('[data-testid="preview-toggle-inline"]')
    await inlineBtn.click()

    // Preview shown in place of the editor; the tab bar (and its buttons) remain.
    await expect(page.locator('[data-testid="preview-inline"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Markdown Preview')).toBeVisible()
    await expect(page.locator('[data-testid="preview-actions"]')).toBeVisible()
    await expect(inlineBtn).toHaveAttribute('aria-pressed', 'true')

    // Toggle off → back to the editor.
    await inlineBtn.click()
    await expect(page.locator('[data-testid="preview-inline"]')).toHaveCount(0)
  })

  test('buttons are hidden for a non-previewable (plaintext) buffer', async ({ page, electronApp }) => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('deeplink:new', {
        title: 'plain.txt',
        content: 'just text',
        language: 'plaintext',
      })
    })
    await expect(page.locator('[data-tab-title="plain.txt"]')).toBeVisible()
    await expect(page.locator('[data-testid="preview-actions"]')).toHaveCount(0)
  })
})

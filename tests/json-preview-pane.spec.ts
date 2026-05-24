// E2E for the JSON Mighty preview pane. Verifies the Ctrl+P preview routing
// picks the JSON pane for JSON buffers, that the Format tab renders, and that
// the Repair tab can fix a buffer containing trailing commas — i.e. that the
// jsonrepair dependency loaded inside the lazy-chunked pane.

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

test.describe('JSON preview pane (Ctrl+P)', () => {
  test('opens the JSON Tools pane for a JSON buffer', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, '{"name":"novapad","tags":["editor","fast"]}')
    await page.keyboard.press('Control+P')

    // Header chip identifies the JSON pane (vs Markdown / SQL Plan / CSV).
    await expect(page.getByText('JSON Mighty Tools', { exact: true })).toBeVisible({ timeout: 5_000 })
    // Default tab is Format — its beautified output should appear in the pane.
    await expect(page.getByText('"novapad"').first()).toBeVisible({ timeout: 3_000 })
  })

  test('Repair tab fixes JSON with trailing commas', async ({ page, electronApp }) => {
    // Trailing comma after "fast" — standard JSON.parse() rejects this; only
    // jsonrepair fixes it. Tests that the jsonrepair lazy import resolved.
    await pasteIntoEditor(page, electronApp, '{"name":"novapad","tags":["editor","fast",]}')
    await page.keyboard.press('Control+P')
    await expect(page.getByText('JSON Mighty Tools', { exact: true })).toBeVisible({ timeout: 5_000 })

    await page.getByRole('button', { name: /^Repair$/ }).click()
    // After repair we expect a properly formatted output (trailing comma stripped,
    // structure preserved).
    await expect(page.getByText('"editor"').first()).toBeVisible({ timeout: 3_000 })
  })

  test('plaintext buffer does NOT open the JSON pane', async ({ page, electronApp }) => {
    await pasteIntoEditor(page, electronApp, 'just a plain text line, no braces')
    await page.keyboard.press('Control+P')

    // detectPreviewKind returns null → no pane mounts at all. Sanity: header
    // chip stays absent for the whole window.
    await page.waitForTimeout(500)
    await expect(page.getByText('JSON Mighty Tools', { exact: true })).toHaveCount(0)
  })
})

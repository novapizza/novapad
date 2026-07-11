// E2E for novapad:// deeplink buffers at the renderer layer: inject the
// `deeplink:open` IPC payload (what src/main/deeplink.ts sends after fetch +
// allowlist checks) and verify the read-only remote tab behavior. The OS
// protocol → main-process fetch half needs a packaged install and a live
// server, so it is exercised manually — see .docs/features/deeplink/README.md.

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

const PAYLOAD = {
  fileName: 'report.md',
  content: '# Weekly report\n\nline three\n',
  sourceUrl: 'https://tools.example.com/reports/report.md',
}

async function sendDeeplink(electronApp: ElectronApplication, payload: object): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }, p) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.webContents.send('deeplink:open', p)
  }, payload)
}

async function sendDeeplinkNew(electronApp: ElectronApplication, payload: object): Promise<void> {
  await electronApp.evaluate(({ BrowserWindow }, p) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.webContents.send('deeplink:new', p)
  }, payload)
}

test.describe('Deeplink read-only buffers', () => {
  test('deeplink:open creates a read-only tab with lock icon and statusbar state', async ({ page, electronApp }) => {
    await sendDeeplink(electronApp, PAYLOAD)

    // Tab appears, is active, carries the lock icon and the source URL tooltip.
    const tab = page.locator('[data-tab-title="report.md"]')
    await expect(tab).toBeVisible()
    await expect(tab.locator('[data-testid="tab-readonly-icon"]')).toBeVisible()
    await expect(tab).toHaveAttribute('title', PAYLOAD.sourceUrl)

    // StatusBar reflects the remote source and read-only state.
    await expect(page.locator('[data-testid="statusbar-filepath"]')).toHaveText(PAYLOAD.sourceUrl)
    await expect(page.locator('[data-testid="statusbar-state"]')).toHaveText('Read-only')

    // Editor shows the content and rejects typing (Monaco readOnly).
    await expect(page.locator('.monaco-editor')).toContainText('Weekly report')
    await page.locator('.monaco-editor textarea').first().click({ force: true })
    await page.keyboard.type('SHOULD-NOT-APPEAR')
    await expect(page.locator('.monaco-editor')).not.toContainText('SHOULD-NOT-APPEAR')
    // Buffer stays clean — no dirty marker on the tab.
    await expect(tab).toHaveAttribute('data-tab-dirty', 'false')
  })

  test('same sourceUrl focuses the existing tab instead of duplicating', async ({ page, electronApp }) => {
    await sendDeeplink(electronApp, PAYLOAD)
    await expect(page.locator('[data-tab-title="report.md"]')).toBeVisible()

    // Open another tab so the deeplink one is no longer active…
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('menu:file-new')
    })
    await expect(page.locator('[data-testid="active-tab"]')).not.toHaveAttribute('data-tab-title', 'report.md')

    // …then re-send the same deeplink: still one tab, and it regains focus.
    await sendDeeplink(electronApp, PAYLOAD)
    await expect(page.locator('[data-tab-title="report.md"]')).toHaveCount(1)
    await expect(page.locator('[data-testid="active-tab"]')).toHaveAttribute('data-tab-title', 'report.md')
  })

  test('preview verb opens the markdown preview pane for a .md target', async ({ page, electronApp }) => {
    await sendDeeplink(electronApp, { ...PAYLOAD, preview: true })
    // Read-only tab still appears…
    await expect(page.locator('[data-tab-title="report.md"]')).toBeVisible()
    // …and the Markdown Preview pane is shown alongside it.
    await expect(page.getByText('Markdown Preview')).toBeVisible({ timeout: 10_000 })
  })

  test('new verb creates an editable (non-read-only) tab with inline content', async ({ page, electronApp }) => {
    await sendDeeplinkNew(electronApp, {
      title: 'draft.json',
      content: '{\n  "sent": "from a link"\n}\n',
      language: 'json',
    })

    const tab = page.locator('[data-tab-title="draft.json"]')
    await expect(tab).toBeVisible()
    // Not read-only: no lock icon, and the buffer is dirty (unsaved inline content).
    await expect(tab.locator('[data-testid="tab-readonly-icon"]')).toHaveCount(0)
    await expect(tab).toHaveAttribute('data-tab-dirty', 'true')
    await expect(page.locator('.monaco-editor')).toContainText('from a link')

    // Editable: typing changes the document.
    await page.locator('.monaco-editor textarea').first().click({ force: true })
    await page.keyboard.type('// edited')
    await expect(page.locator('.monaco-editor')).toContainText('// edited')
  })
})

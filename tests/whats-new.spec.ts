import { test, expect } from '@playwright/test'
import { _electron as electron, ElectronApplication } from 'playwright'
import path from 'path'
import { getReleaseNote } from '../src/renderer/src/components/WhatsNewTab/releaseNotes'

/**
 * Tests for the "What's New" virtual tab — Phase 3 (manual open via Help menu).
 *
 * Native menu actions are triggered via app.evaluate() + webContents.send()
 * per the Monaco gotcha noted in CLAUDE.md (clicking native menu items isn't
 * driveable through Playwright; the IPC channel itself is the contract).
 *
 * Phase 3 exercises Tests 1, 2, 7, 8, 11 from
 * .docs/features/whats-new-tab/tests.md. Tests covering the auto-open
 * trigger, focus-no-steal, write-on-fire, and session round-trip live in
 * the Phase 4 spec.
 */

async function launchApp() {
  const app = await electron.launch({
    args: [path.resolve(__dirname, '../out/main/index.js')],
    env: { ...process.env, E2E_TEST: '1', NODE_ENV: 'test' },
    timeout: 15_000,
  })
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('[data-testid="app"]', { timeout: 10_000 })
  return { app, page }
}

async function triggerHelpWhatsNew(app: ElectronApplication) {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.webContents.send('menu:whats-new-open')
  })
}

// Test 1
test("Help → What's New opens the tab in the foreground", async () => {
  const { app, page } = await launchApp()
  try {
    await triggerHelpWhatsNew(app)
    // Tab appears in the bar with the right kind and title
    await expect(page.locator('[data-tab-kind="whatsNew"]')).toBeVisible()
    await expect(page.locator(`[data-tab-title="What's New"]`)).toBeVisible()
    // Foreground (active): the tab body component is mounted
    await expect(page.locator('[data-testid="whatsnew-tab"]')).toBeVisible()
  } finally {
    await app.close()
  }
})

// Test 2
test("Help → What's New dedupes — second click does not duplicate", async () => {
  const { app, page } = await launchApp()
  try {
    await triggerHelpWhatsNew(app)
    await expect(page.locator('[data-tab-kind="whatsNew"]')).toHaveCount(1)
    await triggerHelpWhatsNew(app)
    await expect(page.locator('[data-tab-kind="whatsNew"]')).toHaveCount(1)
  } finally {
    await app.close()
  }
})

// Test 7
test('What\'s New tab title is the static string "What\'s New"', async () => {
  const { app, page } = await launchApp()
  try {
    await triggerHelpWhatsNew(app)
    const titleAttr = await page
      .locator('[data-tab-kind="whatsNew"]')
      .first()
      .getAttribute('data-tab-title')
    expect(titleAttr).toBe("What's New")
    // Ensure no version stamping or other dynamic suffix has crept in
    expect(titleAttr).not.toMatch(/\d/)
  } finally {
    await app.close()
  }
})

// Test 8
test("What's New tab body renders the current release notes", async () => {
  const { app, page } = await launchApp()
  try {
    await triggerHelpWhatsNew(app)
    const body = page.locator('[data-testid="whatsnew-tab"]')
    await expect(body).toBeVisible()
    // Both headings (h2 tab title + h3 release-list subheading) read "What's New"
    await expect(body.getByRole('heading', { name: "What's New" })).toHaveCount(2)
    // Release header reflects the live app version (rendered as "vX.Y.Z")
    const appVersion = await app.evaluate(({ app }) => app.getVersion())
    await expect(body.getByText(`v${appVersion}`)).toBeVisible()
    // The tab resolves its content through getReleaseNote(appVersion) — assert
    // against the same map so this test stays green across releases instead of
    // hardcoding labels from whichever version was current when it was written.
    const note = getReleaseNote(appVersion)
    expect(note).toBeDefined()
    expect(note!.highlights.length).toBeGreaterThan(0)
    for (const item of note!.highlights) {
      await expect(body.getByText(`${item.title}:`)).toBeVisible()
    }
  } finally {
    await app.close()
  }
})

// Test 11
test('Help menu entry "What\'s New" is positioned above About', async () => {
  const { app } = await launchApp()
  try {
    const helpItems = await app.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()
      if (!menu) return null
      // Help label is "&Help" in source; Electron may strip the mnemonic.
      const helpItem = menu.items.find(
        (i) => i.label === '&Help' || i.label === 'Help'
      )
      const submenu = helpItem?.submenu
      if (!submenu) return null
      return submenu.items.map((i) => ({
        label: i.label,
        type: i.type,
        accelerator: i.accelerator ?? null,
        visible: i.visible,
      }))
    })

    expect(helpItems).not.toBeNull()
    expect(helpItems!.length).toBeGreaterThan(0)

    // First item must be "What's New" with no accelerator
    expect(helpItems![0].label).toBe("What's New")
    expect(helpItems![0].accelerator).toBeNull()

    // On Win/Linux the second item is "About NovaPad"; on macOS About lives
    // in the App menu so the second item is the separator.
    const isMac = process.platform === 'darwin'
    if (isMac) {
      expect(helpItems![1].type).toBe('separator')
    } else {
      expect(helpItems![1].label).toBe('About NovaPad')
    }
  } finally {
    await app.close()
  }
})

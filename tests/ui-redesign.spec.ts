// spec: NovaPad UI Refactor — Tailwind + Shadcn/ui design
// Replaces: old Material Design 3 teal theme tests
// seed: tests/seed.spec.ts

import { test as base, expect } from './fixtures'
import { _electron as electron, ElectronApplication } from 'playwright'
import path from 'path'

const test = base.extend<{ electronApp: ElectronApplication }>({
  electronApp: async ({}, use) => {
    const app = await electron.launch({
      args: [path.resolve(__dirname, '../out/main/index.js')],
      env: { ...process.env, E2E_TEST: '1', NODE_ENV: 'test' },
      timeout: 15_000,
    })
    await use(app)
    await app.close()
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForSelector('[data-testid="app"]', { timeout: 10_000 })
    await page.waitForSelector('.monaco-editor textarea', { timeout: 10_000 })
    await page.waitForSelector('[data-testid="tabbar"] [data-tab-title]', { timeout: 5_000 })
    await use(page)
  },
})

async function sendIPC(electronApp: ElectronApplication, channel: string, ...args: unknown[]) {
  await electronApp.evaluate(
    ({ BrowserWindow }, { ch, a }) =>
      BrowserWindow.getAllWindows()[0].webContents.send(ch, ...(a as unknown[])),
    { ch: channel, a: args }
  )
}

// ─── 1. MenuBar ──────────────────────────────────────────────────────────────

test.describe('1. MenuBar', () => {

  test('1.1 MenuBar renders and is visible on startup', async ({ page }) => {
    await expect(page.locator('[data-testid="menubar"]')).toBeVisible()
  })

  test('1.2 MenuBar does not display the NovaPad brand badge on Windows/Linux', async ({ page }) => {
    const menubar = page.locator('[data-testid="menubar"]')
    await expect(menubar.getByText('NovaPad')).toHaveCount(0)
    await expect(menubar.getByText('N+')).toHaveCount(0)
  })

  test('1.3 MenuBar has File, Edit, Search, View menu buttons', async ({ page }) => {
    const menubar = page.locator('[data-testid="menubar"]')
    await expect(menubar.getByText('File', { exact: true })).toBeVisible()
    await expect(menubar.getByText('Edit', { exact: true })).toBeVisible()
    await expect(menubar.getByText('Search', { exact: true })).toBeVisible()
    await expect(menubar.getByText('View', { exact: true })).toBeVisible()
  })

  test('1.4 MenuBar File dropdown opens on click and shows menu items', async ({ page }) => {
    await page.locator('[data-testid="menubar"]').getByText('File', { exact: true }).click()
    await page.waitForTimeout(200)
    await expect(page.getByText('New File')).toBeVisible()
    await expect(page.getByText('Save')).toBeVisible()
    await expect(page.getByText('Close File')).toBeVisible()
  })

  test('1.5 MenuBar File > New File creates a new tab', async ({ page }) => {
    const before = await page.locator('[data-tab-title]').count()
    await page.locator('[data-testid="menubar"]').getByText('File', { exact: true }).click()
    await page.waitForTimeout(200)
    await page.getByText('New File').click()
    await expect(page.locator('[data-tab-title]')).toHaveCount(before + 1)
  })

  test('1.6 MenuBar dropdown closes on outside click', async ({ page }) => {
    await page.locator('[data-testid="menubar"]').getByText('File', { exact: true }).click()
    await page.waitForTimeout(200)
    await expect(page.getByText('New File')).toBeVisible()
    // Click outside
    await page.locator('[data-testid="app"]').click({ position: { x: 400, y: 300 } })
    await page.waitForTimeout(200)
    await expect(page.getByText('New File')).not.toBeVisible()
  })

  test('1.7 MenuBar right-side icons are visible (Search, Explorer toggle, Theme toggle)', async ({ page }) => {
    const menubar = page.locator('[data-testid="menubar"]')
    // At least 3 icon buttons in the right section
    const buttons = menubar.locator('button')
    const count = await buttons.count()
    expect(count).toBeGreaterThanOrEqual(7) // 4 menu buttons + 3 icon buttons
  })

})

// ─── 2. Toolbar ──────────────────────────────────────────────────────────────

test.describe('2. Toolbar', () => {

  test('2.1 Toolbar renders and is visible on startup', async ({ page }) => {
    await expect(page.locator('[data-testid="toolbar"]')).toBeVisible()
  })

  test('2.2 Toolbar has compact 30px height', async ({ page }) => {
    const height = await page.evaluate(() =>
      document.querySelector('[data-testid="toolbar"]')!.getBoundingClientRect().height
    )
    expect(height).toBe(30)
  })

  test('2.3 Toolbar is hidden when toggled off via IPC', async ({ electronApp, page }) => {
    await expect(page.locator('[data-testid="toolbar"]')).toBeVisible()
    await sendIPC(electronApp, 'ui:toggle-toolbar', false)
    await page.locator('[data-testid="toolbar"]').waitFor({ state: 'hidden', timeout: 2_000 })
    await expect(page.locator('[data-testid="toolbar"]')).not.toBeVisible()
    // Restore
    await sendIPC(electronApp, 'ui:toggle-toolbar', true)
    await page.locator('[data-testid="toolbar"]').waitFor({ state: 'visible', timeout: 2_000 })
  })

  test('2.4 Toolbar has icon button groups separated by dividers', async ({ page }) => {
    // Toolbar should have multiple button groups
    const buttons = page.locator('[data-testid="toolbar"] button')
    const count = await buttons.count()
    expect(count).toBeGreaterThanOrEqual(10) // Multiple icon buttons across groups
  })

})

// ─── 3. SideNav ──────────────────────────────────────────────────────────────

test.describe('3. SideNav', () => {

  test('3.1 SideNav renders and is 48px wide', async ({ page }) => {
    await expect(page.locator('[data-testid="sidenav"]')).toBeVisible()
    const width = await page.evaluate(() =>
      document.querySelector('[data-testid="sidenav"]')!.getBoundingClientRect().width
    )
    expect(width).toBe(48)
  })

  test('3.2 SideNav Files button opens the Sidebar', async ({ page }) => {
    await expect(page.locator('[data-testid="sidebar"]')).not.toBeVisible()
    // Click first nav button (Files)
    await page.locator('[data-testid="sidenav"] button').first().click()
    await page.locator('[data-testid="sidebar"]').waitFor({ state: 'visible', timeout: 2_000 })
    await expect(page.locator('[data-testid="sidebar"]')).toBeVisible()
  })

  test('3.3 SideNav Files button toggles Sidebar closed on second click', async ({ page }) => {
    await page.locator('[data-testid="sidenav"] button').first().click()
    await page.locator('[data-testid="sidebar"]').waitFor({ state: 'visible', timeout: 2_000 })
    await page.locator('[data-testid="sidenav"] button').first().click()
    await page.locator('[data-testid="sidebar"]').waitFor({ state: 'hidden', timeout: 2_000 })
    await expect(page.locator('[data-testid="sidebar"]')).not.toBeVisible()
  })

  test('3.4 SideNav active button has primary accent border-left', async ({ page }) => {
    await page.locator('[data-testid="sidenav"] button').first().click()
    await page.locator('[data-testid="sidebar"]').waitFor({ state: 'visible', timeout: 2_000 })
    await page.waitForTimeout(200)

    const borderColor = await page.evaluate(() => {
      const sidenav = document.querySelector('[data-testid="sidenav"]')!
      const firstBtn = sidenav.querySelector('button') as HTMLElement
      return getComputedStyle(firstBtn).borderLeftColor
    })
    // Should be the primary blue color (not transparent)
    expect(borderColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(borderColor).not.toBe('transparent')
  })

  test('3.5 SideNav Settings button opens Preferences dialog', async ({ page }) => {
    // Settings is the last button (in the footer)
    const buttons = page.locator('[data-testid="sidenav"] button')
    const count = await buttons.count()
    await buttons.nth(count - 1).click()
    await page.waitForTimeout(300)
    await expect(page.getByText('Preferences').first()).toBeVisible({ timeout: 2_000 })
  })

})

// ─── 4. Sidebar ──────────────────────────────────────────────────────────────

test.describe('4. Sidebar', () => {

  test('4.1 Sidebar is hidden on fresh startup', async ({ page }) => {
    await expect(page.locator('[data-testid="sidebar"]')).not.toBeVisible()
  })

  test('4.2 Sidebar header shows panel title in uppercase', async ({ page }) => {
    await page.locator('[data-testid="sidenav"] button').first().click()
    await page.locator('[data-testid="sidebar"]').waitFor({ state: 'visible', timeout: 2_000 })
    await expect(
      page.locator('[data-testid="sidebar"]').locator('*').filter({ hasText: /file browser/i }).first()
    ).toBeVisible()
  })

  test('4.3 Sidebar close button hides the sidebar', async ({ page }) => {
    await page.locator('[data-testid="sidenav"] button').first().click()
    await page.locator('[data-testid="sidebar"]').waitFor({ state: 'visible', timeout: 2_000 })
    // Close button is an X icon in sidebar header
    await page.locator('[data-testid="sidebar"] button').first().click()
    await page.locator('[data-testid="sidebar"]').waitFor({ state: 'hidden', timeout: 2_000 })
    await expect(page.locator('[data-testid="sidebar"]')).not.toBeVisible()
  })

  test('4.4 Sidebar is resizable via drag handle', async ({ page }) => {
    await page.locator('[data-testid="sidenav"] button').first().click()
    await page.locator('[data-testid="sidebar"]').waitFor({ state: 'visible', timeout: 2_000 })
    const initialWidth = await page.evaluate(() =>
      document.querySelector('[data-testid="sidebar"]')!.getBoundingClientRect().width
    )
    const resizeHandle = page.locator('[data-panel-resize-handle-id]').first()
    await expect(resizeHandle).toBeVisible({ timeout: 2_000 })
    const handleBox = await resizeHandle.boundingBox()
    if (handleBox) {
      const cx = handleBox.x + handleBox.width / 2
      const cy = handleBox.y + handleBox.height / 2
      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx - 60, cy, { steps: 10 })
      await page.mouse.up()
      await page.waitForTimeout(200)
      const newWidth = await page.evaluate(() =>
        document.querySelector('[data-testid="sidebar"]')!.getBoundingClientRect().width
      )
      expect(newWidth).toBeGreaterThan(initialWidth + 20)
    }
  })

  test('4.5 Sidebar hidden when toggled off via IPC', async ({ electronApp, page }) => {
    await page.locator('[data-testid="sidenav"] button').first().click()
    await page.locator('[data-testid="sidebar"]').waitFor({ state: 'visible', timeout: 2_000 })
    await sendIPC(electronApp, 'ui:toggle-sidebar', false)
    await page.locator('[data-testid="sidebar"]').waitFor({ state: 'hidden', timeout: 2_000 })
    await expect(page.locator('[data-testid="sidebar"]')).not.toBeVisible()
  })

})

// ─── 5. StatusBar ────────────────────────────────────────────────────────────

test.describe('5. StatusBar', () => {

  test('5.1 StatusBar renders and is visible on startup', async ({ page }) => {
    await expect(page.locator('[data-testid="statusbar"]')).toBeVisible()
  })

  test('5.2 StatusBar has compact 24px height', async ({ page }) => {
    const height = await page.evaluate(() =>
      document.querySelector('[data-testid="statusbar"]')!.getBoundingClientRect().height
    )
    expect(height).toBe(24)
  })

  test('5.3 StatusBar cursor position shows "Ln 1, Col 1" on fresh buffer', async ({ page }) => {
    await expect(page.locator('[data-testid="cursor-position"]')).toContainText('Ln 1, Col 1')
  })

  test('5.4 StatusBar cursor position updates when typing', async ({ page }) => {
    await page.locator('.monaco-editor textarea').first().click({ force: true })
    await page.waitForTimeout(200)
    await page.keyboard.press('Escape')
    await page.keyboard.type('Hello')
    await page.keyboard.press('Enter')
    await page.keyboard.type('World')
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="cursor-position"]')).toContainText('Ln 2, Col 6')
  })

  test('5.5 StatusBar shows EOL as "LF" by default', async ({ page }) => {
    await expect(page.locator('[data-testid="statusbar"]')).toContainText('LF')
  })

  test('5.6 StatusBar EOL cycles from LF to CRLF on click', async ({ page }) => {
    const eolSpan = page.locator('[data-testid="statusbar"] span[title="Click to cycle EOL type"]')
    await expect(eolSpan).toContainText('LF')
    await eolSpan.click()
    await page.waitForTimeout(200)
    await expect(eolSpan).toContainText('CRLF')
  })

  test('5.7 StatusBar shows encoding as "UTF-8" by default', async ({ page }) => {
    await expect(page.locator('[data-testid="statusbar"]')).toContainText('UTF-8')
  })

  test('5.8 StatusBar encoding cycles on click', async ({ page }) => {
    const encodingSpan = page.locator('[data-testid="statusbar"] span[title="Click to cycle encoding"]')
    await expect(encodingSpan).toContainText('UTF-8')
    await encodingSpan.click()
    await page.waitForTimeout(200)
    await expect(encodingSpan).toContainText('UTF-8 BOM')
  })

  test('5.9 StatusBar shows language "plaintext" for new buffer', async ({ page }) => {
    await expect(page.locator('[data-testid="statusbar"]')).toContainText('plaintext')
  })

  test('5.10 StatusBar shows "New File" for unsaved untitled buffer', async ({ page }) => {
    await expect(page.locator('[data-testid="statusbar"]')).toContainText('New File')
  })

  test('5.11 StatusBar shows "Modified" after typing', async ({ page }) => {
    await page.locator('.monaco-editor textarea').first().click({ force: true })
    await page.waitForTimeout(200)
    await page.keyboard.press('Escape')
    await page.keyboard.type('x')
    await page.waitForTimeout(300)
    await expect(page.locator('[data-testid="statusbar"]')).toContainText('Modified')
  })

  test('5.12 StatusBar is hidden when toggled off via IPC', async ({ electronApp, page }) => {
    await expect(page.locator('[data-testid="statusbar"]')).toBeVisible()
    await sendIPC(electronApp, 'ui:toggle-statusbar', false)
    await page.locator('[data-testid="statusbar"]').waitFor({ state: 'hidden', timeout: 2_000 })
    await expect(page.locator('[data-testid="statusbar"]')).not.toBeVisible()
    await sendIPC(electronApp, 'ui:toggle-statusbar', true)
    await page.locator('[data-testid="statusbar"]').waitFor({ state: 'visible', timeout: 2_000 })
  })

})

// ─── 6. Tailwind HSL Theme Variables ─────────────────────────────────────────

test.describe('6. Tailwind HSL Theme Variables', () => {

  test('6.1 Root has --background CSS variable defined (HSL format)', async ({ page }) => {
    const value = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
    )
    // Should be HSL values like "220 16% 12%"
    expect(value).toMatch(/\d+\s+\d+%\s+\d+%/)
  })

  test('6.2 Root has --primary CSS variable defined', async ({ page }) => {
    const value = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
    )
    expect(value).toMatch(/\d+\s+\d+%\s+\d+%/)
  })

  test('6.3 html element has "dark" class on startup', async ({ page }) => {
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark')
    )
    expect(hasDark).toBe(true)
  })

  test('6.4 Theme toggle via IPC switches between dark and light', async ({ electronApp, page }) => {
    // Start in dark
    let hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(hasDark).toBe(true)

    // Toggle to light
    await sendIPC(electronApp, 'ui:toggle-theme')
    await page.waitForTimeout(300)
    hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(hasDark).toBe(false)

    // Toggle back to dark
    await sendIPC(electronApp, 'ui:toggle-theme')
    await page.waitForTimeout(300)
    hasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    expect(hasDark).toBe(true)
  })

  test('6.5 No data-theme attribute on html element', async ({ page }) => {
    const dataTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme')
    )
    expect(dataTheme).toBeNull()
  })

})

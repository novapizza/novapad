import { test, expect, sendIPC } from '../fixtures'

/**
 * Native menu <-> renderer state sync (specs/menu-consolidation.md suite 6, plus the Explorer
 * toggle from the former quickstrip.spec.ts). Native menu items fire IPC; renderer toggles report
 * back over `ui:state-changed` so the native checkbox follows.
 */

test('native toggle IPCs show and hide chrome and switch theme', async ({ electronApp, page }) => {
  const toolbar = page.getByTestId('toolbar')
  const statusbar = page.getByTestId('statusbar')
  const sidebar = page.getByTestId('sidebar')
  const html = page.locator('html')

  await test.step("'ui:toggle-toolbar' hides and restores the toolbar", async () => {
    await expect(toolbar).toBeVisible()
    await sendIPC(electronApp, 'ui:toggle-toolbar', false)
    await expect(toolbar).not.toBeVisible()
    await sendIPC(electronApp, 'ui:toggle-toolbar', true)
    await expect(toolbar).toBeVisible()
  })

  await test.step("'ui:toggle-statusbar' hides and restores the status bar", async () => {
    await expect(statusbar).toBeVisible()
    await sendIPC(electronApp, 'ui:toggle-statusbar', false)
    await expect(statusbar).not.toBeVisible()
    await sendIPC(electronApp, 'ui:toggle-statusbar', true)
    await expect(statusbar).toBeVisible()
  })

  await test.step("'ui:toggle-sidebar' shows and hides the sidebar", async () => {
    await expect(sidebar).not.toBeVisible()
    await sendIPC(electronApp, 'ui:toggle-sidebar', true)
    await expect(sidebar).toBeVisible()
    await sendIPC(electronApp, 'ui:toggle-sidebar', false)
    await expect(sidebar).not.toBeVisible()
  })

  await test.step("app starts dark; 'ui:toggle-theme' flips to light and back", async () => {
    await expect(html).toHaveClass(/\bdark\b/)
    await sendIPC(electronApp, 'ui:toggle-theme')
    await expect(html).not.toHaveClass(/\bdark\b/)
    await sendIPC(electronApp, 'ui:toggle-theme')
    await expect(html).toHaveClass(/\bdark\b/)
  })
})

test('Explorer toggle button syncs the native "toggle-sidebar" checkbox', async ({ electronApp, page }) => {
  // QuickStrip on macOS, MenuBar elsewhere — both render this button with the same titles.
  const toggle = page.getByTitle(/^(Show|Hide) Explorer$/)
  const sidebar = page.getByTestId('sidebar')
  const nativeChecked = () =>
    electronApp.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('toggle-sidebar')?.checked)

  await test.step('opens the sidebar; title flips Show -> Hide', async () => {
    await expect(toggle).toHaveAttribute('title', 'Show Explorer')
    await toggle.click()
    await expect(sidebar).toBeVisible()
    await expect(toggle).toHaveAttribute('title', 'Hide Explorer')
  })

  await test.step('closing it unchecks the native item', async () => {
    await toggle.click()
    await expect(sidebar).not.toBeVisible()
    await expect(toggle).toHaveAttribute('title', 'Show Explorer')
    await expect.poll(nativeChecked).toBe(false)
  })

  await test.step('reopening it checks the native item', async () => {
    await toggle.click()
    await expect(sidebar).toBeVisible()
    await expect.poll(nativeChecked).toBe(true)
  })
})

test('menu IPCs open Find & Replace on the right tab, and About', async ({ electronApp, page }) => {
  const dialog = page.locator('.fixed.z-\\[9001\\]')
  const title = page.getByText('Find & Replace')
  const tab = (name: RegExp) => dialog.locator('button').filter({ hasText: name }).first()

  await test.step("'menu:find' opens it on the Find tab; Escape closes it", async () => {
    await sendIPC(electronApp, 'menu:find')
    await expect(title).toBeVisible()
    await expect(tab(/^Find$/)).toHaveClass(/text-primary/)
    await page.keyboard.press('Escape')
    await expect(title).not.toBeVisible()
  })

  await test.step("'menu:replace' opens it on the Replace tab; the close button dismisses it", async () => {
    await sendIPC(electronApp, 'menu:replace')
    await expect(title).toBeVisible()
    await expect(tab(/^Replace$/)).toHaveClass(/text-primary/)
    await page.getByTitle('Close (Esc)').click()
    await expect(title).not.toBeVisible()
  })

  await test.step("'menu:find-in-files' opens it on the Find in Files tab", async () => {
    await sendIPC(electronApp, 'menu:find-in-files')
    await expect(title).toBeVisible()
    await expect(tab(/^Find in Files$/)).toHaveClass(/text-primary/)
    await page.keyboard.press('Escape')
    await expect(title).not.toBeVisible()
  })

  await test.step("'menu:about' opens the About dialog with a version", async () => {
    await sendIPC(electronApp, 'menu:about')
    await expect(page.getByText(/Version \d+\.\d+/)).toBeVisible()
  })
})

test("'menu:file-new', 'tab:prev' and 'tab:next' IPCs create and switch tabs", async ({ electronApp, page }) => {
  const tabs = page.locator('[data-tab-title]')
  const active = page.getByTestId('active-tab')
  let firstTitle: string | null = null
  let secondTitle: string | null = null

  await test.step("'menu:file-new' adds a tab and activates it", async () => {
    await expect(tabs).toHaveCount(1)
    firstTitle = await active.getAttribute('data-tab-title')
    await sendIPC(electronApp, 'menu:file-new')
    await expect(tabs).toHaveCount(2)
    await expect(active).not.toHaveAttribute('data-tab-title', firstTitle!)
    secondTitle = await active.getAttribute('data-tab-title')
  })

  await test.step("'tab:prev' activates the first tab", async () => {
    await sendIPC(electronApp, 'tab:prev')
    await expect(active).toHaveAttribute('data-tab-title', firstTitle!)
  })

  await test.step("'tab:next' activates the second tab again", async () => {
    await sendIPC(electronApp, 'tab:next')
    await expect(active).toHaveAttribute('data-tab-title', secondTitle!)
  })
})

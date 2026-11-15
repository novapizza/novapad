import { test, expect, sendIPC } from './fixtures'

/**
 * Settings as a virtual tab: reached from the gear menu (all platforms) or the native
 * `menu:settings-open` / `menu:shortcuts-open` IPCs (what Cmd/Ctrl+, and Settings ▸ Keyboard
 * Shortcuts dispatch — page.keyboard cannot reach native accelerators).
 */

test('Settings tab opens, dedupes, never gets dirty, closes, and deep-links to shortcuts', async ({
  electronApp,
  page,
}) => {
  const settingsTab = page.locator('[data-tab-kind="settings"]')
  const openFromGear = async () => {
    await page.getByTestId('settings-menu-trigger').click()
    await page.getByTestId('settings-menu-settings').click()
  }

  await test.step('gear > Settings opens the Settings tab', async () => {
    await openFromGear()
    await expect(page.getByTestId('settings-tab')).toBeVisible()
    await expect(settingsTab).toHaveAttribute('data-tab-title', 'Settings')
  })

  await test.step('opening it again does not duplicate the tab', async () => {
    await openFromGear()
    await expect(settingsTab).toHaveCount(1)
  })

  await test.step('it never shows a dirty dot', async () => {
    await expect(settingsTab).toHaveAttribute('data-tab-dirty', 'false')
  })

  await test.step('it closes like a file tab', async () => {
    await settingsTab.hover()
    await settingsTab.locator('button').click()
    await expect(settingsTab).toHaveCount(0)
  })

  await test.step("'menu:settings-open' IPC opens it", async () => {
    await sendIPC(electronApp, 'menu:settings-open')
    await expect(page.getByTestId('settings-tab')).toBeVisible()
  })

  await test.step("'menu:shortcuts-open' IPC opens it at the Keyboard Shortcuts category", async () => {
    await page.getByTestId('settings-category-general').click()
    await expect(page.getByTestId('settings-category-shortcuts')).not.toHaveClass(/text-primary/)
    await sendIPC(electronApp, 'menu:shortcuts-open')
    await expect(page.getByTestId('settings-category-shortcuts')).toHaveClass(/text-primary/)
    await expect(settingsTab).toHaveCount(1)
  })
})

import { test, expect, IS_MAC } from '../fixtures'

/**
 * Platform shell (specs/menu-consolidation.md suite 1): macOS gets the native menu plus the
 * QuickStrip row; Windows/Linux get the custom MenuBar and no QuickStrip.
 */
test.use({ app: { seedBuffer: false } })

test('renders the platform-appropriate title row', async ({ electronApp, page }) => {
  await test.step(IS_MAC ? 'macOS: no MenuBar, QuickStrip with Explorer toggle' : 'Win/Linux: MenuBar, no QuickStrip', async () => {
    if (IS_MAC) {
      await expect(page.getByTestId('menubar')).toHaveCount(0)
      await expect(page.getByTestId('quickstrip')).toBeVisible()
      await expect(page.getByTestId('quickstrip-sidebar')).toBeVisible()
    } else {
      await expect(page.getByTestId('menubar')).toBeVisible()
      await expect(page.getByTestId('quickstrip')).toHaveCount(0)
    }
  })

  await test.step('autoHideMenuBar is off (Alt must not toggle the native bar)', async () => {
    const autoHide = await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.autoHideMenuBar)
    expect(autoHide).toBe(false)
  })
})

import { test, expect, IS_MAC } from './fixtures'

// Smoke test: the app shell renders with one Untitled tab and nothing else open.
test('app launches with the editor ready and side panels hidden', async ({ page }) => {
  for (const id of ['app', 'toolbar', 'tabbar', 'editor-pane', 'statusbar']) {
    await expect(page.getByTestId(id)).toBeVisible()
  }
  // The in-window MenuBar is Windows/Linux only; macOS uses the native menu.
  if (IS_MAC) await expect(page.getByTestId('menubar')).toHaveCount(0)
  else await expect(page.getByTestId('menubar')).toBeVisible()

  await expect(page.locator('.monaco-editor')).toBeVisible()
  await expect(page.locator('[data-tab-title="new 1"]')).toBeVisible()
  await expect(page.getByTestId('cursor-position')).toContainText('Ln 1, Col 1')
  await expect(page.getByTestId('sidebar')).not.toBeVisible()
  await expect(page.getByTestId('bottom-panel')).not.toBeVisible()
})

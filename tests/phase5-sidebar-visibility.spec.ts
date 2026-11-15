// Sidebar visibility driven by the native View ▸ Sidebar menu item (`ui:toggle-sidebar`).
// Default-hidden and the header close button are covered by ui-redesign.spec.ts.

import { test, expect, sendIPC } from './fixtures'

test('ui:toggle-sidebar shows and hides the sidebar', async ({ electronApp, page }) => {
  const sidebar = page.locator('[data-testid="sidebar"]')

  await test.step('true shows the sidebar on the File Browser panel', async () => {
    await sendIPC(electronApp, 'ui:toggle-sidebar', true)
    await expect(sidebar).toBeVisible({ timeout: 2_000 })
    await expect(sidebar.getByText('File Browser', { exact: true })).toBeVisible()
    await expect(sidebar.getByRole('button', { name: 'Open Folder…' })).toBeVisible()
  })

  await test.step('false hides it again', async () => {
    await sendIPC(electronApp, 'ui:toggle-sidebar', false)
    await expect(sidebar).toBeHidden({ timeout: 2_000 })
  })
})

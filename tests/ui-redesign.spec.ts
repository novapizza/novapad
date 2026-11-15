import { test, expect, IS_MAC } from './fixtures'

/**
 * Nova Suite chrome: custom MenuBar (Win/Linux), Explorer sidebar, StatusBar.
 * Shell presence (menubar/toolbar/statusbar visible, sidebar hidden, "Ln 1, Col 1") is in seed.spec.ts;
 * native toggle IPCs and theme toggling are in menu-consolidation/bidirectional-sync.spec.ts.
 */

test('MenuBar opens dropdowns and runs items', async ({ page }) => {
  test.skip(IS_MAC, 'MenuBar is not rendered on macOS (native menu)')
  const menubar = page.getByTestId('menubar')
  const newFile = page.getByRole('button', { name: /^New File/ })

  await test.step('shows File, Edit, Search, View', async () => {
    for (const name of ['File', 'Edit', 'Search', 'View']) {
      await expect(menubar.getByText(name, { exact: true })).toBeVisible()
    }
  })

  await test.step('File dropdown opens on click and lists items', async () => {
    await menubar.getByText('File', { exact: true }).click()
    await expect(newFile).toBeVisible()
    await expect(page.getByRole('button', { name: /^Save Ctrl/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Close File/ })).toBeVisible()
  })

  await test.step('dropdown closes on outside click', async () => {
    await page.getByTestId('app').click({ position: { x: 400, y: 300 } })
    await expect(newFile).not.toBeVisible()
  })

  await test.step('File > New File creates a new tab', async () => {
    const tabs = page.locator('[data-tab-title]')
    const before = await tabs.count()
    await menubar.getByText('File', { exact: true }).click()
    await newFile.click()
    await expect(tabs).toHaveCount(before + 1)
  })
})

test('Explorer sidebar opens, closes and resizes', async ({ page }) => {
  const sidebar = page.getByTestId('sidebar')
  const explorerBtn = page.getByTestId('toolbar').getByRole('button', { name: /^Explorer/ })

  await test.step('toolbar Explorer button opens the sidebar on the File Browser panel', async () => {
    await expect(sidebar).not.toBeVisible()
    await explorerBtn.click()
    await expect(sidebar).toBeVisible()
    await expect(sidebar.getByText('File Browser', { exact: true })).toBeVisible()
  })

  await test.step('a second click closes it', async () => {
    await explorerBtn.click()
    await expect(sidebar).not.toBeVisible()
  })

  await test.step('the header close button hides it', async () => {
    await explorerBtn.click()
    await expect(sidebar).toBeVisible()
    await sidebar.locator('button').first().click()
    await expect(sidebar).not.toBeVisible()
  })

  await test.step('dragging the resize handle widens it', async () => {
    await explorerBtn.click()
    await expect(sidebar).toBeVisible()
    const initialWidth = (await sidebar.boundingBox())!.width
    const handle = page.locator('[data-panel-resize-handle-id="sidebar-resize"]')
    const box = (await handle.boundingBox())!
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx + 80, cy, { steps: 10 })
    await page.mouse.up()
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(initialWidth + 20)
  })
})

test('StatusBar reflects the active buffer', async ({ page }) => {
  const statusbar = page.getByTestId('statusbar')

  await test.step('fresh Untitled buffer: LF, UTF-8, Plain Text, New File', async () => {
    await expect(page.getByTestId('statusbar-eol')).toHaveText('LF')
    await expect(page.getByTestId('statusbar-encoding')).toHaveText('UTF-8')
    await expect(page.getByTestId('statusbar-language')).toHaveText('Plain Text')
    await expect(page.getByTestId('statusbar-state')).toHaveText('New File')
  })

  await test.step('cursor position follows typing', async () => {
    await page.locator('.monaco-editor textarea').first().focus()
    await page.keyboard.type('Hello')
    await page.keyboard.press('Enter')
    await page.keyboard.type('World')
    await expect(page.getByTestId('cursor-position')).toHaveText('Ln 2, Col 6')
  })

  await test.step('shows "Modified" after typing', async () => {
    await expect(page.getByTestId('statusbar-state')).toHaveText('Modified')
  })

  await test.step('clicking EOL opens a QuickPick that changes it', async () => {
    await page.getByTestId('statusbar-eol').click()
    const input = page.getByTestId('quickpick-input')
    await expect(input).toHaveAttribute('placeholder', 'Select End of Line Sequence')
    await input.fill('CRLF')
    await input.press('Enter')
    await expect(page.getByTestId('quickpick')).toHaveCount(0)
    await expect(page.getByTestId('statusbar-eol')).toHaveText('CRLF')
  })

  await test.step('clicking encoding opens the "Select Encoding" QuickPick; Escape closes it', async () => {
    await page.getByTestId('statusbar-encoding').click()
    await expect(page.getByTestId('quickpick-input')).toHaveAttribute('placeholder', 'Select Encoding')
    await page.getByTestId('quickpick-input').press('Escape')
    await expect(page.getByTestId('quickpick')).toHaveCount(0)
    await expect(statusbar).toContainText('UTF-8')
  })
})

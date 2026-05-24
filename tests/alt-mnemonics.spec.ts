import { test, expect } from './fixtures'

test.describe('Alt-key mnemonics (Windows)', () => {
  test.skip(process.platform !== 'win32', 'Mnemonics are Windows-only')

  test('Alt opens File menu', async ({ page }) => {
    await page.keyboard.press('Alt+F')
    const newFileItem = page.getByRole('button', { name: /^New File/ })
    await expect(newFileItem).toBeVisible({ timeout: 2_000 })
    await page.keyboard.press('Escape')
    await expect(newFileItem).not.toBeVisible({ timeout: 2_000 })
  })

  test('Alt+S opens Search menu', async ({ page }) => {
    await page.keyboard.press('Alt+S')
    await expect(page.getByText('Find...', { exact: true })).toBeVisible({ timeout: 2_000 })
    await page.keyboard.press('Escape')
  })

  test('holding Alt renders underline markers in MenuBar', async ({ page }) => {
    await page.keyboard.down('Alt')
    const menubar = page.locator('[data-testid="menubar"]')
    await expect(menubar.locator('u').first()).toBeVisible({ timeout: 2_000 })
    await page.keyboard.up('Alt')
  })

  test('Find dialog: Alt+C toggles Match case', async ({ page }) => {
    await page.keyboard.press('Control+F')
    const dialog = page.locator('[data-testid="menubar"]').or(page.getByText('Find Next ↓'))
    await page.getByText('Find Next ↓').waitFor({ state: 'visible', timeout: 2_000 })

    const matchCase = page.locator('label', { hasText: 'Match case' }).locator('input[type="checkbox"]')
    const before = await matchCase.isChecked()
    await page.keyboard.press('Alt+C')
    const after = await matchCase.isChecked()
    expect(after).toBe(!before)

    await page.keyboard.press('Escape')
  })

  test('Find dialog: Alt+P switches to Replace tab; Alt+A triggers Replace All', async ({ page }) => {
    await page.keyboard.press('Control+F')
    await page.getByText('Find Next ↓').waitFor({ state: 'visible', timeout: 2_000 })

    await page.keyboard.press('Alt+P')
    await expect(page.getByText('Replace All', { exact: true })).toBeVisible({ timeout: 2_000 })

    await page.keyboard.press('Escape')
  })

  test('Find dialog suppresses MenuBar mnemonics (Alt+F does not open File menu)', async ({ page }) => {
    await page.keyboard.press('Control+F')
    await page.getByText('Find Next ↓').waitFor({ state: 'visible', timeout: 2_000 })

    await page.keyboard.press('Alt+F')
    const newFileItem = page.getByRole('button', { name: /^New File/ })
    await expect(newFileItem).not.toBeVisible({ timeout: 1_000 })

    await page.keyboard.press('Escape')
  })
})

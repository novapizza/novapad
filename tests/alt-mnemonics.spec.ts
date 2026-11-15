import { test, expect, setEditorText, MOD, IS_MAC } from './fixtures'

/**
 * Alt-key mnemonics on Windows/Linux (usesAltMnemonics() is !isMacOS). macOS has no custom
 * MenuBar and no mnemonics, so the whole file is skipped there.
 */
test.skip(IS_MAC, 'Alt mnemonics are Windows/Linux only')

test('MenuBar Alt mnemonics', async ({ page }) => {
  const newFileItem = page.getByRole('button', { name: /^New File/ })

  await test.step('Alt+F opens the File menu; Escape closes it', async () => {
    await page.keyboard.press('Alt+F')
    await expect(newFileItem).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(newFileItem).not.toBeVisible()
  })

  await test.step('Alt+S opens the Search menu', async () => {
    await page.keyboard.press('Alt+S')
    await expect(page.getByText('Find...', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  await test.step('holding Alt underlines the mnemonic letters', async () => {
    await page.keyboard.down('Alt')
    await expect(page.getByTestId('menubar').locator('u').first()).toBeVisible()
    await page.keyboard.up('Alt')
  })
})

test('Find dialog Alt mnemonics', async ({ page }) => {
  const openFind = async () => {
    await page.locator('.monaco-editor textarea').first().focus()
    await page.keyboard.press(`${MOD}+F`)
    await expect(page.getByText('Find Next ↓')).toBeVisible()
  }

  await test.step('Alt+C toggles Match case', async () => {
    await openFind()
    const matchCase = page.locator('label', { hasText: 'Match case' }).locator('input[type="checkbox"]')
    const before = await matchCase.isChecked()
    await page.keyboard.press('Alt+C')
    await expect(matchCase).toBeChecked({ checked: !before })
    await page.keyboard.press('Alt+C') // restore, options persist across opens
    await page.keyboard.press('Escape')
  })

  await test.step('suppresses MenuBar mnemonics (Alt+F switches to the Find tab, not the File menu)', async () => {
    await openFind()
    await page.keyboard.press('Alt+F')
    await expect(page.getByRole('button', { name: /^New File/ })).not.toBeVisible()
    await page.keyboard.press('Escape')
  })

  await test.step('Alt+P switches to the Replace tab and Alt+A runs Replace All', async () => {
    await setEditorText(page, 'foo bar foo')
    await openFind()
    await page.keyboard.press('Alt+P')
    await expect(page.getByText('Replace All', { exact: true })).toBeVisible()
    await page.getByPlaceholder('Search pattern…').fill('foo')
    await page.getByPlaceholder('Replacement text…').fill('baz')
    await page.keyboard.press('Alt+A')
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('baz bar baz')
    await page.keyboard.press('Escape')
  })
})

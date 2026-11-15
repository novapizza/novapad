import { test, expect, sendIPC, setEditorText, MOD, IS_MAC } from '../fixtures'

/**
 * Editor context menu (specs/menu-consolidation.md suite 5): the custom Radix menu that replaces
 * Monaco's built-in one, wrapping only [data-testid="editor-pane"].
 */

const item = (page: import('@playwright/test').Page, name: string) => page.getByRole('menuitem', { name })

test('editor context menu: contents, shortcut hints and dismissal', async ({ page }) => {
  const pane = page.getByTestId('editor-pane')

  await test.step('right-click shows all top-level items', async () => {
    await pane.click({ button: 'right' })
    for (const name of ['Cut', 'Copy', 'Paste', 'Select All', 'Go to Line...', 'Toggle Comment', 'Convert Case']) {
      await expect(item(page, name)).toBeVisible()
    }
  })

  await test.step('shortcut hints use the platform modifier', async () => {
    await expect(item(page, 'Cut')).toContainText(IS_MAC ? '⌘+X' : 'Ctrl+X')
    await expect(item(page, 'Cut')).not.toContainText(IS_MAC ? 'Ctrl' : '⌘')
  })

  await test.step('Escape closes it', async () => {
    await page.keyboard.press('Escape')
    await expect(item(page, 'Cut')).not.toBeVisible()
  })

  await test.step('"Go to Line..." is clickable and closes the menu', async () => {
    await pane.click({ button: 'right' })
    await item(page, 'Go to Line...').click()
    await expect(item(page, 'Cut')).not.toBeVisible()
    await page.keyboard.press('Escape')
  })

  await test.step('right-clicking outside the editor pane does not open it', async () => {
    await page.getByTestId('tabbar').click({ button: 'right' })
    await expect(item(page, 'Cut')).not.toBeVisible()
  })
})

test('editor context menu: Convert Case and Toggle Comment edit the text', async ({ electronApp, page }) => {
  const pane = page.getByTestId('editor-pane')
  const lines = page.locator('.monaco-editor .view-lines')

  const convert = async (to: string) => {
    await page.locator('.monaco-editor textarea').first().focus()
    await page.keyboard.press(`${MOD}+A`)
    await pane.click({ button: 'right' })
    await item(page, 'Convert Case').hover()
    await item(page, to).click()
  }

  await test.step('UPPERCASE', async () => {
    await setEditorText(page, 'hello world')
    await convert('UPPERCASE')
    await expect(lines).toContainText('HELLO WORLD')
  })

  await test.step('lowercase', async () => {
    await convert('lowercase')
    await expect(lines).toContainText('hello world')
  })

  await test.step('Title Case', async () => {
    await convert('Title Case')
    await expect(lines).toContainText('Hello World')
  })

  await test.step('Toggle Comment comments the line in JavaScript', async () => {
    await sendIPC(electronApp, 'editor:set-language', 'javascript')
    await expect(page.getByTestId('statusbar-language')).toHaveText('JavaScript')
    await setEditorText(page, 'console.log("test")')
    await pane.click({ button: 'right' })
    await item(page, 'Toggle Comment').click()
    await expect(lines).toContainText('//')
  })
})

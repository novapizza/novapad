// E2E for editor-selection prefill across all Find dialog modes. The selected text must land in
// the search field for Find in Files, Replace and Mark — including when the dialog is already
// open and a shortcut switches modes with a fresh selection.
import type { Page } from 'playwright'
import { test, expect, sendIPC, setEditorText } from './fixtures'

/**
 * Double-click a word in the editor so Monaco selects it. Monaco renders the whole plain-text
 * line as one span, so aim at the word's character offset (monospace font → position is
 * proportional to the char index).
 */
async function selectWord(page: Page, lineText: string, word: string): Promise<void> {
  const span = page.locator('.view-line span', { hasText: word }).first()
  const box = await span.boundingBox()
  if (!box) throw new Error('editor line not visible')
  const ratio = (lineText.indexOf(word) + word.length / 2) / lineText.length
  await span.dblclick({ position: { x: box.width * ratio, y: box.height / 2 } })
}

const findInput = (page: Page) => page.getByPlaceholder(/Search pattern…|Pattern to mark…/)

const LINE = 'alphaNeedle beta gammaTarget'

test.describe('Find dialog — selection prefill across modes', () => {
  test('Find in Files, mode switch while open, and Mark all prefill the selection', async ({ page, electronApp }) => {
    await setEditorText(page, LINE)
    await expect(page.locator('.view-line').first()).toHaveText(LINE)

    await test.step('Find in Files prefills the editor selection', async () => {
      await selectWord(page, LINE, 'alphaNeedle')
      await sendIPC(electronApp, 'menu:find-in-files')
      await expect(findInput(page)).toHaveValue('alphaNeedle')
    })

    await test.step('mode-switch shortcut while the dialog is open re-applies the new selection', async () => {
      await selectWord(page, LINE, 'gammaTarget')
      await sendIPC(electronApp, 'menu:replace')
      await expect(page.getByPlaceholder('Replacement text…')).toBeVisible() // Replace tab active
      await expect(findInput(page)).toHaveValue('gammaTarget')
    })

    await test.step('Mark menu opens the Mark tab with the selection prefilled', async () => {
      await selectWord(page, LINE, 'beta')
      await sendIPC(electronApp, 'menu:mark')
      await expect(page.getByPlaceholder('Pattern to mark…')).toHaveValue('beta')
    })
  })
})

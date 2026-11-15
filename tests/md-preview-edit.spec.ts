// E2E: edit Markdown in the preview — double-click a block, edit its raw source, and the change
// lands in the editor's text (and so the file on save). Seeds a markdown buffer via the
// deeplink:new IPC and opens the side preview so the source editor stays visible next to it.
import type { ElectronApplication, Page } from 'playwright'
import { test, expect, sendIPC } from './fixtures'

test.use({ app: { seedBuffer: false } })

const DOC = '# Heading\n\nsome text\n\n| Name | Qty |\n|---|---|\n| apple | 3 |\n'

async function openPreview(electronApp: ElectronApplication, page: Page): Promise<void> {
  await sendIPC(electronApp, 'deeplink:new', { title: 'notes.md', content: DOC, language: 'markdown' })
  await page.locator('[data-testid="preview-toggle-side"]').click()
  await expect(page.locator('[data-md-preview] h1')).toHaveText('Heading', { timeout: 10_000 })
}

const preview = (page: Page) => page.locator('[data-md-preview]')
const blockEditor = (page: Page) => page.locator('[data-testid="md-block-editor"]')
const source = (page: Page) => page.locator('.monaco-editor .view-lines').first()

test.describe('Edit Markdown in preview', () => {
  test('double-click edits heading and table row; Escape cancels', async ({ electronApp, page }) => {
    await openPreview(electronApp, page)

    await test.step('double-click a heading, edit, Enter → source and preview update', async () => {
      await preview(page).locator('h1').dblclick()
      await expect(blockEditor(page)).toHaveValue('# Heading')
      await blockEditor(page).fill('# Renamed')
      await blockEditor(page).press('Enter')
      await expect(blockEditor(page)).toHaveCount(0)
      await expect(preview(page).locator('h1')).toHaveText('Renamed')
      await expect(source(page)).toContainText('# Renamed')
      await expect(source(page)).toContainText('some text')
    })

    await test.step('double-click a table cell edits its whole row', async () => {
      await preview(page).locator('td', { hasText: 'apple' }).dblclick()
      await expect(blockEditor(page)).toHaveValue('| apple | 3 |')
      await blockEditor(page).fill('| pear | 5 |')
      await blockEditor(page).press('Enter')
      await expect(preview(page).locator('td').first()).toHaveText('pear')
      await expect(source(page)).toContainText('| pear | 5 |')
    })

    await test.step('Escape cancels without touching the source', async () => {
      await preview(page).locator('p', { hasText: 'some text' }).dblclick()
      await blockEditor(page).fill('changed')
      await blockEditor(page).press('Escape')
      await expect(blockEditor(page)).toHaveCount(0)
      await expect(preview(page).locator('p', { hasText: 'some text' })).toBeVisible()
      await expect(source(page)).not.toContainText('changed')
    })
  })

  test.describe('with the setting off', () => {
    // Seeded into this test's own config.json — no toggling (and restoring) the real setting.
    test.use({ app: { seedBuffer: false, config: { mdPreviewEdit: false } } })

    test('setting off → double-click does not open the editor', async ({ electronApp, page }) => {
      await openPreview(electronApp, page)
      await preview(page).locator('h1').dblclick()
      await expect(blockEditor(page)).toHaveCount(0)
      await expect(preview(page).locator('[data-md-src]')).toHaveCount(0)
    })
  })
})

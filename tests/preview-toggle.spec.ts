import { test, expect, sendIPC } from './fixtures'

/**
 * Preview toggle buttons on the tab bar (next to "+"): "Preview" (inline — replaces the editor in
 * the current tab) and "Open Preview to the Side". They show only for previewable buffers.
 * Buffers are seeded with the deeplink:new IPC (no file dialog).
 */
test.use({ app: { seedBuffer: false } })

test('preview toggle buttons: side pane, inline, hidden for plaintext', async ({ electronApp, page }) => {
  const actions = page.getByTestId('preview-actions')

  await sendIPC(electronApp, 'deeplink:new', { title: 'notes.md', content: '# Heading\n\nsome text\n', language: 'markdown' })
  await expect(actions).toBeVisible()

  await test.step('side toggle opens and closes the preview pane', async () => {
    const sideBtn = page.getByTestId('preview-toggle-side')
    await sideBtn.click()
    await expect(page.getByText('Markdown Preview')).toBeVisible()
    await expect(sideBtn).toHaveAttribute('aria-pressed', 'true')
    await sideBtn.click()
    await expect(page.getByText('Markdown Preview')).toHaveCount(0)
  })

  await test.step('inline toggle replaces the editor in the current tab, keeping the tab bar', async () => {
    const inlineBtn = page.getByTestId('preview-toggle-inline')
    await inlineBtn.click()
    await expect(page.getByTestId('preview-inline')).toBeVisible()
    await expect(page.getByText('Markdown Preview')).toBeVisible()
    await expect(actions).toBeVisible()
    await expect(inlineBtn).toHaveAttribute('aria-pressed', 'true')
    await inlineBtn.click()
    await expect(page.getByTestId('preview-inline')).toHaveCount(0)
  })

  await test.step('buttons are hidden for a plaintext buffer', async () => {
    await sendIPC(electronApp, 'deeplink:new', { title: 'plain.txt', content: 'just text', language: 'plaintext' })
    await expect(page.locator('[data-tab-title="plain.txt"]')).toHaveAttribute('data-testid', 'active-tab')
    await expect(actions).toHaveCount(0)
  })
})

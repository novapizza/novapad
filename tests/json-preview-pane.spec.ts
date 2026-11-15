// E2E for the JSON Mighty preview pane. Verifies the Ctrl+P preview routing picks the JSON pane
// for JSON buffers, that the Format tab renders, and that the Repair tab can fix a buffer
// containing trailing commas — i.e. that the jsonrepair dependency loaded inside the lazy-chunked
// pane. Routing for non-JSON buffers is unit-tested in tests/unit/previewKind.test.ts.
import { test, expect, setEditorText, MOD } from './fixtures'

test.describe('JSON preview pane (Ctrl+P)', () => {
  test('Format tab renders, Repair tab fixes trailing commas', async ({ page }) => {
    await test.step('opens the JSON Tools pane for a JSON buffer', async () => {
      await setEditorText(page, '{"name":"novapad","tags":["editor","fast"]}')
      await page.keyboard.press(`${MOD}+P`)
      // Header chip identifies the JSON pane (vs Markdown / SQL Plan / CSV).
      await expect(page.getByText('JSON Mighty Tools', { exact: true })).toBeVisible({ timeout: 5_000 })
      // Default tab is Format — its beautified output should appear in the pane.
      await expect(page.getByText('"novapad"').first()).toBeVisible({ timeout: 3_000 })
    })

    await test.step('Repair tab fixes JSON with trailing commas', async () => {
      // Trailing comma after "fast" — JSON.parse() rejects this; only jsonrepair fixes it.
      // Tests that the jsonrepair lazy import resolved.
      await setEditorText(page, '{"name":"novapad","tags":["editor","fast",]}')
      // The Format tab rejects it first, proving the pane picked up the new buffer text.
      await expect(page.getByText(/^Invalid JSON:/)).toBeVisible({ timeout: 3_000 })
      await page.getByRole('button', { name: /^Repair$/ }).click()
      await expect(page.getByText('"editor"').first()).toBeVisible({ timeout: 3_000 })
      await expect(page.getByText(/Invalid JSON:|Could not repair/)).toHaveCount(0)
    })
  })
})

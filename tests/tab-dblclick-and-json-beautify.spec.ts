// E2E coverage for the "tab bar double-click → new doc" UX, the Ctrl+Alt+Shift+M JSON beautify
// shortcut, and post-paste language autodetect (the Magika refinement that runs in the renderer
// after a paste). Text goes in via a synthetic paste event so Monaco's own paste pipeline fires
// (that's what `editor.onDidPaste` listens to); `keyboard.type()` would let auto-closing
// brackets mangle JSON. SQL / XML formatting is unit-tested in tests/unit/beautify.test.ts.
import type { Page } from 'playwright'
import { test, expect, setEditorText, MOD } from './fixtures'

async function getEditorText(page: Page): Promise<string> {
  // Concatenate visible Monaco view-lines. Good enough for short documents we control.
  return page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll('.monaco-editor .view-line'))
    return lines.map((l) => (l.textContent ?? '').replace(/ /g, ' ')).join('\n')
  })
}

/** The status bar shows the active buffer's language label (e.g. "Plain Text", "JSON"). */
const statusLanguage = (page: Page) => page.locator('[data-testid="statusbar-language"]')

test.describe('Tab bar double-click new doc', () => {
  test('only a double-click on the empty tab-bar area opens a new tab', async ({ page }) => {
    await expect(page.locator('[data-tab-title="new 1"]')).toBeVisible()

    await test.step('single click on tab bar empty area does NOT create a new tab', async () => {
      await page.locator('[data-testid="tabbar-filler"]').click()
      await page.waitForTimeout(200)
      await expect(page.locator('[data-tab-title="new 2"]')).toHaveCount(0)
    })

    await test.step('double-click directly on an existing tab does NOT create a new one', async () => {
      await page.locator('[data-tab-title="new 1"]').dblclick()
      await page.waitForTimeout(200)
      await expect(page.locator('[data-tab-title="new 2"]')).toHaveCount(0)
    })

    await test.step('double-click on tab bar empty area opens a new untitled tab', async () => {
      await page.locator('[data-testid="tabbar-filler"]').dblclick()
      await expect(page.locator('[data-tab-title="new 2"]')).toBeVisible()
    })
  })
})

test.describe('JSON beautify (Ctrl+Alt+Shift+M)', () => {
  test('reformats minified JSON; invalid JSON shows a warning toast', async ({ page }) => {
    const SHORTCUT = `${MOD}+Alt+Shift+M`

    await test.step('reformats minified JSON in the active buffer', async () => {
      const minified = '{"a":1,"b":[2,3],"c":{"d":"e"}}'
      await setEditorText(page, minified)
      // A shortcut pressed while the paste's language refine is in flight is lost; wait for it to land
      await expect(page.getByTestId('statusbar-language')).toHaveText('JSON', { timeout: 5_000 })
      await page.keyboard.press(SHORTCUT)
      // Structure preserved AND multi-line (i.e. actually reformatted).
      await expect.poll(async () => (await getEditorText(page)).split('\n').length).toBeGreaterThan(1)
      expect(JSON.parse(await getEditorText(page))).toEqual(JSON.parse(minified))
    })

    await test.step('shows a warning toast when content is not valid JSON', async () => {
      // Starts with `{` so the format is detected as JSON, but the JSON parser rejects it —
      // surfacing the format-specific "Not valid JSON" toast.
      await setEditorText(page, '{"broken": ')
      // No language change to wait for here; re-pressing only re-shows the toast
      await expect(async () => {
        await page.keyboard.press(SHORTCUT)
        await expect(page.getByText(/Not valid JSON/i)).toBeVisible({ timeout: 1_500 })
      }).toPass({ timeout: 8_000 })
    })
  })
})

test.describe('Autodetect on paste', () => {
  test('pasting JSON into a plaintext buffer reclassifies it as json', async ({ page }) => {
    // Sanity: the fresh untitled buffer starts as plain text.
    await expect(statusLanguage(page)).toHaveText('Plain Text')
    await setEditorText(page, JSON.stringify({ name: 'novapad', version: '1.1.0', values: [1, 2, 3] }, null, 2))
    // Magika init + WebGL detect can take a moment on first run.
    await expect(statusLanguage(page)).toHaveText('JSON', { timeout: 30_000 })
  })
})

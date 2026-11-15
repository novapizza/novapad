// E2E for the Find Results panel (replaces find-results-copy + find-results-navigation): VSCode-
// style arrow-key tree navigation, collapse/expand, Ctrl+Click multi-select, Copy / Copy All /
// Copy Path (raw line text only, newline-joined, no line numbers or file headers) and Dismiss.
//
// The panel copies through `navigator.clipboard.writeText` (useCopy in components/Tools/shared),
// and the system clipboard is unusable under the test runner — so the renderer's writeText is
// stubbed to record into `window.__copied`, which the test reads back.
import fs from 'fs'
import path from 'path'
import type { ElectronApplication, Page } from 'playwright'
import { test, expect, sendIPC, tempDir, MOD } from './fixtures'

test.use({ app: { seedBuffer: false } })

const LINE_1 = 'alpha TODO one'
const LINE_2 = 'beta TODO two'
const LINE_3 = 'gamma TODO three'
const CONTENT = [LINE_1, 'plain line', LINE_2, 'another line', LINE_3].join('\n')

/** Open Find, search for "TODO" with Find All (this doc), close the dialog. */
async function runFindAll(page: Page, electronApp: ElectronApplication): Promise<void> {
  await sendIPC(electronApp, 'menu:find')
  const input = page.getByPlaceholder('Search pattern…')
  await input.waitFor({ timeout: 5_000 })
  await input.fill('TODO')
  await page.getByRole('button', { name: 'Find All (this doc)' }).click()
  await page.keyboard.press('Escape') // close the dialog so the panel is unobstructed
  await page.waitForSelector('[data-testid="find-result-line"]', { timeout: 5_000 })
}

async function stubClipboard(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __copied: string[] }
    w.__copied = []
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (t: string) => {
        w.__copied.push(t)
      },
    })
  })
}

/** Last text the app wrote to the clipboard. */
const lastCopied = (page: Page) =>
  page.evaluate(() => (window as unknown as { __copied: string[] }).__copied.at(-1) ?? null)

test.describe('Find Results panel', () => {
  test('navigation, collapse, multi-select copy, Copy All / Copy / Copy Path, Dismiss', async ({ page, electronApp }) => {
    // A real on-disk file so the header has a path for Copy Path.
    const tmp = tempDir('frnav-')
    const filePath = path.join(tmp, 'sample.log')
    fs.writeFileSync(filePath, CONTENT)
    try {
      await sendIPC(electronApp, 'menu:file-open', [filePath])
      await page.waitForSelector('[data-tab-title="sample.log"]', { timeout: 5_000 })
      await page.waitForSelector('.monaco-editor textarea', { timeout: 10_000 })
      await page.waitForTimeout(200) // EditorPane model swap settles asynchronously
      await stubClipboard(page)
      await runFindAll(page, electronApp)

      const list = page.locator('[data-testid="find-results-list"]')
      const header = page.locator('[data-testid="find-result-header"]')
      const rows = page.locator('[data-testid="find-result-line"]')
      const row = (key: string) => page.locator(`[data-testid="find-result-line"][data-key="${key}"]`)
      await expect(rows).toHaveCount(3)

      await test.step('arrow keys walk the tree, Enter opens the hit', async () => {
        await list.focus()
        // ↓ focuses the file header first, then walks into the result lines.
        await page.keyboard.press('ArrowDown')
        await expect(header).toHaveClass(/ring-1/)
        await page.keyboard.press('ArrowDown')
        await expect(row('0:0')).toHaveClass(/bg-primary/)
        await page.keyboard.press('ArrowDown')
        await expect(row('0:1')).toHaveClass(/bg-primary/)
        // Enter navigates the editor to the focused hit (LINE_2 lives on line 3).
        await page.keyboard.press('Enter')
        await expect(page.getByTitle('Go to Line:Column')).toHaveText(/Ln 3,/)
      })

      await test.step('arrow left/right collapse and expand the file group', async () => {
        // Walk back up from the last focused hit to the file header.
        await list.focus()
        for (let i = 0; i < 4 && !/ring-1/.test((await header.getAttribute('class')) ?? ''); i++) {
          await page.keyboard.press('ArrowUp')
        }
        await expect(header).toHaveClass(/ring-1/)
        await page.keyboard.press('ArrowLeft') // collapse
        await expect(rows).toHaveCount(0)
        await page.keyboard.press('ArrowRight') // expand
        await expect(rows).toHaveCount(3)
      })

      await test.step('click + Ctrl+Click select rows, Ctrl+C copies raw line text', async () => {
        // Plain click selects the first row (and navigates); Mod+Click toggles the third in.
        await rows.nth(0).click()
        // The plain click's navigation focuses the editor on a 50 ms timer; let it land so it
        // can't steal focus back from the panel after the Mod+Click (no human clicks that fast).
        await expect(page.getByTitle('Go to Line:Column')).toHaveText(/Ln 1,/)
        await expect(page.locator('.monaco-editor textarea').first()).toBeFocused()
        await rows.nth(2).click({ modifiers: [MOD] })
        await expect(row('0:0')).toHaveClass(/bg-primary/)
        await expect(row('0:2')).toHaveClass(/bg-primary/)
        // Mod+Click left keyboard focus on the panel, so Mod+C copies the selection.
        await page.keyboard.press(`${MOD}+C`)
        await expect.poll(() => lastCopied(page)).toBe(`${LINE_1}\n${LINE_3}`)
      })

      await test.step('right-click → Copy All copies every result line', async () => {
        await rows.nth(1).click({ button: 'right' })
        await page.getByRole('menuitem', { name: 'Copy All' }).click()
        await expect.poll(() => lastCopied(page)).toBe(`${LINE_1}\n${LINE_2}\n${LINE_3}`)
      })

      await test.step('right-click a row → Copy copies just that line', async () => {
        await rows.nth(1).click({ button: 'right' })
        // Accessible name includes the shortcut label ("Copy ⌘+C" / "Copy Ctrl+C").
        await page.getByRole('menuitem', { name: /^Copy (⌘|Ctrl)\+C$/ }).click()
        await expect.poll(() => lastCopied(page)).toBe(LINE_2)
      })

      await test.step('context menu Copy Path copies the file path', async () => {
        await header.click({ button: 'right' })
        await page.getByRole('menuitem', { name: 'Copy Path' }).click()
        await expect.poll(() => lastCopied(page)).toBe(filePath)
      })

      await test.step('hovering the header reveals Dismiss, which removes the last file', async () => {
        await expect(page.getByRole('menuitem')).toHaveCount(0)
        await header.hover()
        await page.locator('[data-testid="find-result-dismiss"]').click()
        await expect(rows).toHaveCount(0)
        await expect(page.getByText('No results.')).toBeVisible()
      })
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

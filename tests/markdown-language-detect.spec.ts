// E2E: markdown language detection on open AND on save, exercised with a
// 1,000-line file.
//
// Two bugs this guards (both in one launch):
//  1. Saving an untitled (plaintext) buffer as .md never re-derived the
//     language from the new extension, so highlighting stayed Plain Text even
//     though the file on disk was .md.
//  2. Magika content-sniffing would downgrade a recognized extension language
//     to Plain Text (it routinely reads markdown as `txt`), undoing #1 and also
//     breaking the plain "open a .md file" case.
//
// Strategy: drive everything through the same IPC the native menus use. The
// native Save dialog is stubbed in the main process so the save lands at a
// known temp path. Language is observed via the status-bar language label,
// which renders the active buffer's language. Extension mapping itself is
// unit-tested in tests/unit/languageDetect.test.ts.
import fs from 'fs'
import path from 'path'
import type { Page } from 'playwright'
import { test, expect, sendIPC, seedBuffer, pasteIntoEditor, tempDir } from './fixtures'

test.use({ app: { seedBuffer: false } })

/** 1,000 lines of unambiguous markdown — headings, lists, links, emphasis. */
function build1kLineMarkdown(): string {
  const lines = Array.from({ length: 1000 }, (_, i) => {
    const n = i + 1
    if (n % 25 === 1) return `# Section ${Math.ceil(n / 25)}`
    if (n % 5 === 0) return `- list item ${n} — see [reference ${n}](https://example.com/${n})`
    return `Paragraph ${n} with **bold**, _italics_, and \`inline code\`.`
  })
  return lines.join('\n')
}

/** The status-bar language label reflects the active buffer's language. */
function languageLabel(page: Page): Promise<string> {
  return page.locator('[data-testid="statusbar-language"]').innerText()
}

test.describe('Markdown language detection (1k-line file)', () => {
  test('open .md detects Markdown; saving a Plain Text untitled buffer as .md switches to Markdown', async ({
    electronApp,
    page,
  }) => {
    const tmpDir = tempDir('e2e-md-')
    const mdPath = path.join(tmpDir, 'notes.md')
    const savedPath = path.join(tmpDir, 'untitled-saved.md')
    fs.writeFileSync(mdPath, build1kLineMarkdown(), 'utf8')

    try {
      await test.step('opening a 1,000-line .md file detects Markdown', async () => {
        // Open the file the same way the native File > Open menu does.
        await sendIPC(electronApp, 'menu:file-open', [mdPath])
        await page.waitForSelector('.monaco-editor textarea', { timeout: 10_000 })
        // Extension detection sets Markdown synchronously on open.
        await expect.poll(() => languageLabel(page), { timeout: 5_000 }).toBe('Markdown')
      })

      await test.step('saving an untitled Plain Text buffer as .md switches the language to Markdown', async () => {
        await seedBuffer(electronApp, page)
        await expect(page.locator('[data-testid="tabbar"] [data-tab-title]')).toHaveCount(2)
        await pasteIntoEditor(page, build1kLineMarkdown())

        // Force the language to Plain Text so the save is what flips it. (Mirrors the real bug:
        // an untitled note typed as plain text, then saved as .md.) Uses the same CustomEvent
        // the status-bar language picker fires.
        await page.evaluate(() => {
          window.dispatchEvent(new CustomEvent('editor:set-language-local', { detail: 'plaintext' }))
        })
        await expect.poll(() => languageLabel(page), { timeout: 5_000 }).toBe('Plain Text')

        // Stub the native Save dialog to land at our temp .md path.
        await electronApp.evaluate(({ dialog }, p) => {
          ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async () => ({
            canceled: false,
            filePath: p,
          })
        }, savedPath)
        await sendIPC(electronApp, 'menu:file-save')

        // The save re-derives the language from the .md extension.
        await expect.poll(() => languageLabel(page), { timeout: 5_000 }).toBe('Markdown')
        // The file was actually written with all 1,000 lines.
        await expect.poll(() => fs.existsSync(savedPath), { timeout: 5_000 }).toBe(true)
        expect(fs.readFileSync(savedPath, 'utf8').split(/\r?\n/).length).toBe(1000)
      })

      await test.step('Magika refine never downgrades either buffer to Plain Text', async () => {
        // Refine is fire-and-forget with no observable completion signal, and "never changes"
        // can't be polled for — so both async passes (open + save) share one settle window.
        await page.waitForTimeout(1500)
        expect(await languageLabel(page)).toBe('Markdown')
        await page.locator('[data-tab-title="notes.md"]').click()
        await expect.poll(() => languageLabel(page)).toBe('Markdown')
      })
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

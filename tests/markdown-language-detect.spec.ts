// E2E: markdown language detection on open AND on save, exercised with a
// 1,000-line file.
//
// Two bugs this guards:
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
// which renders the active buffer's language.

import { test as base, expect } from './fixtures'
import { _electron as electron, ElectronApplication, Page } from 'playwright'
import path from 'path'
import os from 'os'
import fs from 'fs'

const test = base.extend<{ electronApp: ElectronApplication }>({
  electronApp: async ({}, use) => {
    const app = await electron.launch({
      args: [path.resolve(__dirname, '../out/main/index.js')],
      env: { ...process.env, E2E_TEST: '1', NODE_ENV: 'test' },
      timeout: 15_000,
    })
    await use(app)
    await app.close()
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForSelector('[data-testid="app"]', { timeout: 10_000 })
    await use(page)
  },
})

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

async function seedUntitledBuffer(app: ElectronApplication, page: Page): Promise<void> {
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('menu:file-new')
  })
  await page.waitForSelector('.monaco-editor textarea', { timeout: 10_000 })
  await page.waitForSelector('[data-testid="tabbar"] [data-tab-title]', { timeout: 5_000 })
}

/** Paste text via a synthetic clipboard event — drives Monaco's real paste pipeline. */
async function pasteIntoEditor(page: Page, text: string): Promise<void> {
  await page.locator('.monaco-editor textarea').first().click({ force: true })
  await page.evaluate((t) => {
    const ta = document.querySelector('.monaco-editor textarea') as HTMLTextAreaElement | null
    if (!ta) throw new Error('Monaco textarea not found')
    ta.focus()
    const dt = new DataTransfer()
    dt.setData('text/plain', t)
    ta.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  }, text)
}

/** The status-bar language label reflects the active buffer's language. */
function languageLabel(page: Page): Promise<string> {
  return page.locator('[data-testid="statusbar-language"]').innerText()
}

test.describe('Markdown language detection (1k-line file)', () => {
  test('opening a 1,000-line .md file detects Markdown and never downgrades to Plain Text', async ({
    electronApp,
    page,
  }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-md-open-'))
    const mdPath = path.join(tmpDir, 'notes.md')
    fs.writeFileSync(mdPath, build1kLineMarkdown(), 'utf8')

    try {
      await page.waitForSelector('[data-testid="app"]', { timeout: 10_000 })

      // Open the file the same way the native File ▸ Open menu does.
      await electronApp.evaluate(({ BrowserWindow }, p) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('menu:file-open', [p])
      }, mdPath)

      await page.waitForSelector('.monaco-editor textarea', { timeout: 10_000 })

      // Extension detection sets Markdown synchronously on open.
      await expect.poll(() => languageLabel(page), { timeout: 5_000 }).toBe('Markdown')

      // Give the async Magika refine pass time to run; it must NOT downgrade
      // the recognized Markdown language to Plain Text.
      await page.waitForTimeout(1500)
      expect(await languageLabel(page)).toBe('Markdown')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test('saving an untitled Plain Text buffer as .md switches the language to Markdown', async ({
    electronApp,
    page,
  }) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-md-save-'))
    const mdPath = path.join(tmpDir, 'untitled-saved.md')

    try {
      await seedUntitledBuffer(electronApp, page)

      // Fill the buffer with 1k lines of markdown...
      const md = build1kLineMarkdown()
      await pasteIntoEditor(page, md)

      // ...then force the language to Plain Text so the save is what flips it.
      // (Mirrors the real bug: an untitled note typed as plain text, then saved
      // as .md.) Uses the same CustomEvent the status-bar language picker fires.
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
      }, mdPath)

      // Trigger Save (untitled → prompts the now-stubbed dialog).
      await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('menu:file-save')
      })

      // The save re-derives the language from the .md extension.
      await expect.poll(() => languageLabel(page), { timeout: 5_000 }).toBe('Markdown')

      // The file was actually written with all 1,000 lines.
      await expect.poll(() => fs.existsSync(mdPath), { timeout: 5_000 }).toBe(true)
      const written = fs.readFileSync(mdPath, 'utf8')
      expect(written.split(/\r?\n/).length).toBe(1000)

      // And Magika's async refine pass must not downgrade it back to Plain Text.
      await page.waitForTimeout(1500)
      expect(await languageLabel(page)).toBe('Markdown')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})

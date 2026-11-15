// E2E: pasting long-line content auto-enables Word Wrap.
//
// Background: text copied from other apps (e.g. markdown from VS Code's "Copy
// to Clipboard") often stores each paragraph as one unbroken line. With Word
// Wrap off (the default), Monaco scrolls horizontally to the cursor after such
// a paste, so the content reads as disconnected tail fragments. The paste
// handler in EditorPane.tsx detects a pasted line wider than the viewport and
// flips Word Wrap on (mirroring the beautify long-line behavior).
//
// Strategy: text goes in via a synthetic `paste` ClipboardEvent at Monaco's textarea (the
// fixture's setEditorText), which fires the exact same Monaco paste pipeline (and therefore
// `editor.onDidPaste`, which the feature hangs off of) without the OS clipboard.
//
// The shared fixture gives the test an isolated userData dir so (a) Word Wrap starts at its
// `false` default and (b) the debounced config write never pollutes the developer's real config.
// Word-wrap state is observed three ways: the native menu checkbox (the renderer→main sync), the
// persisted config.json, and the DOM (a single long logical line reflows into multiple
// .view-line rows only when wrap is on).
import fs from 'fs'
import path from 'path'
import type { ElectronApplication, Page } from 'playwright'
import { test, expect, setEditorText } from './fixtures'

/** Read the native "Word Wrap" menu checkbox — the renderer→main toggle sync target. */
async function wordWrapMenuChecked(app: ElectronApplication): Promise<boolean | null> {
  return app.evaluate(({ Menu }) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById('toggle-word-wrap')
    return item ? item.checked : null
  })
}

/** Count rendered Monaco view-lines. A single long logical line spans more than one only when wrapping is on. */
async function viewLineCount(page: Page): Promise<number> {
  return page.locator('.monaco-editor .view-line').count()
}

function savedWordWrap(userDataDir: string): boolean {
  const p = path.join(userDataDir, 'config', 'config.json')
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')).wordWrap ?? false) : false
}

test('short-line paste leaves Word Wrap off; a line wider than the viewport auto-enables it', async ({
  electronApp,
  page,
  userDataDir,
}) => {
  await test.step('pasting short lines that fit the viewport leaves Word Wrap off', async () => {
    // Sanity: Word Wrap starts off (the configStore default).
    expect(await wordWrapMenuChecked(electronApp)).toBe(false)
    await setEditorText(page, ['const a = 1', 'const b = 2', 'function f() {}', 'return a + b'].join('\n'))
    // No positive event to await, so give the paste handler + any debounced config save a
    // short settle window, then assert Word Wrap was NOT touched.
    await page.waitForTimeout(800)
    expect(await wordWrapMenuChecked(electronApp)).toBe(false)
    expect(savedWordWrap(userDataDir)).toBe(false)
  })

  await test.step('pasting a single line wider than the viewport auto-enables Word Wrap', async () => {
    // One unbroken logical line, far wider than any viewport (~800 chars).
    await setEditorText(page, 'lorem ipsum dolor sit amet '.repeat(30).trim())
    // The renderer flips Word Wrap on and syncs it to the native menu checkbox.
    await expect.poll(() => wordWrapMenuChecked(electronApp), { timeout: 5_000 }).toBe(true)
    // The single logical line now reflows across multiple visual rows.
    await expect.poll(() => viewLineCount(page), { timeout: 5_000 }).toBeGreaterThan(1)
    // ...and the change is persisted to config.json (debounced 500ms save).
    await expect.poll(() => savedWordWrap(userDataDir), { timeout: 5_000 }).toBe(true)
  })
})

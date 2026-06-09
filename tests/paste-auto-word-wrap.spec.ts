// E2E: pasting long-line content auto-enables Word Wrap.
//
// Background: text copied from other apps (e.g. markdown from VS Code's "Copy
// to Clipboard") often stores each paragraph as one unbroken line. With Word
// Wrap off (the default), Monaco scrolls horizontally to the cursor after such
// a paste, so the content reads as disconnected tail fragments. The paste
// handler in EditorPane.tsx detects a pasted line wider than the viewport and
// flips Word Wrap on (mirroring the beautify long-line behavior).
//
// Strategy: we dispatch a synthetic `paste` ClipboardEvent at Monaco's textarea
// rather than driving the OS clipboard + Ctrl+V. This fires the exact same
// Monaco paste pipeline (and therefore `editor.onDidPaste`, which the feature
// hangs off of) but is independent of OS window focus — real Ctrl+V paste is
// flaky in headless/background test runs because Chromium only honors a paste
// gesture when the renderer is focused.
//
// Each test runs against an isolated --user-data-dir so (a) Word Wrap starts at
// its `false` default and (b) the debounced config write never pollutes the
// developer's real config. Word-wrap state is observed three ways: the native
// menu checkbox (the renderer→main sync), the persisted config.json, and the
// DOM (a single long logical line reflows into multiple .view-line rows only
// when wrap is on).

import { test, expect } from '@playwright/test'
import { ElectronApplication, Page } from 'playwright'
import { freshUserDataDir, launchIsolated, readConfig } from './whats-new-helpers'

async function seedBufferAndWait(app: ElectronApplication, page: Page): Promise<void> {
  // E2E mode skips session restore — seed an untitled buffer the way the
  // native New File menu does, then wait for Monaco + the tab to mount.
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) win.webContents.send('menu:file-new')
  })
  await page.waitForSelector('.monaco-editor textarea', { timeout: 10_000 })
  await page.waitForSelector('[data-testid="tabbar"] [data-tab-title]', { timeout: 5_000 })
}

/**
 * Paste text into the freshly-seeded (empty) buffer by dispatching a synthetic
 * paste event — this drives Monaco's real paste pipeline and fires onDidPaste.
 */
async function pasteIntoEditor(page: Page, text: string): Promise<void> {
  await page.locator('.monaco-editor textarea').first().click({ force: true })
  await page.evaluate((t) => {
    const ta = document.querySelector('.monaco-editor textarea') as HTMLTextAreaElement | null
    if (!ta) throw new Error('Monaco textarea not found')
    ta.focus()
    const dt = new DataTransfer()
    dt.setData('text/plain', t)
    ta.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    )
  }, text)
}

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

test('pasting a single line wider than the viewport auto-enables Word Wrap', async () => {
  const userDataDir = freshUserDataDir()
  const { app, page } = await launchIsolated({ userDataDir })
  try {
    await seedBufferAndWait(app, page)

    // Sanity: Word Wrap starts off (the configStore default).
    expect(await wordWrapMenuChecked(app)).toBe(false)

    // One unbroken logical line, far wider than any viewport (~800 chars).
    const longLine = 'lorem ipsum dolor sit amet '.repeat(30).trim()
    await pasteIntoEditor(page, longLine)

    // The renderer flips Word Wrap on and syncs it to the native menu checkbox.
    await expect.poll(() => wordWrapMenuChecked(app), { timeout: 5_000 }).toBe(true)

    // The single logical line now reflows across multiple visual rows.
    await expect.poll(() => viewLineCount(page), { timeout: 5_000 }).toBeGreaterThan(1)

    // ...and the change is persisted to config.json (debounced 500ms save).
    await expect
      .poll(() => readConfig(userDataDir)?.wordWrap ?? false, { timeout: 5_000 })
      .toBe(true)
  } finally {
    await app.close()
  }
})

test('pasting short lines that fit the viewport leaves Word Wrap off', async () => {
  const userDataDir = freshUserDataDir()
  const { app, page } = await launchIsolated({ userDataDir })
  try {
    await seedBufferAndWait(app, page)
    expect(await wordWrapMenuChecked(app)).toBe(false)

    // Several short lines — none approach the viewport width.
    const shortLines = ['const a = 1', 'const b = 2', 'function f() {}', 'return a + b'].join('\n')
    await pasteIntoEditor(page, shortLines)

    // Give the paste handler + any debounced config save a chance to run, then
    // assert Word Wrap was NOT touched. (No positive event to await, so a short
    // settle wait is required — same approach as waitForAutoOpenIdle.)
    await page.waitForTimeout(800)
    expect(await wordWrapMenuChecked(app)).toBe(false)
    expect(readConfig(userDataDir)?.wordWrap ?? false).toBe(false)
  } finally {
    await app.close()
  }
})

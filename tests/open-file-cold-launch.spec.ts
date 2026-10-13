import { test, expect, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { freshUserDataDir, launchIsolated, seedSession } from './whats-new-helpers'

/**
 * Cold launch with a file on argv (Explorer double-click / "Open with NovaPad")
 * while a saved session is restored at the same time.
 *
 * Regression: the session restore re-activated the session's last tab over the
 * file the user opened, and opened a second tab for a file that was already in
 * the session. Main now sends session:restore before menu:file-open and the
 * renderer opens the file only after the restore settles.
 */

function makeTempTextFile(tag: string): string {
  const fp = path.join(os.tmpdir(), `novapad-coldopen-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`)
  fs.writeFileSync(fp, `hello from ${tag}\n`, 'utf8')
  return fp
}

function sessionWith(files: string[], activeIndex: number): Record<string, unknown> {
  return {
    version: 3,
    files: files.map((filePath) => ({ filePath, language: 'plaintext', encoding: 'UTF-8', eol: 'LF', viewState: null })),
    virtualTabs: [],
    activeIndex,
  }
}

/** Titles of file tabs only — the What's New auto-open may add a virtual tab. */
async function fileTabTitles(page: Page): Promise<string[]> {
  return page.locator('[data-tab-kind="file"]').evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).getAttribute('data-tab-title') ?? '')
  )
}

async function activeTitle(page: Page): Promise<string | null> {
  return page.locator('[data-testid="active-tab"]').getAttribute('data-tab-title')
}

test('file passed on cold launch takes focus over the restored session', async () => {
  const a = makeTempTextFile('a')
  const b = makeTempTextFile('b')
  const target = makeTempTextFile('target')
  const userDataDir = freshUserDataDir()
  // Session's own active tab is A — the restore must not win over the argv file.
  seedSession(userDataDir, sessionWith([a, b], 0))

  const { app, page } = await launchIsolated({ userDataDir, skipSessionRestore: false, extraArgs: [target] })
  try {
    await expect.poll(() => fileTabTitles(page)).toEqual([path.basename(a), path.basename(b), path.basename(target)])
    await expect.poll(() => activeTitle(page)).toBe(path.basename(target))
  } finally {
    await app.close()
    for (const f of [a, b, target]) { try { fs.unlinkSync(f) } catch { /* ignore */ } }
  }
})

test('file already in the restored session is focused, not opened twice', async () => {
  const a = makeTempTextFile('a')
  const b = makeTempTextFile('b')
  const userDataDir = freshUserDataDir()
  // Session's active tab is B; the user double-clicks A.
  seedSession(userDataDir, sessionWith([a, b], 1))

  const { app, page } = await launchIsolated({ userDataDir, skipSessionRestore: false, extraArgs: [a] })
  try {
    await expect.poll(() => activeTitle(page)).toBe(path.basename(a))
    // Give a duplicate the chance to appear before asserting there is none.
    await page.waitForTimeout(500)
    expect(await fileTabTitles(page)).toEqual([path.basename(a), path.basename(b)])
  } finally {
    await app.close()
    for (const f of [a, b]) { try { fs.unlinkSync(f) } catch { /* ignore */ } }
  }
})

test('Windows: same file with different path casing reuses the open tab', async () => {
  test.skip(process.platform !== 'win32', 'Windows paths are case-insensitive; POSIX paths are not')
  const a = makeTempTextFile('a')
  const b = makeTempTextFile('b')
  const userDataDir = freshUserDataDir()
  seedSession(userDataDir, sessionWith([a, b], 1))

  // Same file, lower-cased and with forward slashes.
  const aVariant = a.toLowerCase().replace(/\\/g, '/')
  const { app, page } = await launchIsolated({ userDataDir, skipSessionRestore: false, extraArgs: [aVariant] })
  try {
    await expect.poll(() => activeTitle(page)).toBe(path.basename(a))
    await page.waitForTimeout(500)
    expect(await fileTabTitles(page)).toEqual([path.basename(a), path.basename(b)])
  } finally {
    await app.close()
    for (const f of [a, b]) { try { fs.unlinkSync(f) } catch { /* ignore */ } }
  }
})

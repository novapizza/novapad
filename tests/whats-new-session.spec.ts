import fs from 'fs'
import path from 'path'
import { test, expect, launchApp, makeUserDataDir, tempDir } from './fixtures'

/**
 * "What's New" tab with session restore (.docs/features/whats-new-tab/tests.md Tests 6 and 10).
 * Launches with `restoreSession: true` so SessionManager.restore() runs against the isolated
 * userData dir. Each test overwrites the fixture's config.json so the auto-open fires.
 */

function configFile(dir: string, name: 'config.json' | 'session.json'): string {
  return path.join(dir, 'config', name)
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

test('auto-open does not steal focus from a restored session', async () => {
  const dir = makeUserDataDir()
  const filesDir = tempDir()
  const file1 = path.join(filesDir, 'one.txt')
  const file2 = path.join(filesDir, 'two.txt')
  fs.writeFileSync(file1, 'hello from session\n', 'utf8')
  fs.writeFileSync(file2, 'hello from session\n', 'utf8')

  // Stale lastSeenVersion → auto-open fires.
  fs.writeFileSync(configFile(dir, 'config.json'), JSON.stringify({ lastSeenVersion: '0.0.0-test-stale' }), 'utf8')
  // Session v3: activeIndex is flat across [...virtualTabs, ...files], so 1 = file2.
  const fileEntry = (filePath: string) => ({ filePath, language: 'plaintext', encoding: 'UTF-8', eol: 'LF', viewState: null })
  fs.writeFileSync(
    configFile(dir, 'session.json'),
    JSON.stringify({ version: 3, files: [fileEntry(file1), fileEntry(file2)], virtualTabs: [], activeIndex: 1 }),
    'utf8'
  )

  const { app, page } = await launchApp(dir, { restoreSession: true })
  try {
    await expect(page.locator('[data-tab-kind="whatsNew"]')).toHaveCount(1)

    // Tab order: the restored files, then the auto-opened What's New.
    const tabKinds = await page
      .locator('[data-tab-id]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-tab-kind')))
    expect(tabKinds).toEqual(['file', 'file', 'whatsNew'])

    // The restored active file keeps focus.
    const active = page.getByTestId('active-tab')
    await expect(active).toHaveAttribute('data-tab-kind', 'file')
    await expect(active).toHaveAttribute('data-tab-title', 'two.txt')
  } finally {
    await app.close()
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
    fs.rmSync(filesDir, { recursive: true, force: true })
  }
})

test('whatsNew tab persists across restarts when left open', async () => {
  const dir = makeUserDataDir()
  fs.rmSync(configFile(dir, 'config.json')) // fresh install → auto-open fires

  try {
    // Launch 1: auto-open fires; leave the tab open and save the session.
    const first = await launchApp(dir, { restoreSession: true })
    try {
      await expect(first.page.locator('[data-tab-kind="whatsNew"]')).toHaveCount(1)
      // The real save runs in the window-close handshake (app:before-close → session:save), which
      // tears down before the write lands under Playwright, so send the same payload directly.
      await first.page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(window as any).api.send('session:save', { version: 3, files: [], virtualTabs: [{ kind: 'whatsNew' }], activeIndex: 0 })
      })
      await expect.poll(() => readJson(configFile(dir, 'session.json'))?.virtualTabs).toEqual([{ kind: 'whatsNew' }])
    } finally {
      await first.app.close()
    }

    // Launch 2: restore brings the tab back; lastSeenVersion written on launch 1 stays.
    const second = await launchApp(dir, { restoreSession: true })
    try {
      await expect(second.page.locator('[data-tab-kind="whatsNew"]')).toHaveCount(1)
      const version = await second.app.evaluate(({ app }) => app.getVersion())
      expect(readJson(configFile(dir, 'config.json'))?.lastSeenVersion).toBe(version)
    } finally {
      await second.app.close()
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  }
})

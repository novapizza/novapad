import fs from 'fs'
import path from 'path'
import { test, expect, launchApp, makeUserDataDir, seedBuffer, sendIPC } from './fixtures'

/**
 * "What's New" version-mismatch auto-open (.docs/features/whats-new-tab/tests.md Tests 3/14, 4, 9,
 * 16, 20; Test 5 "no auto-open when versions match" is launch 2 of the lifecycle test). Each test
 * uses its own userData dir and overwrites the fixture's config.json, which otherwise pins
 * lastSeenVersion to suppress the auto-open.
 *
 * With an empty workspace the auto-open ACTIVATES the tab (App.tsx: `activate: !hasFiles`, so the
 * user sees it instead of the Welcome screen). The background / no-focus-steal case only applies
 * when a session with files is restored — see whats-new-session.spec.ts.
 */

function configPath(dir: string): string {
  return path.join(dir, 'config', 'config.json')
}

function readConfig(dir: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(configPath(dir), 'utf8'))
  } catch {
    return null
  }
}

/** No positive event marks "auto-open did not fire": give the load → getVersion → open chain time. */
async function waitForAutoOpenIdle(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForTimeout(600)
}

test("What's New auto-open lifecycle: fresh install, close, no re-trigger, at-most-once", async () => {
  const dir = makeUserDataDir()
  fs.rmSync(configPath(dir)) // fresh install: no config at all
  const whatsNew = (page: import('@playwright/test').Page) => page.locator('[data-tab-kind="whatsNew"]')

  try {
    const first = await launchApp(dir)
    try {
      const { app, page } = first
      const version = await app.evaluate(({ app }) => app.getVersion())

      await test.step('fires on fresh install, activated because the workspace is empty', async () => {
        await expect(whatsNew(page)).toHaveCount(1)
        await expect(page.getByTestId('active-tab')).toHaveAttribute('data-tab-kind', 'whatsNew')
        await expect(page.getByTestId('whatsnew-tab')).toBeVisible()
      })

      await test.step('writes lastSeenVersion on fire', async () => {
        await expect.poll(() => readConfig(dir)?.lastSeenVersion).toBe(version)
      })

      await test.step('closing the auto-opened tab does not re-trigger it this session', async () => {
        await whatsNew(page).locator('button').click()
        await expect(whatsNew(page)).toHaveCount(0)
        await waitForAutoOpenIdle(page)
        await expect(whatsNew(page)).toHaveCount(0)
        expect(readConfig(dir)?.lastSeenVersion).toBe(version)
      })
    } finally {
      await first.app.close()
    }

    await test.step('next launch (versions match) does not auto-open', async () => {
      const second = await launchApp(dir)
      try {
        await waitForAutoOpenIdle(second.page)
        await expect(whatsNew(second.page)).toHaveCount(0)
        await expect(second.page.locator('[data-tab-id]')).toHaveCount(0)
      } finally {
        await second.app.close()
      }
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  }
})

test("What's New auto-opens on a stale version; Help re-activates it without duplicating", async () => {
  const dir = makeUserDataDir()
  fs.writeFileSync(configPath(dir), JSON.stringify({ lastSeenVersion: '0.0.0-test-stale' }), 'utf8')

  try {
    const { app, page } = await launchApp(dir)
    try {
      const whatsNew = page.locator('[data-tab-kind="whatsNew"]')

      await test.step('fires and updates lastSeenVersion', async () => {
        await expect(whatsNew).toHaveCount(1)
        const version = await app.evaluate(({ app }) => app.getVersion())
        await expect.poll(() => readConfig(dir)?.lastSeenVersion).toBe(version)
      })

      await test.step("Help → What's New activates the existing tab instead of opening another", async () => {
        await seedBuffer(app, page) // another tab takes focus
        await expect(page.getByTestId('active-tab')).toHaveAttribute('data-tab-kind', 'file')
        await sendIPC(app, 'menu:whats-new-open')
        await expect(whatsNew).toHaveCount(1)
        await expect(page.locator('[data-testid="active-tab"][data-tab-kind="whatsNew"]')).toHaveCount(1)
        await expect(page.getByTestId('whatsnew-tab')).toBeVisible()
      })
    } finally {
      await app.close()
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  }
})

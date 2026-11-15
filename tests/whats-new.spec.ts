import { test, expect, sendIPC, IS_MAC } from './fixtures'

/**
 * "What's New" virtual tab, manual open via Help (.docs/features/whats-new-tab/tests.md, Tests
 * 1, 2, 7, 8, 11). Auto-open, focus-no-steal and session round-trip live in whats-new-autoopen /
 * whats-new-session.
 *
 * The spec deliberately does not import releaseNotes.tsx: it pulls in `CHANGELOG.md?raw`, which
 * Playwright's loader cannot resolve, and that breaks collection of the whole suite.
 */
test.use({ app: { seedBuffer: false } })

test("Help → What's New opens one foreground tab with the current release notes", async ({ electronApp, page }) => {
  await test.step('Help menu lists "What\'s New" first, without an accelerator, above About', async () => {
    const helpItems = await electronApp.evaluate(({ Menu }) => {
      const help = Menu.getApplicationMenu()?.items.find((i) => i.label === '&Help' || i.label === 'Help')
      return help?.submenu?.items.map((i) => ({ label: i.label, type: i.type, accelerator: i.accelerator ?? null })) ?? null
    })
    expect(helpItems).not.toBeNull()
    expect(helpItems![0]).toMatchObject({ label: "What's New", accelerator: null })
    // About lives in the App menu on macOS, so a separator follows instead
    if (IS_MAC) expect(helpItems![1].type).toBe('separator')
    else expect(helpItems![1].label).toBe('About NovaPad')
  })

  const tab = page.locator('[data-tab-kind="whatsNew"]')
  await test.step('opens in the foreground with a static title', async () => {
    await sendIPC(electronApp, 'menu:whats-new-open')
    await expect(tab).toHaveCount(1)
    expect(await tab.getAttribute('data-tab-title')).toBe("What's New")
    await expect(page.getByTestId('whatsnew-tab')).toBeVisible()
  })

  await test.step('a second Help click does not duplicate the tab', async () => {
    await sendIPC(electronApp, 'menu:whats-new-open')
    await expect(tab).toHaveCount(1)
  })

  await test.step('body shows the running version and its highlights', async () => {
    const body = page.getByTestId('whatsnew-tab')
    await expect(body.getByRole('heading', { name: "What's New" })).toHaveCount(2)
    const appVersion = await electronApp.evaluate(({ app }) => app.getVersion())
    await expect(body.getByText(`v${appVersion}`)).toBeVisible()
    const highlights = body.locator('ul > li > span.font-semibold')
    await expect(highlights.first()).toBeVisible()
  })
})

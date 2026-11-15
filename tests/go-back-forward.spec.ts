import fs from 'fs'
import path from 'path'
import type { ElectronApplication, Page } from 'playwright'
import { test, expect, sendIPC, tempDir, IS_MAC } from './fixtures'

/**
 * Go Back / Forward navigation history (toolbar buttons, keyboard, mouse side buttons).
 * No seeded Untitled buffer: the history must start empty with only real files involved.
 */
test.use({ app: { seedBuffer: false } })

/** Write temp files and open them via the main-process file-open IPC. */
async function seedFiles(app: ElectronApplication, page: Page, names: string[]): Promise<string> {
  const tmp = tempDir('gbf-')
  const paths = names.map((name) => {
    const p = path.join(tmp, name)
    fs.writeFileSync(p, Array.from({ length: 50 }, (_, i) => `${name}-line-${i + 1}`).join('\n'))
    return p
  })
  await sendIPC(app, 'menu:file-open', paths)
  for (const name of names) await page.waitForSelector(`[data-tab-title="${name}"]`, { timeout: 5_000 })
  await page.waitForSelector('.monaco-editor textarea', { timeout: 5_000 })
  // Small settle — EditorPane's model-swap effect runs asynchronously.
  await page.waitForTimeout(200)
  return tmp
}

async function clickTab(page: Page, name: string): Promise<void> {
  await page.locator(`[data-tab-title="${name}"]`).click()
  await page.waitForTimeout(200)
}

const activeTab = (page: Page) => page.locator('[data-testid="active-tab"]')

test.describe('Go Back / Forward', () => {
  test('initial state, tooltips, Settings adds no history', async ({ electronApp, page }) => {
    const back = page.locator('[data-testid="nav-back"]')
    const forward = page.locator('[data-testid="nav-forward"]')

    await test.step('icons are visible in the top strip', async () => {
      await expect(back).toBeVisible()
      await expect(forward).toBeVisible()
      await expect(page.locator('[data-testid="settings-menu-trigger"]')).toBeVisible()
    })

    await test.step('Back and Forward are disabled at launch (empty stacks)', async () => {
      await expect(back).toBeDisabled()
      await expect(forward).toBeDisabled()
    })

    await test.step('tooltips use the platform modifier', async () => {
      const backTitle = (await back.getAttribute('title')) ?? ''
      const forwardTitle = (await forward.getAttribute('title')) ?? ''
      if (IS_MAC) {
        expect(backTitle).toContain('⌃')
        expect(forwardTitle).toContain('⌃⇧')
        expect(backTitle).not.toContain('Alt')
      } else {
        expect(backTitle).toContain('Alt+Left')
        expect(forwardTitle).toContain('Alt+Right')
        expect(backTitle).not.toContain('⌃')
      }
    })

    await test.step('opening and closing Settings does not add back entries', async () => {
      const tmp = await seedFiles(electronApp, page, ['only.txt'])
      try {
        await expect(back).toBeDisabled()
        await page.locator('[data-testid="settings-menu-trigger"]').click()
        await page.locator('[data-testid="settings-menu-settings"]').click()
        await expect(page.locator('[data-testid="settings-tab"]')).toBeVisible()
        // The tab-switch push guards on kind === 'file' for BOTH source and destination.
        await expect(back).toBeDisabled()
        await clickTab(page, 'only.txt')
        // Still disabled: switching FROM a virtual tab doesn't push either.
        await expect(back).toBeDisabled()
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true })
      }
    })
  })

  test('Back/Forward via button, keyboard, mouse', async ({ electronApp, page }) => {
    const back = page.locator('[data-testid="nav-back"]')
    const forward = page.locator('[data-testid="nav-forward"]')
    const tmp = await seedFiles(electronApp, page, ['a.txt', 'b.txt'])
    try {
      await test.step('switching tabs enables Back; Back returns to the previous file', async () => {
        await clickTab(page, 'a.txt')
        await clickTab(page, 'b.txt')
        await expect(back).toBeEnabled()
        await back.click()
        await expect(activeTab(page)).toHaveAttribute('data-tab-title', 'a.txt')
        await expect(forward).toBeEnabled()
      })

      await test.step('Forward returns to the location Back came from', async () => {
        await forward.click()
        await expect(activeTab(page)).toHaveAttribute('data-tab-title', 'b.txt')
        await expect(forward).toBeDisabled()
      })

      await test.step('keyboard shortcut triggers Back and Forward', async () => {
        await page.locator('.monaco-editor textarea').first().focus()
        await page.keyboard.press(IS_MAC ? 'Control+-' : 'Alt+ArrowLeft')
        await expect(activeTab(page)).toHaveAttribute('data-tab-title', 'a.txt')
        await page.keyboard.press(IS_MAC ? 'Control+Shift+-' : 'Alt+ArrowRight')
        await expect(activeTab(page)).toHaveAttribute('data-tab-title', 'b.txt')
      })

      await test.step('mouse side buttons (button 3/4) trigger Back/Forward', async () => {
        const sideButton = (button: number) =>
          page.evaluate((b) => {
            document.documentElement.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: b }))
          }, button)
        await sideButton(3)
        await expect(activeTab(page)).toHaveAttribute('data-tab-title', 'a.txt')
        await sideButton(4)
        await expect(activeTab(page)).toHaveAttribute('data-tab-title', 'b.txt')
      })
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('Closed-tab entries are skipped during Back', async ({ electronApp, page }) => {
    const tmp = await seedFiles(electronApp, page, ['a.txt', 'b.txt', 'c.txt'])
    try {
      // Cycle through tabs to produce two back entries (b and a).
      await clickTab(page, 'a.txt')
      await clickTab(page, 'b.txt')
      await clickTab(page, 'c.txt')

      const bTab = page.locator('[data-tab-title="b.txt"]').first()
      await bTab.hover()
      await bTab.locator('button').click()
      await page.waitForTimeout(150)

      // Back should skip the stale b entry and land on a.
      await page.locator('[data-testid="nav-back"]').click()
      await expect(activeTab(page)).toHaveAttribute('data-tab-title', 'a.txt')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})

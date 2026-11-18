import fs from 'fs'
import path from 'path'
import { test, expect, sendIPC } from './fixtures'

/**
 * Settings tab preferences take effect and persist: Editor ▸ Show minimap toggles Monaco's
 * minimap; Appearance ▸ theme switches the `html.dark` class and is saved to config.json.
 * (Tab-bar filler double-click is covered by tab-dblclick-and-json-beautify.spec.ts.)
 */

test('Settings: minimap preference and theme persisted to config.json', async ({ electronApp, page, userDataDir }) => {
  await expect(page.locator('.monaco-editor .minimap')).not.toBeVisible() // off by default
  await sendIPC(electronApp, 'menu:settings-open')
  await expect(page.getByTestId('settings-tab')).toBeVisible()

  await test.step('Editor ▸ Show minimap turns on the Monaco minimap', async () => {
    await page.getByTestId('settings-category-editor').click()
    await page.getByRole('checkbox', { name: /Show minimap/i }).check()
    await page.locator('[data-tab-title="new 1"]').click()
    await expect(page.locator('.monaco-editor .minimap')).toBeVisible()
  })

  const htmlFontSize = (): Promise<string> => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)

  await test.step('Appearance ▸ Paper theme sets its own UI size and radius', async () => {
    await sendIPC(electronApp, 'menu:settings-open')
    await page.getByTestId('settings-category-appearance').click()
    await page.getByTestId('theme-current-row').click()
    await page.getByTestId('theme-card-paper').click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
    await expect.poll(htmlFontSize).toBe('14px')
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--radius-md')))
      .toBe('8px')
  })

  await test.step('Appearance ▸ Light theme drops html.dark and is written to config.json', async () => {
    await page.getByTestId('theme-card-light').click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
    // Paper-only tokens must not leak into the next theme.
    await expect.poll(htmlFontSize).toBe('13px')
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--radius-md'))).toBe('')

    const configPath = path.join(userDataDir, 'config', 'config.json')
    await expect
      .poll(() => {
        try {
          return (JSON.parse(fs.readFileSync(configPath, 'utf8')) as { theme?: string }).theme ?? null
        } catch {
          return null
        }
      })
      .toBe('light')
  })
})

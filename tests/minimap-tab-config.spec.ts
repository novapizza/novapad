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

  await test.step('Appearance ▸ Light theme drops html.dark and is written to config.json', async () => {
    await sendIPC(electronApp, 'menu:settings-open')
    await page.getByTestId('settings-category-appearance').click()
    await page.getByTestId('theme-current-row').click()
    await page.getByTestId('theme-card-light').click()
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)

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

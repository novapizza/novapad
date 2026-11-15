import { test, expect, seedBuffer, IS_MAC } from './fixtures'

/**
 * Shortcut labels use the platform modifier (⌘ on macOS, Ctrl elsewhere) on the Welcome screen,
 * toolbar tooltips and the custom MenuBar. Starts on the Welcome screen, then seeds a buffer.
 */
test.use({ app: { seedBuffer: false } })

const expectedMod = IS_MAC ? '⌘' : 'Ctrl'
const wrongMod = IS_MAC ? 'Ctrl' : '⌘'

test('shortcut labels use the platform modifier', async ({ electronApp, page }) => {
  await test.step('Welcome screen hints', async () => {
    // WelcomeScreen formats as "⌘N" on macOS, "Ctrl+N" elsewhere.
    await expect(page.getByText(IS_MAC ? '⌘N' : 'Ctrl+N', { exact: true })).toBeVisible()
    await expect(page.getByText(IS_MAC ? 'Ctrl+N' : '⌘N', { exact: true })).toHaveCount(0)
  })

  await seedBuffer(electronApp, page)
  const toolbar = page.getByTestId('toolbar')

  for (const name of ['Save', 'Find']) {
    await test.step(`toolbar ${name} tooltip`, async () => {
      await toolbar.getByRole('button', { name: new RegExp(`^${name} \\(`) }).hover()
      const tip = page.getByRole('tooltip').filter({ hasText: new RegExp(`^${name} \\(`) })
      await expect(tip).toBeVisible()
      await expect(tip).toContainText(expectedMod)
      await expect(tip).not.toContainText(wrongMod)
      await page.keyboard.press('Escape') // Radix keeps the tooltip open until dismissed
      await expect(tip).toHaveCount(0)
    })
  }

  await test.step('MenuBar dropdown shortcuts (Win/Linux only; native menu on macOS)', async () => {
    if (IS_MAC) return
    await page.getByTestId('menubar').getByRole('button', { name: 'File', exact: true }).click()
    await expect(page.getByRole('button', { name: /^New File/ })).toContainText(`${expectedMod}+N`)
  })
})
